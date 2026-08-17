/**
 * The check-in streak. Deliberately understated (ARCHITECTURE.md: "show the
 * streak subtly") — it is the seed of the Phase 2 investment mechanic, not a
 * gamification banner.
 */

type Props = { days: number };

export function StreakBadge({ days }: Props) {
  // One day is not a streak yet; claiming it would cheapen the counter.
  if (days < 2) return null;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface px-3 py-1 text-xs text-muted">
      <span aria-hidden>🔥</span>
      {days}-day sky check streak
    </span>
  );
}
