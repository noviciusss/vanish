'use client';

import React, { useState } from 'react';
import { Sparkles, Shuffle, Radio, UserCheck, X, Check, Loader2 } from 'lucide-react';

interface MatchControllerProps {
  isSearching: boolean;
  matchMode: 'nearest' | 'random';
  incomingRequest: { from_id: string; shared_score?: number } | null;
  onStartSearch: (mode: 'nearest' | 'random') => void;
  onCancelSearch: () => void;
  onAcceptRequest: (from_id: string) => void;
  onDeclineRequest: () => void;
  tagsCount: number;
}

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

  return (
    <div className="glass-panel-glow rounded-3xl p-6 sm:p-8 text-center relative overflow-hidden">
      {/* Background glow circle */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      {/* STATE 1: Incoming Handshake Request Modal */}
      {incomingRequest ? (
        <div className="relative z-10 animate-slide-up py-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-accent-purple/20 border border-accent-purple/40 text-accent-purple flex items-center justify-center mb-4">
            <UserCheck className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-text-primary mb-1">Stranger Found!</h3>
          <p className="text-xs text-text-muted mb-2 font-mono">
            User <span className="text-primary font-bold">{incomingRequest.from_id}</span> wants to connect
          </p>
          {incomingRequest.shared_score !== undefined && incomingRequest.shared_score > 0 && (
            <div className="inline-block mb-5 px-2.5 py-1 rounded-full bg-accent-emerald/15 border border-accent-emerald/30 text-accent-emerald text-[11px] font-semibold">
              {Math.round(incomingRequest.shared_score * 100)}% Shared Tag Overlap
            </div>
          )}

          <div className="flex justify-center items-center gap-3">
            <button
              onClick={onDeclineRequest}
              className="px-4 py-2.5 rounded-xl bg-surface-raised hover:bg-surface-border border border-surface-border text-text-muted hover:text-text-primary text-xs font-semibold transition flex items-center space-x-1.5"
            >
              <X className="w-4 h-4" />
              <span>Decline</span>
            </button>
            <button
              onClick={() => onAcceptRequest(incomingRequest.from_id)}
              className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold shadow-lg shadow-primary/30 transition flex items-center space-x-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Accept & Start Chat</span>
            </button>
          </div>
        </div>
      ) : isSearching ? (
        /* STATE 2: Radar Waiting Animation */
        <div className="relative z-10 py-6">
          <div className="relative w-28 h-28 mx-auto mb-6 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-primary/40 radar-ring pointer-events-none" />
            <div className="absolute inset-0 rounded-full border border-primary/20 radar-ring-delayed pointer-events-none" />
            <div className="w-16 h-16 rounded-full bg-primary/20 border border-primary flex items-center justify-center text-primary shadow-inner">
              <Radio className="w-8 h-8 animate-pulse" />
            </div>
          </div>

          <h3 className="text-base font-bold text-text-primary mb-1">
            Scanning for Strangers...
          </h3>
          <p className="text-xs text-text-muted mb-6">
            Mode: <span className="text-text-primary font-medium capitalize">{matchMode}</span>{' '}
            {matchMode === 'nearest' && tagsCount > 0 ? `(${tagsCount} active interest tags)` : ''}
          </p>

          <button
            onClick={onCancelSearch}
            className="px-5 py-2 rounded-xl bg-surface-raised hover:bg-surface-border border border-surface-border text-text-muted hover:text-text-primary text-xs font-medium transition inline-flex items-center space-x-1.5"
          >
            <X className="w-3.5 h-3.5" />
            <span>Cancel Search</span>
          </button>
        </div>
      ) : (
        /* STATE 3: Idle / Start Match Options */
        <div className="relative z-10 py-4">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-text-primary mb-2">
            Talk to a Stranger
          </h2>
          <p className="text-xs sm:text-sm text-text-muted max-w-md mx-auto mb-6">
            Rotating IDs. Zero logs. Mutual consent handshake before connection.
          </p>

          {/* Mode Switcher */}
          <div className="inline-flex p-1 rounded-2xl bg-surface-raised border border-surface-border mb-6">
            <button
              onClick={() => setSelectedMode('nearest')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
                selectedMode === 'nearest'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Nearest Interests</span>
            </button>
            <button
              onClick={() => setSelectedMode('random')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
                selectedMode === 'random'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Full Random</span>
            </button>
          </div>

          {/* Action CTA */}
          <div>
            <button
              onClick={() => onStartSearch(selectedMode)}
              className="w-full max-w-xs mx-auto py-3.5 px-6 rounded-2xl bg-primary hover:bg-primary-hover text-white text-sm font-bold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition duration-200 flex items-center justify-center space-x-2"
            >
              <Radio className="w-4 h-4" />
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
