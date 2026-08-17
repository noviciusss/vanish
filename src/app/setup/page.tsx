'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronRight, Plus, Search, Sparkles, X, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const suggestedTags = [
  'Design',
  'Photography',
  'Startups',
  'Music',
  'Travel',
  'Books',
  'Gaming',
  'Film & TV',
  'Fitness',
  'Food',
  'Fashion',
  'Art',
  'Technology',
  'Writing',
  'Nature',
  'Wellness',
  'Entrepreneurship',
  'Learning',
  'Coffee',
  'Mindfulness',
  'Anime',
  'Philosophy',
  'Coding',
  'Crypto',
];

export default function SetupPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(['Design', 'Startups']);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingMode, setSavingMode] = useState<'nearest' | 'random' | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch('/api/profile');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.tags) && data.tags.length > 0) {
            setSelected(data.tags);
          }
        }
      } catch (err) {
        console.error('Failed to load profile tags:', err);
      }
    }
    loadProfile();
  }, []);

  const visibleTags = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return suggestedTags.filter((tag) => tag.toLowerCase().includes(normalized));
  }, [query]);

  function toggleTag(tag: string) {
    setErrorMsg('');
    setSelected((current) =>
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : current.length < 10
        ? [...current, tag]
        : current
    );
  }

  function addCustomTag() {
    const custom = query.trim();
    if (!custom) return;

    if (selected.includes(custom)) {
      setQuery('');
      return;
    }

    if (selected.length >= 10) {
      setErrorMsg('Maximum 10 tags allowed');
      return;
    }

    setErrorMsg('');
    setSelected((current) => [...current, custom]);
    setQuery('');
  }

  async function handleSaveAndContinue(mode: 'nearest' | 'random') {
    setSavingMode(mode);
    setLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/profile/tags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: selected }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save tags');
      }

      // Redirect to main chat terminal
      router.push(`/?mode=${mode}`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving interests');
      setLoading(false);
      setSavingMode(null);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-8 sm:px-8 bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-grid opacity-[0.035]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-72 w-full max-w-3xl -translate-x-1/2 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.15),transparent_65%)]"
      />

      <section className="relative w-full max-w-[620px] animate-in fade-in slide-in-from-bottom-3 duration-700">
        {/* Top Header */}
        <div className="mb-9 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Link
              href="/"
              className="flex items-center gap-2.5 text-foreground hover:opacity-90 transition"
            >
              <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 shadow-lg shadow-violet-500/15">
                <Sparkles className="size-4 text-slate-950" aria-hidden="true" />
              </div>
              <span className="font-heading text-sm font-semibold tracking-[-0.01em] text-foreground">
                vanish
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
            <span>Profile setup</span>
          </div>
        </div>

        {/* Card */}
        <div className="glass-panel rounded-[28px] p-6 sm:p-10">
          <header className="mb-8 max-w-lg">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80">
              Step 02 / 03
            </p>
            <h1 className="font-heading text-3xl font-semibold tracking-[-0.045em] text-foreground sm:text-[2.65rem] sm:leading-[1.08]">
              What are you into?
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground sm:text-base">
              Pick a few interests and we&apos;ll introduce you to people who get excited about the
              same things.
            </p>
          </header>

          {/* Active Selected Tags */}
          <div className="mb-5 flex min-h-8 flex-wrap gap-2" aria-live="polite">
            {selected.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className="group inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 px-3.5 py-1.5 text-xs font-semibold text-slate-950 transition-transform hover:-translate-y-0.5 shadow-sm"
                aria-label={`Remove ${tag}`}
              >
                <span>#{tag}</span>
                <X
                  className="size-3.5 transition-transform group-hover:rotate-90"
                  aria-hidden="true"
                />
              </button>
            ))}
            {selected.length >= 7 && (
              <span className="self-center text-xs text-muted-foreground font-mono">
                {selected.length}/10 selected
              </span>
            )}
          </div>

          {/* Search & Custom Input Bar */}
          <div className="relative mb-7 flex items-center rounded-2xl border border-white/[0.1] bg-white/[0.035] px-4 transition-colors focus-within:border-violet-400/60 focus-within:bg-white/[0.055]">
            <Search className="mr-3 size-[18px] text-muted-foreground" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addCustomTag();
                }
              }}
              maxLength={30}
              placeholder="Search or add an interest (e.g. Astrophysics)..."
              className="h-14 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              aria-label="Search or add an interest"
            />
            {query.trim() && (
              <button
                type="button"
                onClick={addCustomTag}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-300/10 cursor-pointer transition"
                aria-label="Add custom interest"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                <span>Add</span>
              </button>
            )}
          </div>

          {/* Suggested Interests Grid */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Suggested interests
              </p>
              <p className="text-xs text-muted-foreground font-mono">{selected.length} of 10 max</p>
            </div>
            <div className="flex flex-wrap gap-2.5" aria-label="Suggested interests">
              {visibleTags.map((tag) => {
                const isSelected = selected.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    disabled={!isSelected && selected.length >= 10}
                    className={`tag-chip ${isSelected ? 'tag-chip-selected' : ''}`}
                    aria-pressed={isSelected}
                  >
                    {isSelected && <Check className="size-3.5 shrink-0" aria-hidden="true" />}
                    <span>#{tag}</span>
                  </button>
                );
              })}
              {!visibleTags.length && (
                <p className="py-3 text-sm text-muted-foreground">
                  No match yet. Press Enter or click &ldquo;Add&rdquo; to add &ldquo;{query}&rdquo;.
                </p>
              )}
            </div>
          </div>

          {/* Feedback error */}
          {errorMsg && (
            <div className="mt-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center">
              {errorMsg}
            </div>
          )}

          {/* Actions */}
          <div className="mt-10 flex flex-col gap-3 sm:flex-row-reverse">
            <button
              type="button"
              onClick={() => handleSaveAndContinue('nearest')}
              disabled={loading}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 px-5 text-sm font-bold text-slate-950 shadow-lg shadow-violet-500/15 transition-all hover:-translate-y-0.5 hover:shadow-violet-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50 cursor-pointer"
            >
              {savingMode === 'nearest' ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <span>Find someone</span>
                  <ChevronRight className="size-4" aria-hidden="true" />
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => handleSaveAndContinue('random')}
              disabled={loading}
              className="inline-flex h-12 flex-1 items-center justify-center rounded-xl border border-white/[0.12] px-5 text-sm font-semibold text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-50 cursor-pointer"
            >
              {savingMode === 'random' ? 'Connecting...' : 'Skip, match me randomly'}
            </button>
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground/70">
          You can always change these later.
        </p>
      </section>
    </main>
  );
}
