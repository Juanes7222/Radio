/**
 * The shared status faceplate.
 *
 * The locutor console introduced this strip as its own unit header: one lamp,
 * one verdict, and right-aligned readouts, at the same visual scale as the ON
 * AIR strip in the topbar. Pages whose first question is a live state — the
 * dashboard, the schedule, health, the studio — now open with the same
 * gesture, so the operator reads the panel's answer in one line before
 * meeting its working areas.
 *
 * Colour discipline stays the same everywhere: only the lamp and the verdict
 * carry a state colour; the surrounding chrome is grey and amber.
 */

import type { ReactNode } from 'react';

interface FaceplateProps {
  /** State lamp. Carries the unit's verdict colour, or bg-border when idle. */
  lamp: string;
  /** Silkscreen label, two words at most, mono uppercase. */
  label: string;
  /** The verdict itself, in the tone the state assigns it. */
  verdict: ReactNode;
  /** Right-aligned readouts. One short line each, mono numbers. */
  slots?: ReactNode[];
}

export function Faceplate({ lamp, label, verdict, slots = [] }: FaceplateProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-sunken/40 px-4 py-3">
      <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${lamp}`} />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">{label}</p>
        <div className="mt-0.5 text-sm font-semibold text-foreground">{verdict}</div>
      </div>
      {slots.map((slot, index) => (
        <div key={index} className="min-w-0 shrink-0">
          {slot}
        </div>
      ))}
    </div>
  );
}

/** One right-aligned readout for the faceplate, mono eyebrow + value. */
export function FaceplateReading({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-right font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
        {label}
      </p>
      <div className="mt-0.5 text-right text-sm font-medium tabular-nums text-foreground">
        {children}
      </div>
    </div>
  );
}
