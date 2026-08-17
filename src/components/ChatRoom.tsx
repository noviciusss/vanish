'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import {
  Send,
  LogOut,
  Flag,
  RotateCcw,
  ShieldCheck,
  Smile,
  MoreHorizontal,
  Copy,
  Check,
  AlertTriangle,
  Users,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Clock,
  Lock,
  Play,
  Pause,
  Flame,
  ChevronDown,
} from 'lucide-react';
import {
  generateSessionKeyPair,
  deriveSharedSecretKey,
  encryptText,
  decryptText,
  KeyPairData,
} from '@/lib/e2ee';
import { sounds } from '@/lib/sounds';

export interface ChatMessage {
  id: string;
  room_id: string;
  from_id: string;
  text: string;
  ciphertext?: string;
  iv?: string;
  isEncrypted?: boolean;
  timerSeconds?: number;
  isVoice?: boolean;
  audioBase64?: string;
  duration?: number;
  ts: number;
  isSystem?: boolean;
}

interface ChatRoomProps {
  roomId: string;
  myIdentityId: string;
  participants: string[];
  messages: ChatMessage[];
  socket?: Socket | null;
  onSendMessage: (payload: {
    text: string;
    ciphertext?: string;
    iv?: string;
    isEncrypted?: boolean;
    timerSeconds?: number;
  }) => void;
  onSendVoiceNote?: (audioBase64: string, duration: number) => void;
  onLeaveRoom: () => void;
  onLeaveAndFindNew: () => void;
  onReportUser: (targetId: string) => void;
}

const EMOJIS = ['👋', '✨', '🔥', '😂', '👀', '🌙', '☕', '💡', '💜', '🚀'];
const TIMER_OPTIONS = [
  { label: 'Off', seconds: 0 },
  { label: '10s', seconds: 10 },
  { label: '30s', seconds: 30 },
  { label: '60s', seconds: 60 },
];

