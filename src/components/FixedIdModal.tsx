'use client';

import React, { useState } from 'react';
import { KeyRound, X, Check, Lock, AlertCircle } from 'lucide-react';

interface FixedIdModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (identityId: string) => void;
}

export function FixedIdModal({ isOpen, onClose, onSuccess }: FixedIdModalProps) {
  const [passphrase, setPassphrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passphrase.trim().length < 6) {
      setError('Passphrase must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/passphrase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase: passphrase.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to apply passphrase');
      }

      onSuccess(data.identity_id);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass-panel rounded-3xl p-6 sm:p-7 max-w-md w-full border border-surface-border shadow-2xl relative animate-slide-up">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary p-1 rounded-lg transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-12 h-12 rounded-2xl bg-accent-purple/15 border border-accent-purple/30 text-accent-purple flex items-center justify-center mb-4">
          <KeyRound className="w-6 h-6" />
        </div>

        <h3 className="text-lg font-bold text-text-primary mb-1">Fixed Identity Passphrase</h3>
        <p className="text-xs text-text-muted mb-4 leading-relaxed">
          By default, IDs rotate every 24h. If you want a persistent ID, enter a recovery passphrase.
          It is hashed with Argon2 to deterministically re-derive the same anonymous ID whenever you visit.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5">
              Secret Passphrase
            </label>
            <div className="relative">
              <input
                type="password"
                placeholder="Enter secret passphrase (min 6 chars)..."
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="w-full bg-surface-raised border border-surface-border rounded-xl px-4 py-2.5 text-xs sm:text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary transition"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center space-x-1.5 text-xs text-accent-rose bg-accent-rose/10 border border-accent-rose/20 p-2.5 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-surface-raised hover:bg-surface-border border border-surface-border text-text-muted text-xs font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || passphrase.length < 6}
              className="px-5 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{loading ? 'Deriving...' : 'Set / Recover Fixed ID'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
