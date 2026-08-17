'use client';

import { useCallback, useState } from 'react';

import { cardUrl } from '@/lib/geo';
import type { Verdict } from '@/lib/types';

/**
 * "Share tonight's sky" (T3.2).
 *
 * Mobile gets the native share sheet with the PNG attached, which is what makes
 * the card spread. Desktop has no useful equivalent, so it copies the link and
 * offers the image as a download instead.
 *
 * The shared URL always carries city-level coordinates: a card gets pasted into
 * group chats, and a precise location must not travel with it.
 */

type Props = { verdict: Verdict };

type Status = 'idle' | 'working' | 'copied' | 'shared' | 'error';

export function ShareButton({ verdict }: Props) {
  const [status, setStatus] = useState<Status>('idle');

  const buildCardUrl = useCallback(() => {
    // Relative to the current origin, so this works on localhost, preview and
    // production without depending on the canonical URL being reachable.
    return cardUrl(window.location.origin, {
      latitude: verdict.location.latitude,
      longitude: verdict.location.longitude,
      city: verdict.location.city,
    });
  }, [verdict.location]);

  const share = useCallback(async () => {
    setStatus('working');
    const url = buildCardUrl();
    const pageUrl = window.location.href;
    const title = verdict.location.city
      ? `Tonight's sky in ${verdict.location.city}`
      : "Tonight's sky";

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`card ${response.status}`);
      const blob = await response.blob();
      const file = new File([blob], 'skytonight.png', { type: 'image/png' });

      // canShare({ files }) is the only reliable capability check: several
      // browsers expose navigator.share but reject file payloads.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title, text: verdict.verdict });
        setStatus('shared');
        return;
      }

      // Desktop path: link to the clipboard, image to disk.
      await navigator.clipboard.writeText(pageUrl);
      downloadBlob(blob, filenameFor(verdict));
      setStatus('copied');
    } catch (error) {
      // A user dismissing the share sheet throws AbortError. That is not a
      // failure and must not surface as one.
      if (error instanceof DOMException && error.name === 'AbortError') {
        setStatus('idle');
        return;
      }
      setStatus('error');
    }
  }, [buildCardUrl, verdict]);

  return (
    <div className="flex flex-col items-center gap-1.5 sm:items-start">
      <button
        type="button"
        onClick={() => void share()}
        disabled={status === 'working'}
        className="inline-flex items-center gap-2 rounded-xl border border-brand/40 bg-brand-dim px-4 py-2.5 text-sm font-medium text-brand transition-colors hover:bg-brand/15 focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-60"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M12 16V4M12 4 8 8M12 4l4 4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" strokeLinecap="round" />
        </svg>
        {status === 'working' ? 'Preparing…' : "Share tonight's sky"}
      </button>

      <p aria-live="polite" className="min-h-[1.1rem] text-xs text-muted">
        {status === 'copied'
          ? 'Link copied, image downloaded.'
          : status === 'shared'
            ? 'Shared.'
            : status === 'error'
              ? 'Could not build the card. Try again in a moment.'
              : ''}
      </p>
    </div>
  );
}

function filenameFor(verdict: Verdict): string {
  const slug = (verdict.location.city ?? 'sky').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `skytonight-${slug}-${verdict.date}.png`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