export function ChatRoom({
  roomId,
  myIdentityId,
  participants,
  messages: rawMessages,
  socket,
  onSendMessage,
  onSendVoiceNote,
  onLeaveRoom,
  onLeaveAndFindNew,
  onReportUser,
}: ChatRoomProps) {
  const [draft, setDraft] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showTimerMenu, setShowTimerMenu] = useState(false);
  const [burnTimer, setBurnTimer] = useState<number>(0);
  const [copiedRoom, setCopiedRoom] = useState(false);
  const [isMuted, setIsMuted] = useState(sounds.getMuted());
  const [peerTyping, setPeerTyping] = useState(false);
  const [moderationWarning, setModerationWarning] = useState('');
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // E2EE States
  const [keyPair, setKeyPair] = useState<KeyPairData | null>(null);
  const [sharedKey, setSharedKey] = useState<CryptoKey | null>(null);
  const [decryptedMessages, setDecryptedMessages] = useState<ChatMessage[]>([]);
  const [burnedIds, setBurnedIds] = useState<Set<string>>(new Set());

  // Voice recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Audio playback state
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevMsgCountRef = useRef(0);

  const otherParticipants = participants.filter((p) => p !== myIdentityId);
  const primaryPeer = otherParticipants[0] || 'stranger';

  // 1. Initialize E2EE KeyPair
  useEffect(() => {
    let active = true;
    async function initE2EE() {
      const keys = await generateSessionKeyPair();
      if (active && keys) {
        setKeyPair(keys);
        socket?.emit('key_exchange', {
          room_id: roomId,
          publicKeyJwk: keys.publicKeyJwk,
        });
      }
    }
    initE2EE();
    return () => {
      active = false;
    };
  }, [roomId, socket]);

  // 2. Socket Listeners for Typing, Key Exchange
  useEffect(() => {
    if (!socket) return;

    const handlePeerKey = async (data: { from_id: string; publicKeyJwk: JsonWebKey }) => {
      if (keyPair && data.publicKeyJwk) {
        const derived = await deriveSharedSecretKey(keyPair.privateKey, data.publicKeyJwk);
        if (derived) {
          setSharedKey(derived);
          socket.emit('key_exchange', {
            room_id: roomId,
            publicKeyJwk: keyPair.publicKeyJwk,
          });
        }
      }
    };

    const handlePeerTypingStart = (data: { from_id: string }) => {
      if (data.from_id !== myIdentityId) {
        setPeerTyping(true);
      }
    };

    const handlePeerTypingStop = (data: { from_id: string }) => {
      if (data.from_id !== myIdentityId) {
        setPeerTyping(false);
      }
    };

    socket.on('peer_key_received', handlePeerKey);
    socket.on('peer_typing_start', handlePeerTypingStart);
    socket.on('peer_typing_stop', handlePeerTypingStop);

    return () => {
      socket.off('peer_key_received', handlePeerKey);
      socket.off('peer_typing_start', handlePeerTypingStart);
      socket.off('peer_typing_stop', handlePeerTypingStop);
    };
  }, [socket, keyPair, roomId, myIdentityId]);

  // 3. Decrypt incoming messages & handle sounds
  useEffect(() => {
    let active = true;
    async function processMessages() {
      const processed: ChatMessage[] = [];
      for (const msg of rawMessages) {
        if (msg.isEncrypted && msg.ciphertext && sharedKey) {
          const plain = await decryptText(
            { ciphertext: msg.ciphertext, iv: msg.iv, isEncrypted: true },
            sharedKey
          );
          processed.push({ ...msg, text: plain });
        } else {
          processed.push(msg);
        }
      }
      if (active) {
        setDecryptedMessages(processed);
      }
    }
    processMessages();

    // Sound effect on new incoming message
    if (rawMessages.length > prevMsgCountRef.current) {
      const lastMsg = rawMessages[rawMessages.length - 1];
      if (lastMsg && !lastMsg.isSystem) {
        if (lastMsg.from_id === myIdentityId) {
          sounds.playMessageSent();
        } else {
          sounds.playMessageReceived();
        }
      }

      // Smart auto-scroll: ONLY scroll if user is near bottom or it's our own message
      const isMine = lastMsg?.from_id === myIdentityId;
      if (isNearBottomRef.current || isMine) {
        setTimeout(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
          }
        }, 50);
      }
    }
    prevMsgCountRef.current = rawMessages.length;

    return () => {
      active = false;
    };
  }, [rawMessages, sharedKey, myIdentityId]);

  // 4. Burn-on-Read Timers (Uses separate burnedIds set without re-triggering message renders)
  useEffect(() => {
    const activeTimers: { [id: string]: NodeJS.Timeout } = {};

    rawMessages.forEach((msg) => {
      if (
        msg.timerSeconds &&
        msg.timerSeconds > 0 &&
        msg.from_id !== myIdentityId &&
        !burnedIds.has(msg.id) &&
        !activeTimers[msg.id]
      ) {
        activeTimers[msg.id] = setTimeout(() => {
          setBurnedIds((prev) => new Set([...prev, msg.id]));
        }, msg.timerSeconds * 1000);
      }
    });

    return () => {
      Object.values(activeTimers).forEach((t) => clearTimeout(t));
    };
  }, [rawMessages, myIdentityId, burnedIds]);

  // 5. Scroll tracking handler
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    const isBottom = distanceToBottom < 80;

    isNearBottomRef.current = isBottom;
    setShowScrollBottom(!isBottom);
  }, []);

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
      setShowScrollBottom(false);
      isNearBottomRef.current = true;
    }
  };

  // 6. Typing Debounce Handler
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
    setModerationWarning('');

    if (socket) {
      socket.emit('typing_start', { room_id: roomId });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing_stop', { room_id: roomId });
      }, 2500);
    }
  };

  // 7. Submit Message
  const submitMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;

    const dangerousPatterns = [
      /password\s*[:=]\s*\S+/i,
      /(?:https?:\/\/)?(?:www\.)?(?:bit\.ly|tinyurl\.com|t\.co)\/\S+/i,
    ];
    if (dangerousPatterns.some((pattern) => pattern.test(text))) {
      setModerationWarning('Warning: Sharing passwords or short links is discouraged for your security.');
    }

    if (socket) {
      socket.emit('typing_stop', { room_id: roomId });
    }

    if (sharedKey) {
      const encrypted = await encryptText(text, sharedKey);
      onSendMessage({
        text: '[Encrypted E2EE Message]',
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        isEncrypted: true,
        timerSeconds: burnTimer,
      });
    } else {
      onSendMessage({
        text,
        isEncrypted: false,
        timerSeconds: burnTimer,
      });
    }

    setDraft('');
    setShowEmojiPicker(false);
    setShowTimerMenu(false);

    // Scroll directly to bottom on send
    setTimeout(scrollToBottom, 60);
  };

  // 8. Voice Recording Handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result as string;
          if (onSendVoiceNote) {
            onSendVoiceNote(base64Audio, recordSeconds);
          } else if (socket) {
            socket.emit('send_voice_note', {
              room_id: roomId,
              audioBase64: base64Audio,
              duration: recordSeconds,
            });
          }
        };
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordSeconds(0);

      recordIntervalRef.current = setInterval(() => {
        setRecordSeconds((prev) => {
          if (prev >= 10) {
            stopRecording();
            return 10;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.warn('Microphone access denied:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
    }
  };

  const handlePlayVoice = (id: string, base64Audio: string) => {
    if (playingAudioId === id) {
      audioPlayerRef.current?.pause();
      setPlayingAudioId(null);
      return;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }

    const audio = new Audio(base64Audio);
    audioPlayerRef.current = audio;
    audio.play();
    setPlayingAudioId(id);

    audio.onended = () => {
      setPlayingAudioId(null);
    };
  };

  const handleCopyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopiedRoom(true);
    setTimeout(() => setCopiedRoom(false), 2000);
  };

  const handleToggleSound = () => {
    const muted = sounds.toggleMute();
    setIsMuted(muted);
  };

  const handleConfirmReport = () => {
    if (primaryPeer && primaryPeer !== 'stranger') {
      onReportUser(primaryPeer);
    }
    setShowReportModal(false);
  };

  return (
    <section className="relative flex h-[78vh] max-h-[820px] min-h-[520px] w-full flex-col overflow-hidden rounded-3xl border border-border/70 bg-card/80 shadow-2xl shadow-black/40 backdrop-blur-2xl">
      {/* 1. ROOM HEADER */}
      <header className="flex items-center justify-between border-b border-border/60 bg-card/90 px-5 py-3.5 sm:px-7 z-10 backdrop-blur-md shrink-0">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/30 to-cyan-400/20 text-sm font-semibold text-primary-foreground ring-1 ring-white/10">
            ◌
            <span
              className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-card bg-emerald-400"
              aria-label="Online"
            />
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-heading text-sm font-semibold tracking-wide text-foreground flex items-center gap-2">
              <span>{otherParticipants.length > 0 ? otherParticipants.join(', ') : 'midnight-orbit'}</span>
              {sharedKey && (
                <span
                  title="Client-Side End-to-End Encrypted (ECDH + AES-256-GCM)"
                  className="inline-flex items-center gap-1 text-[9px] font-mono font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 rounded-md"
                >
                  <Lock className="size-2.5" />
                  <span>E2EE</span>
                </span>
              )}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1.5">
              <span>Online · zero logs</span>
              {burnTimer > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-400 font-mono">
                  <Flame className="size-2.5" />
                  <span>{burnTimer}s burn</span>
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          {/* Sound Toggle */}
          <button
            type="button"
            onClick={handleToggleSound}
            title={isMuted ? 'Unmute sounds' : 'Mute sounds'}
            className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground border border-transparent hover:border-border cursor-pointer"
          >
            {isMuted ? <VolumeX className="size-4 text-muted-foreground" /> : <Volume2 className="size-4 text-cyan-300" />}
          </button>

          {/* Copy Room Code */}
          <button
            type="button"
            onClick={handleCopyRoomId}
            title="Copy room code"
            className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground border border-transparent hover:border-border cursor-pointer"
          >
            {copiedRoom ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
          </button>

          {/* 1-Tap Next / Find New Stranger */}
          <button
            type="button"
            onClick={onLeaveAndFindNew}
            title="Leave & find new stranger"
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-violet-500/15 text-violet-300 hover:bg-violet-500/25 border border-violet-500/30 transition cursor-pointer"
          >
            <RotateCcw className="size-3.5" />
            <span className="hidden sm:inline">Next</span>
          </button>

          {/* Report Button */}
          {otherParticipants.length > 0 && (
            <button
              type="button"
              onClick={() => setShowReportModal(true)}
              title="Report & block user"
              className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-rose-400 border border-transparent hover:border-rose-500/30 cursor-pointer"
            >
              <Flag className="size-4" />
            </button>
          )}

          {/* Leave Button */}
          <button
            type="button"
            onClick={onLeaveRoom}
            title="Leave chat"
            className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-rose-400 border border-transparent hover:border-border cursor-pointer"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </header>

      {/* 2. SCROLLABLE MESSAGE FEED */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-6 sm:px-8 sm:py-7 overscroll-contain"
        >
          <div className="mx-auto flex max-w-xl flex-col gap-4">
            {/* Ephemeral Notice Pill */}
            <div className="flex items-center justify-center gap-2 pb-1 text-[11px] text-muted-foreground/80">
              <ShieldCheck className="size-3.5 text-cyan-300" aria-hidden="true" />
              <span>{sharedKey ? 'End-to-End Encrypted (AES-256-GCM) · Ephemeral' : 'Zero logs · ephemeral Redis storage · auto-expires'}</span>
            </div>

            {decryptedMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/10 mb-3 text-cyan-300">
                  <Users className="size-6" />
                </div>
                <p className="text-sm font-semibold text-foreground">Room Connected</p>
                <p className="text-xs max-w-xs mt-1">
                  Say hello! Only your anonymous identity is visible to participants.
                </p>
              </div>
            ) : (
              decryptedMessages.map((message) => {
                if (message.isSystem) {
                  return (
                    <div key={message.id} className="flex justify-center my-1">
                      <div className="px-3 py-1 rounded-full bg-muted/70 border border-border text-[11px] text-muted-foreground font-medium">
                        {message.text}
                      </div>
                    </div>
                  );
                }

                if (burnedIds.has(message.id)) {
                  return (
                    <div key={message.id} className="flex justify-center my-1">
                      <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400/80 font-mono">
                        <Flame className="size-3" />
                        <span>Message burned on read</span>
                      </div>
                    </div>
                  );
                }

                const isMine = message.from_id === myIdentityId;
                const timeStr = new Date(message.ts).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={message.id}
                    className={`flex flex-col gap-1 ${isMine ? 'items-end' : 'items-start'} animate-fadeIn`}
                  >
                    {/* Voice note bubble */}
                    {message.isVoice && message.audioBase64 ? (
                      <div
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-sm ${
                          isMine
                            ? 'rounded-br-md bg-gradient-to-br from-violet-500 to-cyan-400 text-slate-950 font-medium'
                            : 'rounded-bl-md bg-muted text-foreground border border-white/[0.06]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handlePlayVoice(message.id, message.audioBase64!)}
                          className="size-8 rounded-full bg-black/20 hover:bg-black/30 flex items-center justify-center transition"
                        >
                          {playingAudioId === message.id ? (
                            <Pause className="size-4" />
                          ) : (
                            <Play className="size-4 ml-0.5" />
                          )}
                        </button>
                        <div className="text-xs font-mono">
                          <span>Voice note · {message.duration || 2}s</span>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm relative ${
                          isMine
                            ? 'rounded-br-md bg-gradient-to-br from-violet-500 to-cyan-400 text-slate-950 font-medium'
                            : 'rounded-bl-md bg-muted text-foreground border border-white/[0.06]'
                        }`}
                      >
                        <span>{message.text}</span>
                        {message.timerSeconds && message.timerSeconds > 0 && !isMine && (
                          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-amber-300 font-mono opacity-80">
                            <Clock className="size-3" />
                            <span>Expires soon</span>
                          </div>
                        )}
                      </div>
                    )}

                    <span className="px-1 text-[10px] text-muted-foreground/70 font-mono">
                      {isMine ? 'You' : message.from_id} · {timeStr}
                      {message.isEncrypted && ' · 🔒'}
                    </span>
                  </div>
                );
              })
            )}

            {/* Peer typing indicator */}
            {peerTyping && (
              <div className="flex items-center gap-1.5 self-start rounded-full bg-muted/70 border border-white/10 px-3.5 py-2 text-xs text-muted-foreground animate-fadeIn">
                <span className="size-1.5 animate-pulse rounded-full bg-cyan-300" />
                <span className="size-1.5 animate-pulse rounded-full bg-cyan-300 [animation-delay:150ms]" />
                <span className="size-1.5 animate-pulse rounded-full bg-cyan-300 [animation-delay:300ms]" />
                <span className="ml-1 text-[10px]">{primaryPeer} is typing...</span>
              </div>
            )}
          </div>
        </div>

        {/* Floating Scroll-To-Bottom Pill Button */}
        {showScrollBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-3 right-6 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card/90 border border-border text-foreground text-xs font-semibold shadow-xl backdrop-blur-md transition hover:bg-card hover:-translate-y-0.5 cursor-pointer animate-slide-up"
          >
            <span>Latest</span>
            <ChevronDown className="size-3.5" />
          </button>
        )}
      </div>

      {/* Moderation Warning Toast */}
      {moderationWarning && (
        <div className="mx-6 mb-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] text-center shrink-0">
          {moderationWarning}
        </div>
      )}

      {/* 3. INPUT BAR & FOOTER (Pinned firmly at bottom) */}
      <div className="border-t border-border/60 bg-card/85 px-4 pb-4 pt-3 sm:px-7 relative shrink-0">
        {/* Quick Emoji Tray */}
        {showEmojiPicker && (
          <div className="absolute bottom-full left-6 right-6 sm:left-auto sm:right-28 mb-2 p-2 rounded-2xl bg-card border border-border shadow-2xl backdrop-blur-xl flex flex-wrap gap-1.5 z-30 max-w-xs animate-slide-up">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setDraft((prev) => prev + emoji);
                }}
                className="size-8 rounded-lg hover:bg-white/10 text-base flex items-center justify-center transition cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Disappearing Timer Menu */}
        {showTimerMenu && (
          <div className="absolute bottom-full left-12 mb-2 p-2 rounded-2xl bg-card border border-border shadow-2xl backdrop-blur-xl flex gap-1.5 z-30 animate-slide-up">
            {TIMER_OPTIONS.map((opt) => (
              <button
                key={opt.seconds}
                type="button"
                onClick={() => {
                  setBurnTimer(opt.seconds);
                  setShowTimerMenu(false);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono transition cursor-pointer ${
                  burnTimer === opt.seconds
                    ? 'bg-amber-400 text-slate-950 font-bold'
                    : 'text-muted-foreground hover:bg-white/10 hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={submitMessage}
          className="mx-auto flex max-w-xl items-center gap-2 rounded-2xl border border-border/70 bg-background/70 p-1.5 pl-3 shadow-inner shadow-black/20 focus-within:border-violet-400/60"
        >
          {/* Disappearing Timer Button */}
          <button
            type="button"
            onClick={() => setShowTimerMenu((prev) => !prev)}
            title="Disappearing / Burn timer"
            className={`size-8 rounded-xl flex items-center justify-center transition cursor-pointer ${
              burnTimer > 0
                ? 'text-amber-400 bg-amber-400/10 border border-amber-400/30'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Flame className="size-4" />
          </button>

          {isRecording ? (
            <div className="flex-1 flex items-center gap-3 py-2 px-2 text-xs text-rose-400">
              <span className="size-2 rounded-full bg-rose-500 animate-pulse" />
              <span className="font-mono font-semibold">Recording voice clip... {recordSeconds}s/10s</span>
            </div>
          ) : (
            <input
              id="message"
              value={draft}
              onChange={handleInputChange}
              maxLength={2000}
              placeholder={sharedKey ? 'Write an E2EE encrypted message...' : 'Write a message...'}
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
            />
          )}

          {/* Voice Record Button */}
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            aria-label={isRecording ? 'Stop recording' : 'Record voice note'}
            className={`size-9 items-center justify-center rounded-xl flex transition cursor-pointer ${
              isRecording
                ? 'bg-rose-500 text-white animate-pulse'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {isRecording ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </button>

          {/* Emoji Button */}
          <button
            type="button"
            onClick={() => setShowEmojiPicker((prev) => !prev)}
            aria-label="Add emoji"
            className="size-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground flex transition cursor-pointer"
          >
            <Smile className="size-4" aria-hidden="true" />
          </button>

          {/* Send Button */}
          <button
            type="submit"
            disabled={!draft.trim() && !isRecording}
            aria-label="Send message"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 text-slate-950 shadow-lg shadow-violet-500/20 transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            <Send className="size-4" aria-hidden="true" />
          </button>
        </form>

        <div className="mt-2.5 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground/70">
          <MoreHorizontal className="size-3" aria-hidden="true" />
          <span>Be kind. This room disappears when you leave.</span>
        </div>
      </div>

      {/* REPORT & BLOCK CONFIRMATION MODAL */}
      {showReportModal && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl p-6 max-w-sm w-full border border-rose-500/30 shadow-2xl animate-scaleIn">
            <div className="size-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="size-6" />
            </div>
            <h4 className="text-base font-bold text-center text-foreground mb-1 font-heading">
              Report & Block User
            </h4>
            <p className="text-xs text-muted-foreground text-center mb-4 leading-relaxed">
              This will instantly disconnect you and permanently prevent you from ever being matched
              with <span className="font-mono text-foreground font-semibold">{primaryPeer}</span> again.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="flex-1 py-2 rounded-xl bg-muted hover:bg-muted/80 border border-border text-muted-foreground text-xs font-medium transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReport}
                className="flex-1 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition shadow-sm cursor-pointer"
              >
                Confirm Block
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
