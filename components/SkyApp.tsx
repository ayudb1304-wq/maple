'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';

import { SearchBox } from './SearchBox';
import { StreakBadge } from './StreakBadge';
import { VerdictPanel } from './VerdictPanel';
import { advanceStreak, readState, streakLength, writeState } from '@/lib/streak';
import { localDateString } from '@/lib/time';
import type { Place, Verdict } from '@/lib/types';

/**
 * Landing-page orchestrator: pick a location, fetch the verdict, remember it.
 *
 * The map is imported through next/dynamic with ssr:false so MapLibre stays out
 * of the initial bundle and the verdict paints first (T2.2's JS budget).
 */
const SkyMap = dynamic(() => import('./SkyMap'), {
  ssr: false,
  loading: () => <div className="h-56 w-full rounded-2xl border border-border-subtle bg-surface sm:h-72" />,
});

type Status = 'idle' | 'locating' | 'loading' | 'ready' | 'error';

export function SkyApp() {
  const [place, setPlace] = useState<Place | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const requestId = useRef(0);

  /**
   * `persist` is false when restoring a saved location on load: reopening the
   * app should not re-save what it just read.
   */
  const load = useCallback(async (next: Place, persist: boolean) => {
    // Stale-response guard: an earlier slow request must never overwrite a
    // later one the user is actually waiting on.
    const id = ++requestId.current;
    setPlace(next);
    setStatus('loading');
    setError(null);

    try {
      const params = new URLSearchParams({
        lat: String(next.latitude),
        lon: String(next.longitude),
        tz: next.timezone,
        city: next.name,
      });
      const res = await fetch(`/api/verdict?${params}`);
      if (!res.ok) throw new Error(`verdict ${res.status}`);
      const data = (await res.json()) as Verdict;
      if (id !== requestId.current) return;

      setVerdict(data);
      setStatus('ready');

      // Check-in is recorded against the *location's* local date, so a user
      // travelling east does not lose a day.
      const today = localDateString(next.timezone, new Date());
      const stored = readState();
      const updated = advanceStreak(
        { ...stored, savedLocation: persist ? next : stored.savedLocation },
        today,
      );
      writeState(updated);
      setStreak(streakLength(updated.lastCheckedDates, today));
    } catch {
      if (id !== requestId.current) return;
      setStatus('error');
      setError('Could not load tonight’s sky. Check your connection and try again.');
    }
  }, []);

  // Restore the saved location and streak once, after mount. The work is done
  // asynchronously so state updates land after the first paint rather than
  // cascading a second render out of the effect body.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const stored = readState();
      if (cancelled) return;

      const zone = stored.savedLocation?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
      setStreak(streakLength(stored.lastCheckedDates, localDateString(zone, new Date())));

      if (stored.savedLocation) await load(stored.savedLocation, false);
    })();

    return () => {
      cancelled = true;
    };
  }, [load]);

  // Push the verdict's accent onto the document so the hero, the glow and the
  // panel agree on one colour (PRD §5: "one accent colour, score-dependent").
  // This is a genuine external-system sync, which is what effects are for.
  const theme = verdict?.theme;
  useEffect(() => {
    const root = document.documentElement;
    if (theme) root.dataset.theme = theme;
    else delete root.dataset.theme;
    return () => {
      delete root.dataset.theme;
    };
  }, [theme]);

  const useMyLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('error');
      setError('This browser cannot share your location. Search for a city instead.');
      return;
    }
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void load(
          {
            name: 'Your location',
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          true,
        );
      },
      () => {
        setStatus('error');
        setError('Location permission was declined. Search for a city instead.');
      },
      { timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }, [load]);

  const onSelect = useCallback((next: Place) => void load(next, true), [load]);

  const busy = status === 'locating' || status === 'loading';

  return (
    <div className="flex w-full flex-col gap-6">
      <SearchBox onSelect={onSelect} onUseMyLocation={useMyLocation} busy={busy} />

      {streak > 0 ? <StreakBadge days={streak} /> : null}

      {/*
        A fixed minimum height reserves the panel's space before it arrives, so
        the verdict appearing causes no layout shift (T2.1's AC).
      */}
      <div className="min-h-[19rem] sm:min-h-[17rem]">
        {status === 'error' && !verdict ? (
          <p className="rounded-2xl border border-border-subtle bg-surface p-5 text-sm text-muted">
            {error}
          </p>
        ) : verdict ? (
          <VerdictPanel verdict={verdict} />
        ) : busy ? (
          <SkeletonPanel />
        ) : (
          <EmptyPrompt />
        )}
      </div>

      {verdict && place ? (
        <SkyMap latitude={verdict.location.latitude} longitude={verdict.location.longitude} label={place.name} />
      ) : null}

      {error && verdict ? <p className="text-sm text-muted">{error}</p> : null}
    </div>
  );
}

function SkeletonPanel() {
  return (
    <div className="w-full animate-pulse rounded-2xl border border-border-subtle bg-surface p-5 sm:p-7">
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-7">
        <div className="h-[132px] w-[132px] shrink-0 rounded-full bg-surface-raised" />
        <div className="w-full space-y-3">
          <div className="h-3 w-24 rounded bg-surface-raised" />
          <div className="h-6 w-3/4 rounded bg-surface-raised" />
          <div className="h-3 w-40 rounded bg-surface-raised" />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-xl bg-surface-raised" />
        ))}
      </div>
    </div>
  );
}

function EmptyPrompt() {
  return (
    <div className="flex h-full min-h-[19rem] w-full flex-col items-center justify-center rounded-2xl border border-dashed border-border-subtle bg-surface/50 p-8 text-center sm:min-h-[17rem]">
      <p className="text-base text-muted">
        Search a city or share your location to see tonight&rsquo;s verdict.
      </p>
      <p className="mt-1.5 text-sm text-muted/70">No signup. Takes a second.</p>
    </div>
  );
}
