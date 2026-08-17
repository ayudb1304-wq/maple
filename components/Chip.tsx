import type { ReactNode } from 'react';

/**
 * A single fact from the verdict: label on top, value below. Chips are the
 * "when to go outside" detail beneath the one-line verdict (PRD §4).
 */

type Props = {
  label: string;
  value: string;
  icon?: ReactNode;
  /** Full text when the displayed value is an abbreviation. */
  title?: string;
  /** Draws the chip in the accent colour — used for the aurora chip. */
  highlight?: boolean;
};

export function Chip({ label, value, icon, title, highlight = false }: Props) {
  return (
    <div
      className={[
        // Sized so the longest real value, a high-latitude window like
        // "10:36-11:28 PM", fits four-across without truncating.
        'flex items-center gap-2 rounded-xl border px-3 py-2.5',
        highlight
          ? 'border-accent/40 bg-accent-dim'
          : 'border-border-subtle bg-surface-raised',
      ].join(' ')}
    >
      {icon ? (
        <span className={highlight ? 'text-accent' : 'text-muted'} aria-hidden>
          {icon}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-col">
        <span className="text-[0.68rem] uppercase tracking-[0.12em] text-muted">{label}</span>
        <span
          title={title}
          className={[
            'truncate text-[0.8125rem] font-medium tabular-nums',
            highlight ? 'text-accent' : 'text-foreground',
          ].join(' ')}
        >
          {value}
        </span>
      </span>
    </div>
  );
}
