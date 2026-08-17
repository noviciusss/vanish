'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Clipboard, Copy, LockKeyhole, Sparkles, RefreshCw, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function OnboardingPage() {
  const router = useRouter();
  const [anonymousId, setAnonymousId] = useState('anon_.....');
  const [isFixed, setIsFixed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fixedIdOpen, setFixedIdOpen] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [continued, setContinued] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function loadIdentity() {
      try {
        const res = await fetch('/api/auth/session', { method: 'POST' });
        const data = await res.json();
        if (data.identity_id) {
          setAnonymousId(data.identity_id);
          setIsFixed(Boolean(data.is_fixed));
        }
      } catch (err) {
        console.error('Failed to load session:', err);
      }
    }
    loadIdentity();
  }, []);

  async function copyId() {
    try {
      await navigator.clipboard.writeText(anonymousId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  async function handleRotate() {
    try {
      const res = await fetch('/api/auth/rotate', { method: 'POST' });
      const data = await res.json();
      if (data.identity_id) {
        setAnonymousId(data.identity_id);
        setIsFixed(false);
        setPassphrase('');
        setFixedIdOpen(false);
      }
    } catch (err) {
      console.error('Rotate failed:', err);
    }
  }

  async function handleContinue() {
    setErrorMsg('');
    if (fixedIdOpen && passphrase.trim()) {
      if (passphrase.trim().length < 6) {
        setErrorMsg('Passphrase must be at least 6 characters');
        return;
      }
      setLoading(true);
      try {
        const res = await fetch('/api/auth/passphrase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passphrase: passphrase.trim() }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to set passphrase');
        }
        setAnonymousId(data.identity_id);
        setIsFixed(true);
      } catch (err: any) {
        setErrorMsg(err.message || 'Passphrase error');
        setLoading(false);
        return;
      }
      setLoading(false);
    }

    setContinued(true);
    setTimeout(() => {
      router.push('/');
    }, 600);
  }

  return (
    <main className="onboarding-shell flex min-h-screen flex-col items-center justify-center px-5 py-10 text-foreground sm:px-6">
      <div className="w-full max-w-md">
        {/* Back Link */}
        <div className="mb-6 flex justify-start">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition"
          >
            <ArrowLeft className="size-3.5" />
            <span>Back to home</span>
          </Link>
        </div>

        <header className="mb-8 flex flex-col items-center text-center">
          <div className="mb-5 flex size-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] shadow-[0_0_32px_rgba(139,92,246,0.18)]">
            <Sparkles aria-hidden="true" className="size-5 text-cyan-300" strokeWidth={1.8} />
          </div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300/80">
            Private by default
          </p>
          <h1 className="font-heading text-balance text-3xl font-semibold tracking-[-0.04em] text-primary sm:text-4xl">
            Your space is ready.
          </h1>
          <p className="mt-3 max-w-xs text-sm leading-6 text-muted-foreground">
            Start chatting without an account. We&apos;ll give you a temporary identity to get
            started.
          </p>
        </header>

        <section
          className="glass-card rounded-[1.75rem] p-6 sm:p-7"
          aria-labelledby="identity-title"
        >
          <div className="flex items-center justify-between">
            <div>
              <p id="identity-title" className="text-sm font-medium text-primary">
                Your anonymous ID
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Use this to return to your space</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRotate}
                title="Generate fresh ID"
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition bg-white/[0.04] px-2 py-1 rounded-lg border border-white/5"
              >
                <RefreshCw className="size-3" />
                <span>Roll new</span>
              </button>
              <span className="flex items-center gap-1.5 text-xs text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                Online
              </span>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-white/[0.09] bg-black/10 px-5 py-5">
            <p className="min-w-0 truncate font-heading text-2xl font-semibold tracking-[-0.04em] text-primary sm:text-[2rem]">
              {anonymousId}
            </p>
            <button
              type="button"
              onClick={copyId}
              aria-label={copied ? 'ID copied' : 'Copy anonymous ID'}
              className="copy-button flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-muted-foreground transition hover:border-violet-400/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
            >
              {copied ? (
                <Check aria-hidden="true" className="size-4 text-emerald-300" />
              ) : (
                <Copy aria-hidden="true" className="size-4" />
              )}
            </button>
          </div>

          <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs leading-5 text-muted-foreground">
            <LockKeyhole aria-hidden="true" className="size-3.5 text-violet-300/80" />
            {isFixed
              ? 'This is a permanent fixed identity.'
              : 'This ID resets every 24h unless you fix it.'}
          </p>

          <div className="mt-6 border-t border-white/[0.08] pt-5">
            <button
              type="button"
              onClick={() => setFixedIdOpen((open) => !open)}
              aria-expanded={fixedIdOpen}
              className="mx-auto flex items-center gap-2 text-sm text-muted-foreground transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-4 focus-visible:ring-offset-[#14141F]"
            >
              <span className="underline decoration-white/20 underline-offset-4">
                {isFixed ? 'Change recovery passphrase' : 'Set a fixed ID instead'}
              </span>
              <span
                aria-hidden="true"
                className={`transition-transform ${fixedIdOpen ? 'rotate-180' : ''}`}
              >
                ⌄
              </span>
            </button>

            {fixedIdOpen && (
              <div className="mt-4 space-y-3 animate-slide-up">
                <label htmlFor="passphrase" className="sr-only">
                  Choose a passphrase
                </label>
                <input
                  id="passphrase"
                  type="password"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  placeholder="Choose a memorable passphrase (min 6 chars)"
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-primary outline-none placeholder:text-muted-foreground/70 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/15"
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  Your passphrase becomes your permanent identity using Argon2. Keep it private.
                </p>
              </div>
            )}
          </div>

          {errorMsg && (
            <p className="mt-4 text-center text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-xl">
              {errorMsg}
            </p>
          )}

          <button
            type="button"
            onClick={handleContinue}
            disabled={loading || (fixedIdOpen && passphrase.trim().length === 0)}
            className="gradient-button mt-7 flex h-12 w-full items-center justify-center rounded-xl text-sm font-semibold text-[#0A0A12] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 focus-visible:ring-offset-4 focus-visible:ring-offset-[#14141F] disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer shadow-lg shadow-violet-500/20"
          >
            {loading ? 'Deriving Fixed ID...' : continued ? 'You’re all set' : 'Continue'}
            <span aria-hidden="true" className="ml-2">
              →
            </span>
          </button>

          <p className="mt-4 flex items-center justify-center gap-2 text-[11px] text-muted-foreground/80">
            <Clipboard aria-hidden="true" className="size-3" />
            No email. No tracking. Just chat.
          </p>
        </section>

        <p className="mt-7 text-center text-xs text-muted-foreground/60">
          You can change this choice anytime in settings.
        </p>
      </div>
    </main>
  );
}
