'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  LogOut,
  Flag,
  RotateCcw,
  ShieldCheck,
  Smile,
  Paperclip,
  MoreHorizontal,
  Copy,
  Check,
  AlertTriangle,
  Users,
} from 'lucide-react';

export interface ChatMessage {
  id: string;
  room_id: string;
  from_id: string;
  text: string;
  ts: number;
  isSystem?: boolean;
}

interface ChatRoomProps {
  roomId: string;
  myIdentityId: string;
  participants: string[];
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onLeaveRoom: () => void;
  onLeaveAndFindNew: () => void;
  onReportUser: (targetId: string) => void;
}

const EMOJIS = ['👋', '✨', '🔥', '😂', '👀', '🌙', '☕', '💡', '💜', '🚀'];

export function ChatRoom({
  roomId,
  myIdentityId,
  participants,
  messages,
  onSendMessage,
  onLeaveRoom,
  onLeaveAndFindNew,
  onReportUser,
}: ChatRoomProps) {
  const [draft, setDraft] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [copiedRoom, setCopiedRoom] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const otherParticipants = participants.filter((p) => p !== myIdentityId);
  const primaryPeer = otherParticipants[0] || 'stranger';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const submitMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSendMessage(text);
    setDraft('');
    setShowEmojiPicker(false);
  };

  const handleCopyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopiedRoom(true);
    setTimeout(() => setCopiedRoom(false), 2000);
  };

  const handleConfirmReport = () => {
    if (primaryPeer && primaryPeer !== 'stranger') {
      onReportUser(primaryPeer);
    }
    setShowReportModal(false);
  };

  const handleAddEmoji = (emoji: string) => {
    setDraft((prev) => prev + emoji);
  };

  return (
    <section className="relative flex h-[78vh] max-h-[820px] min-h-[520px] w-full flex-col overflow-hidden rounded-3xl border border-border/70 bg-card/80 shadow-2xl shadow-black/40 backdrop-blur-2xl">
      {/* 1. ROOM HEADER */}
      <header className="flex items-center justify-between border-b border-border/60 bg-card/90 px-5 py-3.5 sm:px-7 z-10 backdrop-blur-md">
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
              <span className="text-[10px] font-mono font-normal text-muted-foreground px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                {participants.length}/3
              </span>
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Online · messages auto-expire</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          {/* Copy Room Code */}
          <button
            type="button"
            onClick={handleCopyRoomId}
            title="Copy room code"
            className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground border border-transparent hover:border-border"
          >
            {copiedRoom ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
          </button>

          {/* 1-Tap Next / Find New Stranger */}
          <button
            type="button"
            onClick={onLeaveAndFindNew}
            title="Leave & find new stranger"
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-violet-500/15 text-violet-300 hover:bg-violet-500/25 border border-violet-500/30 transition"
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
              className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-rose-400 border border-transparent hover:border-rose-500/30"
            >
              <Flag className="size-4" />
            </button>
          )}

          {/* Leave Button */}
          <button
            type="button"
            onClick={onLeaveRoom}
            title="Leave chat"
            className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-rose-400 border border-transparent hover:border-border"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </header>

      {/* 2. MESSAGE FEED */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-7">
          <div className="mx-auto flex max-w-xl flex-col gap-4">
            {/* Ephemeral Notice Pill */}
            <div className="flex items-center justify-center gap-2 pb-1 text-[11px] text-muted-foreground/80">
              <ShieldCheck className="size-3.5 text-cyan-300" aria-hidden="true" />
              <span>Zero logs · ephemeral Redis storage · auto-expires</span>
            </div>

            {messages.length === 0 ? (
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
              messages.map((message) => {
                if (message.isSystem) {
                  return (
                    <div key={message.id} className="flex justify-center my-1">
                      <div className="px-3 py-1 rounded-full bg-muted/70 border border-border text-[11px] text-muted-foreground font-medium">
                        {message.text}
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
                    <div
                      className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                        isMine
                          ? 'rounded-br-md bg-gradient-to-br from-violet-500 to-cyan-400 text-slate-950 font-medium'
                          : 'rounded-bl-md bg-muted text-foreground border border-white/[0.06]'
                      }`}
                    >
                      {message.text}
                    </div>
                    <span className="px-1 text-[10px] text-muted-foreground/70 font-mono">
                      {isMine ? 'You' : message.from_id} · {timeStr}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* 3. INPUT BAR & FOOTER */}
        <div className="border-t border-border/60 bg-card/65 px-4 pb-4 pt-3 sm:px-7 relative">
          {/* Quick Emoji Tray */}
          {showEmojiPicker && (
            <div className="absolute bottom-full left-6 right-6 sm:left-auto sm:right-16 mb-2 p-2 rounded-2xl bg-card border border-border shadow-2xl backdrop-blur-xl flex flex-wrap gap-1.5 z-20 max-w-xs animate-slide-up">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleAddEmoji(emoji)}
                  className="size-8 rounded-lg hover:bg-white/10 text-base flex items-center justify-center transition"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={submitMessage}
            className="mx-auto flex max-w-xl items-center gap-2 rounded-2xl border border-border/70 bg-background/70 p-1.5 pl-4 shadow-inner shadow-black/20 focus-within:border-violet-400/60"
          >
            <label htmlFor="message" className="sr-only">
              Type a message
            </label>
            <input
              id="message"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={2000}
              placeholder="Write a message..."
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
            />
            <button
              type="button"
              onClick={() => setShowEmojiPicker((prev) => !prev)}
              aria-label="Add emoji"
              className="size-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground flex transition"
            >
              <Smile className="size-4" aria-hidden="true" />
            </button>
            <button
              type="submit"
              disabled={!draft.trim()}
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
                className="flex-1 py-2 rounded-xl bg-muted hover:bg-muted/80 border border-border text-muted-foreground text-xs font-medium transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReport}
                className="flex-1 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition shadow-sm"
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
