/**
 * The Sky Score dial. Pure SVG so it costs no JS beyond React itself and
 * renders identically on the server, the client and (in spirit) the card.
 */

type Props = {
  /** 0–10, or null when there was nothing to score. */
  score: number | null;
  headline: string;
  size?: number;
};

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Leave a gap at the bottom so the arc reads as a gauge, not a pie. */
const SWEEP = 0.78;

export function ScoreDial({ score, headline, size = 132 }: Props) {
  const fraction = score === null ? 0 : Math.max(0, Math.min(10, score)) / 10;
  const track = CIRCUMFERENCE * SWEEP;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={score === null ? `${headline}, no score available` : `Sky score ${score} out of 10, ${headline}`}
    >
      <svg viewBox="0 0 128 128" width={size} height={size} className="-rotate-[125deg]">
        <circle
          cx="64"
          cy="64"
          r={RADIUS}
          fill="none"
          stroke="var(--border)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${track} ${CIRCUMFERENCE}`}
        />
        <circle
          cx="64"
          cy="64"
          r={RADIUS}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${track * fraction} ${CIRCUMFERENCE}`}
          style={{ transition: 'stroke-dasharray 600ms ease, stroke 400ms ease' }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {score === null ? (
          <span className="text-3xl font-semibold text-muted" aria-hidden>
            –
          </span>
        ) : (
          <span className="text-[2.6rem] leading-none font-semibold tabular-nums text-foreground">
            {formatScore(score)}
          </span>
        )}
        <span className="mt-1 text-[0.7rem] uppercase tracking-[0.14em] text-muted">
          {score === null ? 'no score' : 'out of 10'}
        </span>
      </div>
    </div>
  );
}

/** Whole numbers read cleaner than "8.0" on a dial this size. */
function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}
