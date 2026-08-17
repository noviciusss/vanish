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
            return [k, decodeURIComponent(v.join('='))];
          })
        );
        token = cookies['anon_session'];
      }

      if (!token) {
        return next(new Error('Authentication failed: Missing session token'));
      }

      const payload = await verifySessionToken(token);
      if (!payload || !payload.identity_id) {
        return next(new Error('Authentication failed: Invalid or expired token'));
      }

      (socket.data as SocketData).identityId = payload.identity_id;
      next();
    } catch (err) {
      console.error('Socket auth error:', err);
      next(new Error('Authentication failed: Internal error'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const identityId = (socket.data as SocketData).identityId;
    userSockets.set(identityId, socket.id);

    // Join personal room for 1-to-1 notifications (match requests, etc.)
    socket.join(`user:${identityId}`);

    // Register user in the transient Redis online pool with their saved tags
    try {
      const profile = await prisma.profile.findUnique({
        where: { identityId },
        select: { tags: true },
      });
      await addToOnlinePool(identityId, profile?.tags || [], 'any');
    } catch (err) {
      console.error('Error adding user to pool:', err);
    }

    // 1. MATCH REQUEST: client -> server
    socket.on(
      'request_match',
      async (data?: { mode?: 'nearest' | 'random'; lang?: string }) => {
        try {
          const mode = data?.mode || 'nearest';
          const lang = data?.lang || 'any';

          // Update pool info with preferred language
          const profile = await prisma.profile.findUnique({
            where: { identityId },
            select: { tags: true },
          });
          await addToOnlinePool(identityId, profile?.tags || [], lang);

          // Find candidate match in Redis
          const match = await findMatchCandidate(identityId, mode, lang);

          if (!match) {
            socket.emit('match_status', {
              status: 'searching',
              message: 'Scanning for active strangers...',
            });
            return;
          }

          // Check if candidate is currently online in Socket.io
          const targetSocketId = userSockets.get(match.peerId);
          if (!targetSocketId || !io.sockets.sockets.has(targetSocketId)) {
            // Stale candidate in Redis, purge and inform client
            await removeFromOnlinePool(match.peerId);
            socket.emit('match_status', {
              status: 'searching',
              message: 'Looking for available peer...',
            });
            return;
          }

          // Found eligible peer! Send chat request for mutual consent
          io.to(`user:${match.peerId}`).emit('chat_request_received', {
            from_id: identityId,
            overlap_score: Math.round(match.score * 100),
          });

          socket.emit('match_status', {
            status: 'found_candidate',
            peer_id: match.peerId,
            overlap_score: Math.round(match.score * 100),
          });
        } catch (err) {
          console.error('request_match error:', err);
          socket.emit('error', { message: 'Failed to process matching.' });
        }
      }
    );

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

    // 5. E2EE PUBLIC KEY EXCHANGE
    socket.on(
      'key_exchange',
      (data: { room_id: string; publicKeyJwk: any }) => {
        const roomId = data?.room_id;
        if (!roomId || !data?.publicKeyJwk) return;

        socket.to(roomId).emit('peer_key_received', {
          from_id: identityId,
          publicKeyJwk: data.publicKeyJwk,
        });
      }
    );

    // 6. TYPING INDICATORS (Tier 2)
    socket.on('typing_start', (data: { room_id: string }) => {
      const roomId = data?.room_id;
      if (!roomId) return;
      socket.to(roomId).emit('peer_typing_start', { from_id: identityId });
    });

    socket.on('typing_stop', (data: { room_id: string }) => {
      const roomId = data?.room_id;
      if (!roomId) return;
      socket.to(roomId).emit('peer_typing_stop', { from_id: identityId });
    });

    // 7. SEND MESSAGE: client -> server
    socket.on(
      'send_message',
      async (data: {
        room_id: string;
        text?: string;
        ciphertext?: string;
        iv?: string;
        isEncrypted?: boolean;
        timerSeconds?: number;
      }) => {
        try {
          const roomId = data?.room_id;
          const rawText = data?.text || data?.ciphertext;

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

          // Sanitize plaintext or ciphertext representation
          const sanitizedText = data?.isEncrypted ? rawText : sanitizeMessage(rawText);
          if (!sanitizedText) return;

          const messagePayload = {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            room_id: roomId,
            from_id: identityId,
            text: sanitizedText,
            ciphertext: data?.ciphertext || '',
            iv: data?.iv || '',
            isEncrypted: Boolean(data?.isEncrypted),
            timerSeconds: data?.timerSeconds || 0,
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
      }
    );

    // 8. VOICE NOTE (Tier 2)
    socket.on(
      'send_voice_note',
      async (data: { room_id: string; audioBase64: string; duration: number }) => {
        try {
          const roomId = data?.room_id;
          const audioBase64 = data?.audioBase64;

          if (!roomId || !audioBase64 || typeof audioBase64 !== 'string') return;
          if (audioBase64.length > 250000) {
            socket.emit('error', { message: 'Voice clip too large (max 10s).' });
            return;
          }

          const participantsKey = `room:${roomId}:participants`;
          const isMember = await redis.sismember(participantsKey, identityId);
          if (!isMember) return;

          const voicePayload = {
            id: `voice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            room_id: roomId,
            from_id: identityId,
            audioBase64,
            duration: Math.min(10, Math.round(data?.duration || 0)),
            isVoice: true,
            ts: Date.now(),
          };

          io.to(roomId).emit('voice_received', voicePayload);
        } catch (err) {
          console.error('send_voice_note error:', err);
        }
      }
    );

    // 9. BURN MESSAGE (Tier 1 Disappearing messages)
    socket.on('burn_message', (data: { room_id: string; message_id: string }) => {
      const roomId = data?.room_id;
      const msgId = data?.message_id;
      if (!roomId || !msgId) return;

      io.to(roomId).emit('message_burned', { message_id: msgId });
    });

    // 10. LEAVE ROOM (Unilateral Exit)
    socket.on('leave_room', async (data: { room_id: string }) => {
      try {
        const roomId = data?.room_id;
        if (!roomId) return;

        const participantsKey = `room:${roomId}:participants`;
        await redis.srem(participantsKey, identityId);

        socket.leave(roomId);
        (socket.data as SocketData).currentRoomId = undefined;

        socket.to(roomId).emit('peer_left', { peer_id: identityId });
        socket.emit('left_room_ack');

        // If no one is left, trigger key expiry
        const remaining = await redis.scard(participantsKey);
        if (remaining === 0) {
          await redis.expire(participantsKey, 60);
          await redis.expire(`room:${roomId}:messages`, 60);
        }
      } catch (err) {
        console.error('leave_room error:', err);
      }
    });

    // 11. REPORT & BLOCK USER
    socket.on('report_user', async (data: { room_id: string; target_id: string }) => {
      try {
        const targetId = data?.target_id;
        const roomId = data?.room_id;
        if (!targetId || targetId === identityId) return;

        // Persist permanent block pair in PostgreSQL
        await prisma.block.createMany({
          data: [{ reporterId: identityId, blockedId: targetId }],
          skipDuplicates: true,
        });

        // Eject reporter from room
        if (roomId) {
          await redis.srem(`room:${roomId}:participants`, identityId);
          socket.leave(roomId);
          socket.to(roomId).emit('peer_left', { peer_id: identityId });
        }

        socket.emit('report_ack', {
          message: `User ${targetId} has been reported and blocked permanently.`,
        });
      } catch (err) {
        console.error('report_user error:', err);
      }
    });

    // DISCONNECT CLEANUP
    socket.on('disconnect', async () => {
      userSockets.delete(identityId);
      await removeFromOnlinePool(identityId);

      const currentRoomId = (socket.data as SocketData).currentRoomId;
      if (currentRoomId) {
        const participantsKey = `room:${currentRoomId}:participants`;
        await redis.srem(participantsKey, identityId);
        socket.to(currentRoomId).emit('peer_left', { peer_id: identityId });

        const remaining = await redis.scard(participantsKey);
        if (remaining === 0) {
          await redis.expire(participantsKey, 60);
          await redis.expire(`room:${currentRoomId}:messages`, 60);
        }
      }
    });
  });

  return io;
}
