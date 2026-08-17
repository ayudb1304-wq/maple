import { Chip } from './Chip';
import { ScoreDial } from './ScoreDial';
import type { Verdict } from '@/lib/types';

/**
 * The answer to the only question the product asks. Server-renderable: no
 * hooks, no browser APIs, so /sky/[city] pages get it in their HTML.
 */

type Props = {
  verdict: Verdict;
  /** Slot for the share button, injected by whichever page is rendering. */
  action?: React.ReactNode;
};

export function VerdictPanel({ verdict, action }: Props) {
  const { moon, aurora, cloudCoverEvening, goldenHour, blueHour } = verdict;
  const showAuroraChip =
    aurora !== null && ((aurora.probability ?? 0) >= 10 || (aurora.kp ?? 0) >= 5);

  return (
    <section
      data-theme={verdict.theme}
      className="w-full rounded-2xl border border-border-subtle bg-surface p-5 sm:p-7"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-7">
        <ScoreDial score={verdict.score} headline={verdict.headline} />

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-[0.7rem] uppercase tracking-[0.16em] text-accent">
            {verdict.headline}
          </p>
          <h2 className="mt-1.5 text-balance text-xl font-semibold leading-snug sm:text-2xl">
            {verdict.verdict}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {[verdict.location.city, formatDate(verdict.date, verdict.location.timezone)]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {action ? <div className="mt-4 flex justify-center sm:justify-start">{action}</div> : null}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Chip label="Golden hour" value={goldenHour?.label ?? 'Not tonight'} icon={<SunIcon />} />
        <Chip label="Blue hour" value={blueHour?.label ?? 'Not tonight'} icon={<DuskIcon />} />
        {/* Values stay terse: the label already says what the number is, and
            four chips across a panel this wide truncate otherwise. */}
        <Chip
          label="Cloud cover"
          value={cloudCoverEvening ? `${cloudCoverEvening.meanPercent}%` : 'Unavailable'}
          icon={<CloudIcon />}
        />
        {showAuroraChip ? (
          <Chip
            label="Aurora"
            value={formatAurora(aurora)}
            icon={<AuroraIcon />}
            highlight
          />
        ) : (
          <Chip label="Moon" value={formatMoonShort(moon)} title={formatMoon(moon)} icon={<MoonIcon />} />
        )}
      </div>

      {/* The phase name does not fit in the chip, and when aurora takes the
          fourth slot the moon loses its chip entirely. Either way it belongs
          here rather than truncated above. */}
      <p className="mt-3 text-xs text-muted">Moon: {formatMoon(moon)}</p>

      {verdict.degraded ? (
        <p className="mt-3 text-xs text-muted">
          {verdict.missing.includes('cloud')
            ? 'Cloud data is unavailable right now, so tonight is unscored. Times and moon are still accurate.'
            : 'Sun and moon times are computed locally right now, so they may differ by a minute or two.'}
        </p>
      ) : null}
    </section>
  );
}

function formatMoon(moon: Verdict['moon']): string {
  if (!moon || moon.illuminationPercent === null) return 'Unavailable';
  const phase = moon.phase ? `${moon.phase}, ` : '';
  return `${phase}${Math.round(moon.illuminationPercent)}% lit`;
}

/** Chip-sized: illumination is what affects the sky, the phase name is flavour. */
function formatMoonShort(moon: Verdict['moon']): string {
  if (!moon || moon.illuminationPercent === null) return 'Unavailable';
  return `${Math.round(moon.illuminationPercent)}% lit`;
}

function formatAurora(aurora: NonNullable<Verdict['aurora']>): string {
  const parts: string[] = [];
  if (aurora.probability !== null) parts.push(`${aurora.probability}% chance`);
  if (aurora.kp !== null) parts.push(`Kp ${Number.isInteger(aurora.kp) ? aurora.kp : aurora.kp.toFixed(1)}`);
  return parts.join(' · ') || 'Possible';
}

/** "Mon 17 Aug", rendered in the location's timezone rather than the reader's. */
function formatDate(dateStr: string, timezone: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: timezone,
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

// Inline SVGs keep the icon set at zero dependencies and zero extra requests.

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
    </svg>
  );
}

function DuskIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M17 18a5 5 0 0 0-10 0" />
      <path d="M2 18h20M12 3v4M5.6 8.6l1.4 1.4M17 10l1.4-1.4" strokeLinecap="round" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M17.5 19a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.1 11.1 3.5 3.5 0 0 0 6.5 19h11z" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" strokeLinejoin="round" />
    </svg>
  );
}

function AuroraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 20c0-8 2-14 4-14s2 6 2 10M12 20c0-9 2-16 4-16s2 7 2 12" strokeLinecap="round" />
    </svg>
  );
}
