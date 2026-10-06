import { AppError } from "../../shared/errors/app-error";
import { getStationDayStartWithOffset, getStationTime } from "../../shared/utils/date";
import { logger } from "../../shared/logger/logger";
import {
  listStationPlaylists,
  updatePlaylist,
  type PlaylistDetail,
  type PlaylistScheduleItem,
} from "../rotation/azuracastPlaylist.service";
import { SLOT_STEP_MINUTES } from "./program.constants";

const MINUTES_IN_DAY = 24 * 60;

export interface OccupiedInterval {
  /** Minutes since midnight. */
  startMinute: number;
  /** Minutes since midnight, exclusive. */
  endMinute: number;
  playlistId: number;
  playlistName: string;
}

export interface ScheduleWindow {
  /** AzuraCast day index (1 = Monday .. 7 = Sunday). */
  dayIndex: number;
  startMinute: number;
  endMinute: number;
  /** Instant the window opens, in UTC. */
  startsAt: Date;
  /** Station calendar day of the window, YYYY-MM-DD. */
  dayKey: string;
}

export interface SlotSearchParams {
  playlistId: number;
  daysMask: number;
  airStartMinute: number | null;
  airEndMinute: number | null;
  daysAhead: number;
  leadMinutes: number;
  bufferMinutes: number;
  durationSec: number;
}

/** Result of a slot search, including the reason when nothing is free. */
export type SlotSearchResult = { ok: true; slot: ScheduleWindow } | { ok: false; reason: string };

/**
 * Expands a schedule item into plain intervals. An item whose end is not after
 * its start wraps around midnight and is reported as two intervals.
 */
function toIntervals(item: PlaylistScheduleItem, playlist: PlaylistDetail): OccupiedInterval[] {
  const base = { playlistId: playlist.id, playlistName: playlist.name };

  if (item.end_time > item.start_time) {
    return [{ startMinute: item.start_time, endMinute: item.end_time, ...base }];
  }

  return [
    { startMinute: item.start_time, endMinute: MINUTES_IN_DAY, ...base },
    { startMinute: 0, endMinute: Math.max(0, item.end_time), ...base },
  ];
}

/**
 * Occupied minutes per AzuraCast day, taken from every playlist of the station.
 * Used to avoid placing a new program on top of another one.
 */
export async function loadOccupiedIntervals(): Promise<Map<number, OccupiedInterval[]>> {
  const byDay = new Map<number, OccupiedInterval[]>();

  let playlists: PlaylistDetail[];
  try {
    playlists = await listStationPlaylists();
  } catch (err) {
    logger.error("ProgramSlots", "Could not read the station playlists", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw new AppError(502, "No se pudo leer la programación de AzuraCast.");
  }

  for (const playlist of playlists) {
    for (const item of playlist.schedule_items ?? []) {
      for (const dayIndex of item.days ?? []) {
        const intervals = byDay.get(dayIndex) ?? [];
        intervals.push(...toIntervals(item, playlist));
        byDay.set(dayIndex, intervals);
      }
    }
  }

  return byDay;
}

function isFree(
  intervals: OccupiedInterval[],
  startMinute: number,
  endMinute: number,
  bufferMinutes: number,
  ownPlaylistId: number
): boolean {
  return intervals.every((interval) => {
    // Episodes of the same program never overlap each other, so its own
    // schedule is compared without the buffer to avoid losing a whole slot.
    const padding = interval.playlistId === ownPlaylistId ? 0 : bufferMinutes;
    const start = startMinute - padding;
    const end = endMinute + padding;
    return end <= interval.startMinute || start >= interval.endMinute;
  });
}

/**
 * Looks for the earliest window able to host an episode without overlapping
 * any program already scheduled on the station.
 */
export async function findFreeSlot(params: SlotSearchParams): Promise<SlotSearchResult> {
  const requiredMinutes = Math.max(1, Math.ceil(params.durationSec / 60));
  const windowStart = Math.min(Math.max(0, params.airStartMinute ?? 0), MINUTES_IN_DAY);
  const windowEnd = Math.max(windowStart, Math.min(MINUTES_IN_DAY, params.airEndMinute ?? MINUTES_IN_DAY));

  if (windowEnd - windowStart < requiredMinutes) {
    return {
      ok: false,
      reason: `La ventana de emisión del programa (${windowEnd - windowStart} min) es más corta que el episodio (${requiredMinutes} min).`,
    };
  }

  const occupied = await loadOccupiedIntervals();
  const earliestStart = Date.now() + params.leadMinutes * 60_000;

  for (let offset = 0; offset <= params.daysAhead; offset++) {
    const dayStart = getStationDayStartWithOffset(offset);
    const stationTime = getStationTime(dayStart);
    const dayIndex = stationTime.dayIndex === 0 ? 7 : stationTime.dayIndex;

    if ((params.daysMask & (1 << (dayIndex - 1))) === 0) continue;

    const dayIntervals = occupied.get(dayIndex) ?? [];

    for (
      let startMinute = windowStart;
      startMinute + requiredMinutes <= windowEnd;
      startMinute += SLOT_STEP_MINUTES
    ) {
      const startsAt = new Date(dayStart.getTime() + startMinute * 60_000);
      if (startsAt.getTime() < earliestStart) continue;
      if (!isFree(dayIntervals, startMinute, startMinute + requiredMinutes, params.bufferMinutes, params.playlistId)) {
        continue;
      }

      return {
        ok: true,
        slot: {
          dayIndex,
          startMinute,
          endMinute: startMinute + requiredMinutes,
          startsAt,
          dayKey: stationTime.dayKey,
        },
      };
    }
  }

  return {
    ok: false,
    reason: `No hay una franja libre de ${requiredMinutes} minutos en los próximos ${params.daysAhead} días.`,
  };
}

/** Removes schedule items whose window matches an exact day and minute range. */
export function withoutWindow(
  items: PlaylistScheduleItem[],
  dayIndex: number,
  startMinute: number
): PlaylistScheduleItem[] {
  return items.filter(
    (item) => !(item.start_time === startMinute && (item.days ?? []).includes(dayIndex))
  );
}

/** Converts a day and minute range into the payload AzuraCast expects. */
export function toScheduleItem(
  dayIndex: number,
  startMinute: number,
  endMinute: number
): PlaylistScheduleItem {
  return {
    start_time: startMinute,
    end_time: endMinute,
    days: [dayIndex],
  };
}

/**
 * Reports whether a concrete window can host an episode. Used by the manual
 * schedule mode, where the admin picks the day and the hour.
 */
export async function isWindowAvailable(
  playlistId: number,
  dayIndex: number,
  startMinute: number,
  endMinute: number,
  bufferMinutes: number
): Promise<boolean> {
  const occupied = await loadOccupiedIntervals();
  return isFree(occupied.get(dayIndex) ?? [], startMinute, endMinute, bufferMinutes, playlistId);
}

/**
 * Replaces the schedule items of a playlist. AzuraCast overwrites the whole
 * collection on every write, so the untouched items must be sent back.
 */
export async function replacePlaylistSchedule(
  playlistId: number,
  items: PlaylistScheduleItem[]
): Promise<void> {
  await updatePlaylist(playlistId, { schedule_items: items });
}

export function minutesToClock(minutes: number): string {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const rest = String(minutes % 60).padStart(2, "0");
  return `${hours}:${rest}`;
}

/** Parses "HH:MM" into minutes since midnight. */
export function clockToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    throw new AppError(400, `Hora inválida: ${value}. Usa el formato HH:MM.`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new AppError(400, `Hora inválida: ${value}.`);
  }
  return hours * 60 + minutes;
}