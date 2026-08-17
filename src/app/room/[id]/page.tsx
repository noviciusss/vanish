'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import io, { Socket } from 'socket.io-client';
import { ChatRoom, ChatMessage } from '@/components/ChatRoom';
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params?.id as string;

  const [identityId, setIdentityId] = useState<string>('');
  const [participants, setParticipants] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch('/api/auth/session', { method: 'POST' });
        const data = await res.json();
        if (data.identity_id) {
          setIdentityId(data.identity_id);
        }
      } catch (err) {
        console.error('Session error:', err);
      }
    }
    init();
  }, []);

  useEffect(() => {
    if (!identityId || !roomId) return;

    const socket = io({
      withCredentials: true,
      autoConnect: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_room', { room_id: roomId });
    });

    socket.on('room_joined', (data: { room_id: string; participants: string[]; messages: any[] }) => {
      setLoading(false);
      setParticipants(data.participants);
      if (data.messages && data.messages.length > 0) {
        setMessages(data.messages);
      } else {
        setMessages([
          {
            id: `sys_${Date.now()}`,
            room_id: roomId,
            from_id: 'system',
            text: 'Joined ephemeral chat room.',
            ts: Date.now(),
            isSystem: true,
          },
        ]);
      }
    });

    socket.on('peer_joined', (data: { peer_id: string; participants: string[] }) => {
      setParticipants(data.participants);
      setMessages((prev) => [
        ...prev,
        {
          id: `sys_${Date.now()}`,
          room_id: data.peer_id,
          from_id: 'system',
          text: `${data.peer_id} entered the room.`,
          ts: Date.now(),
          isSystem: true,
        },
      ]);
    });

    socket.on('message_received', (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on('peer_left', (data: { peer_id: string }) => {
      setParticipants((prev) => prev.filter((p) => p !== data.peer_id));
      setMessages((prev) => [
        ...prev,
        {
          id: `sys_${Date.now()}`,
          room_id: '',
          from_id: 'system',
          text: `${data.peer_id} left the chat.`,
          ts: Date.now(),
          isSystem: true,
        },
      ]);
    });

    socket.on('room_error', (data: { message: string }) => {
      setErrorMsg(data.message);
      setLoading(false);
    });

    socket.on('report_ack', () => {
      router.push('/');
    });

    return () => {
      socket.disconnect();
    };
  }, [identityId, roomId, router]);

  const handleSendMessage = (text: string) => {
    socketRef.current?.emit('send_message', { room_id: roomId, text });
  };

  const handleLeaveRoom = () => {
    socketRef.current?.emit('leave_room', { room_id: roomId });
    router.push('/');
  };

  const handleLeaveAndFindNew = () => {
    socketRef.current?.emit('leave_room', { room_id: roomId });
    router.push('/?action=find_new');
  };

  const handleReportUser = (targetId: string) => {
    socketRef.current?.emit('report_user', { room_id: roomId, target_id: targetId });
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-cyan-300" />
          <p className="text-xs font-mono">Connecting to ephemeral room...</p>
        </div>
      </main>
    );
  }

  if (errorMsg) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="glass-panel max-w-sm w-full p-6 rounded-3xl text-center">
          <h2 className="font-heading font-semibold text-lg text-foreground mb-2">
            Unable to Join Room
          </h2>
          <p className="text-xs text-muted-foreground mb-6">{errorMsg}</p>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 text-xs font-bold w-full"
          >
            Back to Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-3 py-4 sm:px-6 sm:py-8 text-foreground">
      <div className="w-full max-w-3xl">
        <div className="mb-3 flex items-center justify-between px-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition"
          >
            <ArrowLeft className="size-3.5" />
            <span>Leave to home</span>
          </Link>
          <span className="text-[11px] font-mono text-muted-foreground">
            Room: <span className="text-cyan-300 font-semibold">{roomId}</span>
          </span>
        </div>

        <ChatRoom
          roomId={roomId}
          myIdentityId={identityId}
          participants={participants}
          messages={messages}
          onSendMessage={handleSendMessage}
          onLeaveRoom={handleLeaveRoom}
          onLeaveAndFindNew={handleLeaveAndFindNew}
          onReportUser={handleReportUser}
        />
      </div>
    </main>
  );
}
