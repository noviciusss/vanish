'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, Shuffle, Radio, UserCheck, X, Check, Globe } from 'lucide-react';
import { sounds } from '@/lib/sounds';

interface MatchControllerProps {
  isSearching: boolean;
  matchMode: 'nearest' | 'random';
  incomingRequest: { from_id: string; shared_score?: number } | null;
  onStartSearch: (mode: 'nearest' | 'random', lang?: string) => void;
  onCancelSearch: () => void;
  onAcceptRequest: (from_id: string) => void;
  onDeclineRequest: () => void;
  tagsCount: number;
}

const LANGUAGES = [
  { code: 'any', label: 'Any Language' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'ja', label: 'Japanese' },
];

export function MatchController({
  isSearching,
  matchMode,
  incomingRequest,
  onStartSearch,
  onCancelSearch,
  onAcceptRequest,
  onDeclineRequest,
  tagsCount,
}: MatchControllerProps) {
  const [selectedMode, setSelectedMode] = useState<'nearest' | 'random'>('nearest');
  const [selectedLang, setSelectedLang] = useState<string>('any');

  useEffect(() => {
    if (incomingRequest) {
      sounds.playMatchFound();
    }
  }, [incomingRequest]);

  return (
    <div className="glass-panel rounded-3xl p-6 sm:p-8 text-center relative overflow-hidden">
      {/* Ambient background glow circle */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* STATE 1: Incoming Handshake Request Modal */}
      {incomingRequest ? (
        <div className="relative z-10 animate-slide-up py-4">
          <div className="size-14 mx-auto rounded-2xl bg-gradient-to-br from-violet-500/20 to-cyan-400/20 border border-violet-500/40 text-cyan-300 flex items-center justify-center mb-4 shadow-lg shadow-violet-500/15">
            <UserCheck className="size-7" />
          </div>
          <h3 className="text-xl font-bold font-heading text-foreground mb-1">Stranger Found!</h3>
          <p className="text-xs text-muted-foreground mb-2 font-mono">
            User <span className="text-cyan-300 font-bold">{incomingRequest.from_id}</span> wants to connect
          </p>
          {incomingRequest.shared_score !== undefined && incomingRequest.shared_score > 0 && (
            <div className="inline-block mb-5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
              {incomingRequest.shared_score}% Shared Interest Overlap
            </div>
          )}

          <div className="flex justify-center items-center gap-3">
            <button
              onClick={onDeclineRequest}
              className="px-5 py-2.5 rounded-xl bg-muted hover:bg-muted/80 border border-border text-muted-foreground hover:text-foreground text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer"
            >
              <X className="size-4" />
              <span>Decline</span>
            </button>
            <button
              onClick={() => onAcceptRequest(incomingRequest.from_id)}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 text-xs font-bold shadow-lg shadow-violet-500/20 hover:brightness-110 transition flex items-center space-x-1.5 cursor-pointer"
            >
              <Check className="size-4" />
              <span>Accept & Start Chat</span>
            </button>
          </div>
        </div>
      ) : isSearching ? (
        /* STATE 2: Radar Waiting Animation */
        <div className="relative z-10 py-6">
          <div className="relative size-28 mx-auto mb-6 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-violet-500/40 radar-ring pointer-events-none" />
            <div className="absolute inset-0 rounded-full border border-cyan-400/20 radar-ring-delayed pointer-events-none" />
            <div className="size-16 rounded-full bg-gradient-to-br from-violet-500/20 to-cyan-400/20 border border-violet-500/50 flex items-center justify-center text-cyan-300 shadow-inner">
              <Radio className="size-8 animate-pulse" />
            </div>
          </div>

          <h3 className="text-base font-bold font-heading text-foreground mb-1">
            Scanning for Strangers...
          </h3>
          <p className="text-xs text-muted-foreground mb-6 font-mono">
            Mode: <span className="text-foreground font-semibold capitalize">{matchMode}</span>{' '}
            {matchMode === 'nearest' && tagsCount > 0 ? `(${tagsCount} tags)` : ''}{' '}
            {selectedLang !== 'any' ? `· [${selectedLang.toUpperCase()}]` : ''}
          </p>

          <button
            onClick={onCancelSearch}
            className="px-5 py-2 rounded-xl bg-muted hover:bg-muted/80 border border-border text-muted-foreground hover:text-foreground text-xs font-medium transition inline-flex items-center space-x-1.5 cursor-pointer"
          >
            <X className="size-3.5" />
            <span>Cancel Search</span>
          </button>
        </div>
      ) : (
        /* STATE 3: Idle / Start Match Options */
        <div className="relative z-10 py-4">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-heading text-foreground mb-2">
            Talk to a Stranger
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto mb-6 leading-relaxed">
            Rotating IDs. Zero logs. Mutual consent handshake before connection.
          </p>

          {/* Mode Switcher */}
          <div className="inline-flex p-1 rounded-2xl bg-white/[0.04] border border-white/10 mb-4">
            <button
              onClick={() => setSelectedMode('nearest')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                selectedMode === 'nearest'
                  ? 'bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sparkles className="size-3.5" />
              <span>Nearest Interests</span>
            </button>
            <button
              onClick={() => setSelectedMode('random')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                selectedMode === 'random'
                  ? 'bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Shuffle className="size-3.5" />
              <span>Full Random</span>
            </button>
          </div>

          {/* Language Selector (Tier 2) */}
          <div className="mb-6 flex items-center justify-center gap-2">
            <Globe className="size-3.5 text-muted-foreground" />
            <select
              value={selectedLang}
              onChange={(e) => setSelectedLang(e.target.value)}
              className="bg-card border border-border text-xs text-foreground px-3 py-1.5 rounded-xl outline-none focus:border-violet-400/60 cursor-pointer"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} className="bg-card text-foreground">
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          {/* Action CTA */}
          <div>
            <button
              onClick={() => onStartSearch(selectedMode, selectedLang)}
              className="w-full max-w-xs mx-auto py-3.5 px-6 rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 text-sm font-bold shadow-lg shadow-violet-500/20 hover:brightness-110 transition flex items-center justify-center space-x-2 cursor-pointer"
            >
              <Radio className="size-4" />
              <span>
                {selectedMode === 'nearest' ? 'Find Matched Stranger' : 'Find Random Stranger'}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
