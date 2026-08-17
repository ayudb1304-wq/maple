'use client';

import { useEffect, useId, useRef, useState } from 'react';

import type { GeocodeApiResult, Place } from '@/lib/types';

/**
 * City search plus "use my location". Debounced against /api/geocode, which is
 * cached 30 days server-side, so typing costs the free endpoint almost nothing.
 */

type Props = {
  onSelect: (place: Place) => void;
  onUseMyLocation: () => void;
  busy?: boolean;
};

const DEBOUNCE_MS = 250;
const MIN_QUERY = 2;

export function SearchBox({ onSelect, onUseMyLocation, busy = false }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeApiResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searching, setSearching] = useState(false);
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  const trimmed = query.trim();
  // Derived rather than stored: clearing results for a too-short query needs no
  // state update, and so cannot cascade a render out of the effect below.
  const visibleResults = trimmed.length >= MIN_QUERY ? results : [];

  useEffect(() => {
    if (trimmed.length < MIN_QUERY) return;

    // Abort in-flight work when the query moves on, so a slow early response
    // can never overwrite the results for what the user is typing now.
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as { results?: GeocodeApiResult[] };
        setResults(data.results ?? []);
        setActiveIndex(-1);
        setOpen(true);
      } catch {
        // Aborted or offline: leave the previous results alone.
      } finally {
        setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  // Close on an outside click, the way a native combobox would.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function choose(result: GeocodeApiResult) {
    onSelect({
      name: result.name,
      latitude: result.latitude,
      longitude: result.longitude,
      timezone: result.timezone,
      country: result.country,
      admin1: result.admin1,
    });
    setQuery(result.name);
    setOpen(false);
    setResults([]);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || visibleResults.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % visibleResults.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? visibleResults.length - 1 : i - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(visibleResults[activeIndex >= 0 ? activeIndex : 0]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="relative flex-1">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => visibleResults.length > 0 && setOpen(true)}
            placeholder="Search a city"
            aria-label="Search for a city"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            role="combobox"
            autoComplete="off"
            className="w-full rounded-xl border border-border-subtle bg-surface px-4 py-3 text-base text-foreground placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          {searching ? (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">…</span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onUseMyLocation}
          disabled={busy}
          className="flex items-center justify-center gap-2 rounded-xl border border-brand/40 bg-brand-dim px-4 py-3 text-sm font-medium text-brand transition-colors hover:bg-brand/15 focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-50"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="12" cy="12" r="3.5" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
          </svg>
          Use my location
        </button>
      </div>

      {open && visibleResults.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-border-subtle bg-surface-raised shadow-2xl shadow-black/50"
        >
          {visibleResults.map((result, index) => (
            <li key={result.id} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                onClick={() => choose(result)}
                onMouseEnter={() => setActiveIndex(index)}
                className={[
                  'flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-left text-sm',
                  index === activeIndex ? 'bg-brand-dim text-brand' : 'text-foreground',
                ].join(' ')}
              >
                <span className="truncate font-medium">{result.name}</span>
                <span className="shrink-0 truncate text-xs text-muted">
                  {[result.admin1, result.country].filter(Boolean).join(', ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
