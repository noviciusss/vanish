import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifySessionToken } from './jwt';
import { redis } from './redis';
import { prisma } from './prisma';
import {
  addToOnlinePool,
  removeFromOnlinePool,
  findMatchCandidate,
  getBlockedIds,
} from './matching';
import { checkRateLimit, RATE_LIMITS } from './ratelimit';
import { customAlphabet } from 'nanoid';

const generateRoomId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);

const DEFAULT_TTL = parseInt(process.env.MESSAGE_TTL_SECONDS || '21600', 10); // 6h default

/**
 * Escapes HTML characters to prevent XSS.
 */
export function sanitizeMessage(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .trim()
    .slice(0, 2000); // max 2000 chars per message
}

interface SocketData {
  identityId: string;
  currentRoomId?: string;
}

export function initializeSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    maxHttpBufferSize: 1e6, // 1MB payload ceiling
    pingTimeout: 20000,
    pingInterval: 10000,
  });

  // Track identityId to socket mapping for direct routing
  const userSockets = new Map<string, string>();

  // Socket authentication middleware
  io.use(async (socket: Socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie;
      let token = socket.handshake.auth?.token;

      if (!token && cookieHeader) {
        const cookies = Object.fromEntries(
          cookieHeader.split(';').map((c) => {
            const [k, ...v] = c.trim().split('=');
            return [k, v.join('=')];
          })
        );
        token = cookies['anon_session'];
      }

      if (!token) {
        return next(new Error('Authentication token missing'));
      }

      const payload = verifySessionToken(token);
      if (!payload?.identity_id) {
        return next(new Error('Invalid or expired session token'));
      }

      (socket.data as SocketData).identityId = payload.identity_id;
      next();
    } catch (err) {
      next(new Error('Socket authentication failed'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const identityId = (socket.data as SocketData).identityId;
    userSockets.set(identityId, socket.id);
    socket.join(`user:${identityId}`);

    // Fetch tags to seed matching pool if needed
    const profile = await prisma.profile.findUnique({
      where: { identityId },
    });
    const userTags = profile?.tags || [];

    // 1. MATCHING: request_match
    socket.on('request_match', async (data: { mode?: 'nearest' | 'random' }) => {
      try {
        const mode = data?.mode === 'random' ? 'random' : 'nearest';

        // Fetch fresh tags from DB
        const freshProfile = await prisma.profile.findUnique({
          where: { identityId },
        });
        const currentTags = freshProfile?.tags || [];

        // Add user to online pool
        await addToOnlinePool(identityId, currentTags);

        // Try to find candidate
        const candidate = await findMatchCandidate(identityId, mode);

        if (candidate) {
          const peerSocketId = userSockets.get(candidate.peerId);
          if (peerSocketId && io.sockets.sockets.has(peerSocketId)) {
            // Remove both from available pool
            await removeFromOnlinePool(identityId);
            await removeFromOnlinePool(candidate.peerId);

            // Notify requester of candidate match
            socket.emit('match_found', {
              target_id: candidate.peerId,
              score: candidate.score,
            });

            // Automatically send chat_request to target
            io.to(`user:${candidate.peerId}`).emit('chat_request_received', {
              from_id: identityId,
              shared_score: candidate.score,
            });
            return;
          } else {
            // Clean up offline peer from pool
            await removeFromOnlinePool(candidate.peerId);
          }
        }

        socket.emit('waiting_for_match', { mode });
      } catch (err) {
        console.error('Error in request_match:', err);
        socket.emit('error', { message: 'Matching failed' });
      }
    });

    // Cancel match search
    socket.on('cancel_match', async () => {
      await removeFromOnlinePool(identityId);
      socket.emit('match_cancelled');
    });

    // 2. CHAT REQUEST: client -> server
    socket.on('chat_request', async (data: { target_id: string }) => {
      try {
        const targetId = data?.target_id;
        if (!targetId || targetId === identityId) return;

        // Rate limit: 10 requests / hour
        const rateLimit = await checkRateLimit(
          identityId,
          'chat_request',
          RATE_LIMITS.CHAT_REQUEST.max,
          RATE_LIMITS.CHAT_REQUEST.window
        );

        if (!rateLimit.allowed) {
          socket.emit('error', {
            message: `Rate limit: Maximum ${RATE_LIMITS.CHAT_REQUEST.max} chat requests per hour.`,
          });
          return;
        }

        // Check if blocked
        const blocked = await getBlockedIds(identityId);
        if (blocked.has(targetId)) {
          socket.emit('error', { message: 'Cannot connect to this user.' });
          return;
        }

        io.to(`user:${targetId}`).emit('chat_request_received', {
          from_id: identityId,
        });
      } catch (err) {
        console.error('chat_request error:', err);
      }
    });

    // 3. CHAT ACCEPT: client -> server
    socket.on('chat_accept', async (data: { from_id: string }) => {
      try {
        const fromId = data?.from_id;
        if (!fromId || fromId === identityId) return;

        const roomId = `room_${generateRoomId()}`;

        // Initialize room in Redis (participants set + TTL)
        const participantsKey = `room:${roomId}:participants`;
        const messagesKey = `room:${roomId}:messages`;

        await redis.sadd(participantsKey, identityId, fromId);
        await redis.expire(participantsKey, DEFAULT_TTL);
        await redis.expire(messagesKey, DEFAULT_TTL);

        // Put both users into the socket room
        socket.join(roomId);
        (socket.data as SocketData).currentRoomId = roomId;

        const fromSocketId = userSockets.get(fromId);
        if (fromSocketId) {
          const fromSocket = io.sockets.sockets.get(fromSocketId);
          if (fromSocket) {
            fromSocket.join(roomId);
            (fromSocket.data as SocketData).currentRoomId = roomId;
          }
        }

        // Broadcast room_ready to both
        io.to(roomId).emit('room_ready', {
          room_id: roomId,
          participants: [identityId, fromId],
        });
      } catch (err) {
        console.error('chat_accept error:', err);
      }
    });

    // 4. JOIN ROOM (Direct code join)
    socket.on('join_room', async (data: { room_id: string }) => {
      try {
        const roomId = data?.room_id?.trim();
        if (!roomId) return;

        const participantsKey = `room:${roomId}:participants`;

        // Check room participant count (Max 3 participants strictly enforced)
        const currentCount = await redis.scard(participantsKey);
        const isMember = await redis.sismember(participantsKey, identityId);

        if (!isMember && currentCount >= 3) {
          socket.emit('room_error', {
            message: 'Room is full. Maximum 3 participants allowed.',
          });
          return;
        }

        // Add to Redis participants set
        await redis.sadd(participantsKey, identityId);
        await redis.expire(participantsKey, DEFAULT_TTL);

        socket.join(roomId);
        (socket.data as SocketData).currentRoomId = roomId;

        const participants = await redis.smembers(participantsKey);

        // Fetch past ephemeral messages for this room
        const messagesKey = `room:${roomId}:messages`;
        const rawMessages = await redis.lrange(messagesKey, 0, -1);
        const pastMessages = rawMessages.map((m) => JSON.parse(m));

        socket.emit('room_joined', {
          room_id: roomId,
          participants,
          messages: pastMessages,
        });

        // Notify other room participants
        socket.to(roomId).emit('peer_joined', {
          room_id: roomId,
          peer_id: identityId,
          participants,
        });
      } catch (err) {
        console.error('join_room error:', err);
      }
    });

    // 5. SEND MESSAGE: client -> server
    socket.on('send_message', async (data: { room_id: string; text: string }) => {
      try {
        const roomId = data?.room_id;
        const rawText = data?.text;

        if (!roomId || !rawText || typeof rawText !== 'string') return;

        // Rate limiting: max 30 messages per minute
        const rateLimit = await checkRateLimit(
          identityId,
          'message',
          RATE_LIMITS.SEND_MESSAGE.max,
          RATE_LIMITS.SEND_MESSAGE.window
        );

        if (!rateLimit.allowed) {
          socket.emit('error', {
            message: `Message rate limit reached. Slow down! (${rateLimit.resetInSeconds}s reset)`,
          });
          return;
        }

        // Room membership authorization check
        const participantsKey = `room:${roomId}:participants`;
        const isMember = await redis.sismember(participantsKey, identityId);
        if (!isMember) {
          socket.emit('error', { message: 'Unauthorized: You are not in this room.' });
          return;
        }

        // HTML-escape & sanitize text
        const sanitizedText = sanitizeMessage(rawText);
        if (!sanitizedText) return;

        const messagePayload = {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          room_id: roomId,
          from_id: identityId,
          text: sanitizedText,
          ts: Date.now(),
        };

        // Ephemeral storage in Redis (never touches Postgres)
        const messagesKey = `room:${roomId}:messages`;
        await redis.rpush(messagesKey, JSON.stringify(messagePayload));
        await redis.expire(messagesKey, DEFAULT_TTL);

        // Broadcast to everyone in room (including sender)
        io.to(roomId).emit('message_received', messagePayload);
      } catch (err) {
        console.error('send_message error:', err);
      }
    });

    // 6. LEAVE ROOM: client -> server
    socket.on('leave_room', async (data: { room_id: string }) => {
      try {
        const roomId = data?.room_id || (socket.data as SocketData).currentRoomId;
        if (!roomId) return;

        const participantsKey = `room:${roomId}:participants`;
        await redis.srem(participantsKey, identityId);

        socket.leave(roomId);
        (socket.data as SocketData).currentRoomId = undefined;

        // Notify remaining participants
        io.to(roomId).emit('peer_left', {
          room_id: roomId,
          peer_id: identityId,
        });

        socket.emit('left_room_ack', { room_id: roomId });
      } catch (err) {
        console.error('leave_room error:', err);
      }
    });

    // 7. REPORT USER: client -> server
    socket.on('report_user', async (data: { room_id: string; target_id: string }) => {
      try {
        const roomId = data?.room_id;
        const targetId = data?.target_id;

        if (!targetId || targetId === identityId) return;

        // 1. Instantly write block to Postgres
        await prisma.block.upsert({
          where: {
            reporterId_blockedId: {
              reporterId: identityId,
              blockedId: targetId,
            },
          },
          update: {},
          create: {
            reporterId: identityId,
            blockedId: targetId,
          },
        });

        // 2. Remove reporter from room
        if (roomId) {
          const participantsKey = `room:${roomId}:participants`;
          await redis.srem(participantsKey, identityId);
          socket.leave(roomId);
          (socket.data as SocketData).currentRoomId = undefined;

          io.to(roomId).emit('peer_left', {
            room_id: roomId,
            peer_id: identityId,
          });
        }

        // 3. Ack report to reporter
        socket.emit('report_ack', {
          blocked_id: targetId,
          message: 'User blocked and reported.',
        });
      } catch (err) {
        console.error('report_user error:', err);
      }
    });

    // Disconnect cleanup
    socket.on('disconnect', async () => {
      userSockets.delete(identityId);
      await removeFromOnlinePool(identityId);

      const roomId = (socket.data as SocketData).currentRoomId;
      if (roomId) {
        const participantsKey = `room:${roomId}:participants`;
        await redis.srem(participantsKey, identityId);
        io.to(roomId).emit('peer_left', {
          room_id: roomId,
          peer_id: identityId,
        });
      }
    });
  });

  return io;
}
