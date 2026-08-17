'use client';

import React, { useState, useEffect, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import {
  ArrowUpRight,
  Check,
  Clock3,
  Fingerprint,
  Ghost,
  ShieldCheck,
  Sparkles,
  Users,
  Radio,
  RefreshCw,
  KeyRound,
  Hash,
  Info,
  ChevronDown,
} from 'lucide-react';
import { TagPicker } from '@/components/TagPicker';
import { MatchController } from '@/components/MatchController';
import { ChatRoom, ChatMessage } from '@/components/ChatRoom';
import { FixedIdModal } from '@/components/FixedIdModal';

export const dynamic = 'force-dynamic';

const features = [
  {
    icon: Fingerprint,
    eyebrow: 'Identity, reimagined',
    title: 'A new identity every time',
    description:
      'No profiles, no history. A rotating anonymous ID keeps every conversation separate from the last.',
    className: 'md:col-span-2',
    detail: (identityId: string) => (
      <div className="mt-8 flex items-center gap-3 text-sm text-muted-foreground">
        <span className="flex size-8 items-center justify-center rounded-full border border-border bg-background/60 text-foreground">
          <Ghost aria-hidden="true" className="size-4" />
        </span>
        <span className="font-mono text-xs tracking-wide">{identityId || 'stranger_7f2a'}</span>
        <span className="ml-auto rounded-full border border-success/20 bg-success/10 px-2.5 py-1 text-[11px] text-success">
          fresh ID
        </span>
      </div>
    ),
  },
  {
    icon: Users,
    eyebrow: 'Your choice, always',
    title: 'You choose who to talk to',
    description:
      'See the vibe before you connect. Start a conversation only when it feels right with mutual consent.',
    className: '',
    detail: (
      <div className="mt-8 flex items-center gap-2">
        <span className="size-2 rounded-full bg-success shadow-[0_0_12px_var(--success)]" />
        <span className="text-xs text-muted-foreground">Realtime ephemeral pool</span>
      </div>
    ),
  },
  {
    icon: Clock3,
    eyebrow: 'Nothing to carry',
    title: 'Messages disappear automatically',
    description:
      'When the conversation ends, it ends. No archives, no awkward receipts, no digital trail.',
    className: '',
    detail: (
      <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
        <Check aria-hidden="true" className="size-4 text-success" />
        <span>Clean slate, every time</span>
      </div>
    ),
  },
];

export default function Page() {
  const [identityId, setIdentityId] = useState<string>('');
  const [isFixed, setIsFixed] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  // Match & Room states
  const [isSearching, setIsSearching] = useState(false);
  const [matchMode, setMatchMode] = useState<'nearest' | 'random'>('nearest');
  const [incomingRequest, setIncomingRequest] = useState<{
    from_id: string;
    shared_score?: number;
  } | null>(null);

  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [roomParticipants, setRoomParticipants] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Direct code room join input
  const [directRoomInput, setDirectRoomInput] = useState('');

  // Modals & Notifications
  const [showPassphraseModal, setShowPassphraseModal] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const chatSectionRef = useRef<HTMLDivElement | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const scrollToChat = () => {
    chatSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 1. Bootstrapping Anonymous Session
  useEffect(() => {
    async function initSession() {
      try {
        const res = await fetch('/api/auth/session', { method: 'POST' });
        const data = await res.json();
        if (data.identity_id) {
          setIdentityId(data.identity_id);
          setIsFixed(Boolean(data.is_fixed));
          setTags(data.tags || []);
        }
      } catch (err) {
        console.error('Session initialization failed:', err);
      } finally {
        setIsLoadingAuth(false);
      }
    }
    initSession();
  }, []);

  // 2. Initialize Socket.io Connection once identity is available
  useEffect(() => {
    if (!identityId) return;

    const socket = io({
      withCredentials: true,
      autoConnect: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      setIsSearching(false);
    });

    // Matching events
    socket.on('waiting_for_match', () => {
      setIsSearching(true);
    });

    socket.on('match_found', (data) => {
      setIsSearching(false);
      showToast(`Stranger match found (${data.target_id})! Connecting...`);
    });

    socket.on('match_cancelled', () => {
      setIsSearching(false);
    });

    socket.on('chat_request_received', (data: { from_id: string; shared_score?: number }) => {
      setIsSearching(false);
      setIncomingRequest(data);
      scrollToChat();
    });

    socket.on('room_ready', (data: { room_id: string; participants: string[] }) => {
      setIsSearching(false);
      setIncomingRequest(null);
      setCurrentRoomId(data.room_id);
      setRoomParticipants(data.participants);
      setMessages([
        {
          id: `sys_${Date.now()}`,
          room_id: data.room_id,
          from_id: 'system',
          text: 'Connected with stranger. Ephemeral room created.',
          ts: Date.now(),
          isSystem: true,
        },
      ]);
      scrollToChat();
    });

    socket.on('room_joined', (data: { room_id: string; participants: string[]; messages: any[] }) => {
      setCurrentRoomId(data.room_id);
      setRoomParticipants(data.participants);
      setMessages(
        data.messages && data.messages.length > 0
          ? data.messages
          : [
              {
                id: `sys_${Date.now()}`,
                room_id: data.room_id,
                from_id: 'system',
                text: 'Joined room. Say hello!',
                ts: Date.now(),
                isSystem: true,
              },
            ]
      );
      scrollToChat();
    });

    socket.on('peer_joined', (data: { peer_id: string; participants: string[] }) => {
      setRoomParticipants(data.participants);
      setMessages((prev) => [
        ...prev,
        {
          id: `sys_${Date.now()}`,
          room_id: data.peer_id,
          from_id: 'system',
          text: `${data.peer_id} joined the room.`,
          ts: Date.now(),
          isSystem: true,
        },
      ]);
    });

    socket.on('message_received', (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on('voice_received', (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on('peer_left', (data: { peer_id: string }) => {
      setRoomParticipants((prev) => prev.filter((p) => p !== data.peer_id));
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

    socket.on('left_room_ack', () => {
      setCurrentRoomId(null);
      setRoomParticipants([]);
      setMessages([]);
    });

    socket.on('report_ack', (data: { blocked_id: string; message: string }) => {
      setCurrentRoomId(null);
      setRoomParticipants([]);
      setMessages([]);
      showToast(data.message || 'User reported and blocked.');
    });

    socket.on('error', (data: { message: string }) => {
      showToast(data.message);
    });

    socket.on('room_error', (data: { message: string }) => {
      showToast(data.message);
    });

    return () => {
      socket.disconnect();
    };
  }, [identityId]);

  // Handle Tag Updating
  const handleSaveTags = async (newTags: string[]): Promise<boolean> => {
    const res = await fetch('/api/profile/tags', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: newTags }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update tags');
    }
    setTags(data.tags);
    return true;
  };

  // Handle Identity Rotation
  const handleRotateIdentity = async () => {
    try {
      const res = await fetch('/api/auth/rotate', { method: 'POST' });
      const data = await res.json();
      if (data.identity_id) {
        setIdentityId(data.identity_id);
        setIsFixed(false);
        setTags([]);
        showToast('Identity rotated! Fresh anonymous ID active.');
      }
    } catch (err) {
      showToast('Failed to rotate identity');
    }
  };

  // Matching actions
  const handleStartSearch = (mode: 'nearest' | 'random', lang: string = 'any') => {
    setMatchMode(mode);
    setIsSearching(true);
    socketRef.current?.emit('request_match', { mode, lang });
    scrollToChat();
  };

  const handleCancelSearch = () => {
    setIsSearching(false);
    socketRef.current?.emit('cancel_match');
  };

  const handleAcceptRequest = (from_id: string) => {
    socketRef.current?.emit('chat_accept', { from_id });
  };

  const handleDeclineRequest = () => {
    setIncomingRequest(null);
    socketRef.current?.emit('request_match', { mode: matchMode });
  };

  // Direct Room Code Join
  const handleJoinDirectRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const code = directRoomInput.trim();
    if (!code) return;
    socketRef.current?.emit('join_room', { room_id: code });
    setDirectRoomInput('');
    scrollToChat();
  };

  // Chat Room Actions
  const handleSendMessage = (payload: {
    text: string;
    ciphertext?: string;
    iv?: string;
    isEncrypted?: boolean;
    timerSeconds?: number;
  }) => {
    if (!currentRoomId) return;
    socketRef.current?.emit('send_message', { room_id: currentRoomId, ...payload });
  };

  const handleSendVoiceNote = (audioBase64: string, duration: number) => {
    if (!currentRoomId) return;
    socketRef.current?.emit('send_voice_note', {
      room_id: currentRoomId,
      audioBase64,
      duration,
    });
  };

  const handleLeaveRoom = () => {
    if (!currentRoomId) return;
    socketRef.current?.emit('leave_room', { room_id: currentRoomId });
    setCurrentRoomId(null);
    setRoomParticipants([]);
    setMessages([]);
  };

  const handleLeaveAndFindNew = () => {
    if (currentRoomId) {
      socketRef.current?.emit('leave_room', { room_id: currentRoomId });
    }
    setCurrentRoomId(null);
    setRoomParticipants([]);
    setMessages([]);
    handleStartSearch(matchMode);
  };

  const handleReportUser = (targetId: string) => {
    if (!currentRoomId) return;
    socketRef.current?.emit('report_user', {
      room_id: currentRoomId,
      target_id: targetId,
    });
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Background Grids & Orbs */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-15rem] size-[42rem] -translate-x-1/2 rounded-full bg-violet/10 blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-18rem] right-[-8rem] size-[32rem] rounded-full bg-cyan/10 blur-[130px]"
      />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-5 pb-14 sm:px-8 lg:px-12">
        {/* HEADER */}
        <header className="flex items-center justify-between py-6 sm:py-8 border-b border-border/40">
          <a href="#top" className="flex items-center gap-2.5" aria-label="Vanish home">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet to-cyan shadow-[0_0_24px_var(--violet-glow)]">
              <Sparkles aria-hidden="true" className="size-4 text-background" />
            </span>
            <span className="font-heading text-base font-bold tracking-tight">vanish</span>
          </a>

          {/* Identity & Status Badges */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Live Socket Status */}
            <div
              className="flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur-md"
              title={isConnected ? 'Realtime socket live' : 'Connecting...'}
            >
              <span
                className={`size-1.5 rounded-full ${
                  isConnected
                    ? 'bg-success shadow-[0_0_10px_var(--success)]'
                    : 'bg-amber-400 animate-pulse'
                }`}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">{isConnected ? 'live pool' : 'connecting'}</span>
            </div>

            {/* User Anonymous ID */}
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card/80 px-3 py-1.5 text-xs">
              <Ghost className="size-3.5 text-violet" />
              <span className="font-mono font-semibold text-foreground tracking-wide">
                {identityId || 'generating...'}
              </span>
              {isFixed && (
                <span className="rounded bg-violet/20 px-1 py-0.5 text-[9px] font-medium text-violet border border-violet/30">
                  Fixed
                </span>
              )}
            </div>

            {/* Rotate ID */}
            <button
              onClick={handleRotateIdentity}
              title="Rotate to new anonymous ID (zero trail)"
              className="flex items-center gap-1 rounded-xl border border-border bg-card/80 hover:bg-card hover:border-violet/40 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition"
            >
              <RefreshCw className="size-3.5" />
              <span className="hidden sm:inline">Rotate</span>
            </button>

            {/* Fix ID Option */}
            <button
              onClick={() => setShowPassphraseModal(true)}
              title="Set recovery passphrase to remember this ID"
              className="flex items-center gap-1 rounded-xl border border-border bg-card/80 hover:bg-card hover:border-cyan/40 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition"
            >
              <KeyRound className="size-3.5" />
              <span className="hidden sm:inline">{isFixed ? 'Fixed ID' : 'Fix ID'}</span>
            </button>

            {/* Tag Setup Link */}
            <a
              href="/setup"
              title="Pick interest topics"
              className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.05] hover:bg-white/[0.1] px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition"
            >
              <span>Interests</span>
            </a>

            {/* Onboarding Space Link */}
            <a
              href="/onboarding"
              title="Go to Identity Space setup"
              className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.05] hover:bg-white/[0.1] px-2.5 py-1.5 text-xs text-cyan-300 transition"
            >
              <Sparkles className="size-3.5" />
              <span className="hidden sm:inline">My Space</span>
            </a>
          </div>
        </header>

        {/* HERO SECTION */}
        <section
          id="top"
          className="flex flex-1 flex-col items-center justify-center py-14 text-center sm:py-20 lg:py-24"
        >
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3.5 py-2 text-xs text-muted-foreground backdrop-blur-md">
            <ShieldCheck aria-hidden="true" className="size-3.5 text-cyan" />
            <span>Private by design</span>
          </div>

          <h1 className="max-w-4xl font-heading text-5xl font-semibold leading-[1.04] tracking-[-0.055em] text-balance sm:text-7xl lg:text-[6.5rem]">
            Talk to someone.
            <span className="block bg-gradient-to-r from-violet to-cyan bg-clip-text text-transparent">
              Leave nothing behind.
            </span>
          </h1>

          <p className="mt-7 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            Anonymous, ephemeral conversations with strangers — built around consent, curiosity, and
            a clean exit whenever you want one.
          </p>

          <div className="mt-9 flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={scrollToChat}
              className="group inline-flex items-center gap-3 rounded-xl bg-gradient-to-r from-violet to-cyan px-6 py-3.5 text-sm font-semibold text-background shadow-[0_8px_32px_var(--violet-glow)] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan cursor-pointer"
            >
              Start Chatting
              <ArrowUpRight
                aria-hidden="true"
                className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </button>

            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/50 hover:bg-card/80 px-4 py-3.5 text-sm font-medium text-muted-foreground hover:text-foreground transition"
            >
              How it works
              <ChevronDown className="size-4" />
            </a>
          </div>

          <p className="mt-4 text-xs text-muted-foreground/70">
            No account. No profile. Just a conversation.
          </p>
        </section>

        {/* INTERACTIVE CHAT & MATCHING WORKSPACE SECTION */}
        <section
          ref={chatSectionRef}
          id="chat-workspace"
          className="my-8 scroll-mt-24 rounded-3xl border border-border/70 bg-card/40 p-5 sm:p-8 backdrop-blur-2xl shadow-2xl"
        >
          <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border/50 pb-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan">
                Live Terminal
              </p>
              <h2 className="font-heading text-xl sm:text-2xl font-bold tracking-tight">
                {currentRoomId ? 'Active Ephemeral Room' : 'Start an Anonymous Connection'}
              </h2>
            </div>

            {/* Quick status blurb */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
              <Radio className="size-3.5 text-violet animate-pulse" />
              <span>Identity: {identityId || '...'}</span>
            </div>
          </div>

          {currentRoomId ? (
            /* ACTIVE CHAT ROOM */
            <div className="w-full max-w-3xl mx-auto animate-fadeIn">
              <ChatRoom
                roomId={currentRoomId}
                myIdentityId={identityId}
                participants={roomParticipants}
                messages={messages}
                socket={socketRef.current}
                onSendMessage={handleSendMessage}
                onSendVoiceNote={handleSendVoiceNote}
                onLeaveRoom={handleLeaveRoom}
                onLeaveAndFindNew={handleLeaveAndFindNew}
                onReportUser={handleReportUser}
              />
            </div>
          ) : (
            /* MATCH CONTROLLER & TAGS */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-fadeIn">
              {/* Left Column: Match Controller & Direct Room Join */}
              <div className="lg:col-span-7 space-y-6">
                <MatchController
                  isSearching={isSearching}
                  matchMode={matchMode}
                  incomingRequest={incomingRequest}
                  onStartSearch={handleStartSearch}
                  onCancelSearch={handleCancelSearch}
                  onAcceptRequest={handleAcceptRequest}
                  onDeclineRequest={handleDeclineRequest}
                  tagsCount={tags.length}
                />

                {/* Direct Room Code Join Box */}
                <div className="rounded-2xl border border-border bg-card/70 p-4 sm:p-5 backdrop-blur-xl flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="size-9 rounded-xl border border-border bg-background/60 flex items-center justify-center text-cyan shrink-0">
                      <Hash className="size-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-foreground">Have a Direct Room Code?</h4>
                      <p className="text-[11px] text-muted-foreground">
                        Join a specific ephemeral chat room directly
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleJoinDirectRoom} className="flex w-full sm:w-auto gap-2">
                    <input
                      type="text"
                      placeholder="e.g. room_wvuh58er"
                      value={directRoomInput}
                      onChange={(e) => setDirectRoomInput(e.target.value)}
                      className="w-full sm:w-44 rounded-xl border border-border bg-background/80 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-cyan font-mono transition"
                    />
                    <button
                      type="submit"
                      disabled={!directRoomInput.trim()}
                      className="rounded-xl border border-border bg-background/80 hover:bg-background px-3 py-2 text-xs font-semibold text-foreground transition shrink-0 disabled:opacity-40"
                    >
                      Join
                    </button>
                  </form>
                </div>
              </div>

              {/* Right Column: Interest Tag Picker */}
              <div className="lg:col-span-5">
                <TagPicker initialTags={tags} onSaveTags={handleSaveTags} />
              </div>
            </div>
          )}
        </section>

        {/* PROTOCOL FEATURES SECTION */}
        <section id="features" aria-labelledby="features-heading" className="py-12 pb-6">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-cyan">
                The vanish protocol
              </p>
              <h2
                id="features-heading"
                className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl"
              >
                A little more human. A lot less baggage.
              </h2>
            </div>
            <span className="hidden pb-1 text-xs text-muted-foreground sm:block">
              Built for the moment
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {features.map(
              ({ icon: Icon, eyebrow, title, description, detail, className }) => (
                <article
                  key={title}
                  className={`group rounded-2xl border border-border bg-card/70 p-6 backdrop-blur-xl transition-colors hover:border-violet/40 sm:p-7 ${className}`}
                >
                  <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-background/60 text-cyan">
                    <Icon aria-hidden="true" className="size-5" />
                  </div>
                  <p className="mt-7 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {eyebrow}
                  </p>
                  <h3 className="mt-2 font-heading text-xl font-semibold tracking-tight">{title}</h3>
                  <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                    {description}
                  </p>
                  {typeof detail === 'function' ? detail(identityId) : detail}
                </article>
              )
            )}
          </div>
        </section>

        {/* FOOTER */}
        <footer className="flex flex-col gap-3 border-t border-border py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between mt-8">
          <span className="font-heading font-medium text-foreground/70">
            vanish / conversations without a trace
          </span>
          <span className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-danger" aria-hidden="true" /> You are always in
            control.
          </span>
        </footer>
      </div>

      {/* Passphrase Fixed ID Modal */}
      <FixedIdModal
        isOpen={showPassphraseModal}
        onClose={() => setShowPassphraseModal(false)}
        onSuccess={(fixedId) => {
          setIdentityId(fixedId);
          setIsFixed(true);
          showToast(`Fixed identity active: ${fixedId}`);
        }}
      />

      {/* Global Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-up max-w-sm glass-panel-glow border border-violet/40 rounded-2xl p-4 shadow-2xl flex items-center space-x-2.5 text-xs text-foreground">
          <Info className="w-4 h-4 text-cyan shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}
    </main>
  );
}
