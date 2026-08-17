'use client';

import React, { useState, useMemo } from 'react';
import { Tag, Plus, X, Check, Search, AlertCircle, Sparkles } from 'lucide-react';

const STARTER_TAGS = [
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

interface TagPickerProps {
  initialTags: string[];
  onSaveTags: (tags: string[]) => Promise<boolean>;
}

export function TagPicker({ initialTags, onSaveTags }: TagPickerProps) {
  const [tags, setTags] = useState<string[]>(initialTags || ['Design', 'Startups']);
  const [query, setQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const visibleTags = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return STARTER_TAGS.filter((tag) => tag.toLowerCase().includes(normalized));
  }, [query]);

  const toggleTag = (tag: string) => {
    setErrorMsg('');
    if (tags.includes(tag)) {
      setTags(tags.filter((t) => t !== tag));
    } else {
      if (tags.length >= 10) {
        setErrorMsg('Maximum 10 tags allowed');
        return;
      }
      setTags([...tags, tag]);
    }
  };

  const handleAddCustom = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = query.trim().slice(0, 30);
    if (!clean) return;

    if (tags.includes(clean)) {
      setQuery('');
      return;
    }

    if (tags.length >= 10) {
      setErrorMsg('Maximum 10 tags allowed');
      return;
    }

    setErrorMsg('');
    setTags([...tags, clean]);
    setQuery('');
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMsg('');
    try {
      const ok = await onSaveTags(tags);
      if (ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save tags');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="glass-panel rounded-[24px] p-5 sm:p-7">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-cyan-300" />
          <h2 className="text-sm font-semibold text-foreground tracking-tight font-heading">
            Interest Tags
          </h2>
        </div>
        <span
          className={`text-xs font-mono px-2.5 py-0.5 rounded-full border ${
            tags.length === 10
              ? 'bg-danger/10 border-danger/30 text-danger'
              : 'bg-card border-border text-muted-foreground'
          }`}
        >
          {tags.length} / 10 tags
        </span>
      </div>

      <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
        Pick up to 10 interests to match with strangers who share your passions.
      </p>

      {/* Selected Tags */}
      {tags.length > 0 && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-1.5 min-h-8">
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                className="group inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 px-3 py-1 text-xs font-semibold text-slate-950 transition-transform hover:-translate-y-0.5 shadow-sm"
              >
                <span>#{t}</span>
                <X className="w-3 h-3 transition-transform group-hover:rotate-90" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search / Add Input */}
      <form onSubmit={handleAddCustom} className="relative mb-4 flex items-center rounded-xl border border-white/[0.1] bg-white/[0.035] px-3.5 focus-within:border-violet-400/60">
        <Search className="mr-2 size-4 text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="Search or add custom interest..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={30}
          className="h-10 w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
        />
        {query.trim() && (
          <button
            type="submit"
            disabled={tags.length >= 10}
            className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-300 hover:text-cyan-200 transition"
          >
            <Plus className="w-3 h-3" />
            <span>Add</span>
          </button>
        )}
      </form>

      {/* Suggested Chips */}
      <div className="mb-5">
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
          Suggested topics
        </label>
        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
          {visibleTags.map((st) => {
            const isSelected = tags.includes(st);
            return (
              <button
                key={st}
                type="button"
                onClick={() => toggleTag(st)}
                disabled={!isSelected && tags.length >= 10}
                className={`tag-chip py-1 px-2.5 text-[11px] ${isSelected ? 'tag-chip-selected' : ''}`}
              >
                {isSelected && <Check className="w-3 h-3 shrink-0" />}
                <span>#{st}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Feedback error */}
      {errorMsg && (
        <div className="mb-3 flex items-center space-x-1.5 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-xl">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Save / Update Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 text-xs font-bold shadow-md shadow-violet-500/15 transition hover:brightness-110 flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
        >
          {saveSuccess ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Saved!</span>
            </>
          ) : (
            <>
              <span>{isSaving ? 'Saving...' : 'Update Interests'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
