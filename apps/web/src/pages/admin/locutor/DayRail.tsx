import { Fragment } from 'react';
import type {
  LocutorBusyInterval,
  LocutorFreeWindow,
  LocutorPlanSlot,
} from '@radio/types';

/**
 * The locutor's day, drawn as one object instead of three lists of chips.
 *
 * Free windows, blocking programs and proposed slots are all segments on the
 * same 24-hour axis, so rendering them as separate badge clouds made the
 * operator reconstruct the overlap in their head — and lost the one thing that
 * matters, which is whether a slot actually lands inside a free window. Here a
 * blocked program is a dark span of the base track, free air is a lit span on
 * top of it, and each proposed slot is an amber tick sitting at its real
 * minute. A slot that falls outside a lit span is immediately visible as a
 * tick over darkness, which is the bug the old layout could not show.
 */

const DAY_MINUTES = 24 * 60;

/** "HH:MM" → minutes since midnight. Unparseable input becomes 0. */
function toMinutes(clock: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!match) return 0;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return Math.min(Math.max(hours * 60 + minutes, 0), DAY_MINUTES);
}

/**
 * A span as inline styles. A window whose end is not after its start runs past
 * midnight, and since this view is one station day it is clipped at 24:00
 * rather than drawn backwards off the left edge.
 */
function spanStyle(from: string, to: string): { left: string; width: string } {
  const start = toMinutes(from);
  const end = Math.max(toMinutes(to), start);
  return {
    left: `${(start / DAY_MINUTES) * 100}%`,
    width: `${((end - start) / DAY_MINUTES) * 100}%`,
  };
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

interface DayRailProps {
  freeWindows: LocutorFreeWindow[];
  busyIntervals: LocutorBusyInterval[];
  slots: LocutorPlanSlot[];
  /** Station clock as "HH:MM", for the now marker. */
  stationClock?: string;
}

export function DayRail({ freeWindows, busyIntervals, slots, stationClock }: DayRailProps) {
  const nowMinutes = stationClock ? toMinutes(stationClock) : null;
  const freeMinutes = freeWindows.reduce((total, window) => total + window.minutes, 0);

  const summary = `${formatMinutes(freeMinutes)} libres de ${formatMinutes(DAY_MINUTES)}, ${busyIntervals.length} programa(s) bloqueando los avisos y ${slots.length} aviso(s) propuesto(s).`;

  return (
    <div className="space-y-2">
      <div
        role="img"
        aria-label={summary}
        className="relative select-none overflow-hidden rounded-lg border border-border bg-sunken px-3 pb-2 pt-5"
      >
        {/* Slot ticks ride above the track so an out-of-window proposal is
            visible as a tick floating over the dark part of the base. */}
        <div className="absolute inset-x-3 top-0 h-5">
          {slots.map((slot) => (
            <span
              key={slot.at}
              title={`Aviso propuesto a las ${slot.at}`}
              className="absolute top-1 h-2.5 w-px -translate-x-1/2 bg-primary"
              style={{ left: `${(slot.minuteOfDay / DAY_MINUTES) * 100}%` }}
            />
          ))}
        </div>

        {/* Base track: the whole day. Busy programs cut dark spans into it. */}
        <div className="relative h-7 overflow-hidden rounded-md bg-border/30">
          {busyIntervals.map((interval) => (
            <span
              key={`${interval.from}-${interval.title}`}
              title={`${interval.from} - ${interval.to} · ${interval.title}`}
              className="absolute inset-y-0 bg-background ring-1 ring-inset ring-border"
              style={spanStyle(interval.from, interval.to)}
            />
          ))}

          {/* Free air sits on top, so a program inside a window still reads as
              blocked: the dark span is painted over the lit one, not under it. */}
          {freeWindows.map((window) => (
            <span
              key={`${window.from}-${window.to}`}
              title={`${window.from} - ${window.to} · ${formatMinutes(window.minutes)} libres`}
              className="absolute inset-y-0 bg-success/25 ring-1 ring-inset ring-success/45"
              style={spanStyle(window.from, window.to)}
            />
          ))}

          {nowMinutes !== null && (
            <>
              <span
                title={`Ahora: ${stationClock}`}
                className="absolute inset-y-0 w-px bg-foreground/80"
                style={{ left: `${(nowMinutes / DAY_MINUTES) * 100}%` }}
              />
              <span
                aria-hidden
                className="absolute -top-5 -translate-x-1/2 font-mono text-[9px] uppercase tracking-[0.14em] text-foreground/80"
                style={{ left: `${(nowMinutes / DAY_MINUTES) * 100}%` }}
              >
                ahora
              </span>
            </>
          )}
        </div>

        {/* Hour scale, every three hours. */}
        <div className="mt-1 flex justify-between font-mono text-[9px] tabular-nums text-faint">
          {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((hour) => (
            <Fragment key={hour}>{`${String(hour).padStart(2, '0')}:00`}</Fragment>
          ))}
        </div>
      </div>

      {/* Legend: the rail encodes two facts, so it names exactly two things. */}
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-faint">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-3 rounded-[2px] bg-success/25 ring-1 ring-inset ring-success/45" />
          Aire libre
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-3 rounded-[2px] bg-background ring-1 ring-inset ring-border" />
          Programa en curso
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-px bg-primary" />
          Aviso propuesto
        </li>
      </ul>
    </div>
  );
}