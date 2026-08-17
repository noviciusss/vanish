'use client';

import React from 'react';
import { Shield, RefreshCw, KeyRound, Radio } from 'lucide-react';

interface NavbarProps {
  identityId: string;
  isFixed: boolean;
  onRotate: () => void;
  onOpenPassphrase: () => void;
  isConnected: boolean;
}

export function Navbar({
  identityId,
  isFixed,
  onRotate,
  onOpenPassphrase,
  isConnected,
}: NavbarProps) {
  return (
    <header className="w-full border-b border-surface-border bg-surface/80 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-8 py-3.5">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary shadow-sm shadow-primary/20">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold tracking-tight text-text-primary text-base">AnonChat</span>
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
                Ephemeral
              </span>
            </div>
            <p className="text-[11px] text-text-muted hidden sm:block">Zero-persistence stranger network</p>
          </div>
        </div>

        {/* Identity & Status */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Socket connectivity status */}
          <div
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-surface-raised border border-surface-border text-[11px] font-medium text-text-muted"
            title={isConnected ? 'Realtime socket connected' : 'Connecting to socket...'}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-accent-emerald shadow-sm shadow-accent-emerald' : 'bg-amber-400 animate-pulse'
              }`}
            />
            <span className="hidden sm:inline">{isConnected ? 'Live' : 'Connecting'}</span>
          </div>

          {/* Identity ID badge */}
          <div className="flex items-center space-x-2 bg-surface-raised border border-surface-border px-3 py-1.5 rounded-lg">
            <Radio className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-mono font-semibold text-text-primary tracking-wide">
              {identityId || 'generating...'}
            </span>
            {isFixed && (
              <span className="text-[9px] bg-accent-purple/20 text-accent-purple border border-accent-purple/30 px-1 rounded font-medium">
                Fixed
              </span>
            )}
          </div>

          {/* Rotate identity button */}
          <button
            onClick={onRotate}
            title="Rotate to new anonymous ID (24h default or instant)"
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-surface-raised hover:bg-surface-border border border-surface-border text-text-muted hover:text-text-primary transition flex items-center space-x-1.5 text-xs font-medium"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Rotate</span>
          </button>

          {/* Fixed ID Passphrase option */}
          <button
            onClick={onOpenPassphrase}
            title="Set passphrase to keep or recover this identity"
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-surface-raised hover:bg-surface-border border border-surface-border text-text-muted hover:text-text-primary transition flex items-center space-x-1.5 text-xs font-medium"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isFixed ? 'Fixed ID' : 'Fix ID'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
