import { useEffect, useState } from "react";
import { Link } from "react-router";
import { BookOpen, CalendarDays } from "lucide-react";
import { fetchSchedule, mergeConsecutiveScheduleItems } from "@radio/api";
import { API_BASE_URL, apiUrl } from "@/config";
import { formatChapters } from "@/lib/format";
import type { BibleReadingToday, ScheduleItem } from "@radio/types";

const UPCOMING_LIMIT = 2;

interface UpcomingProgram {
  title: string;
  start: string;
}

function formatHour(timestampSeconds: number): string {
  return new Date(timestampSeconds * 1000).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Picks what airs next from the weekly grid. Consecutive slots of the same
 * program are merged first so a 30-minute block does not fill the list.
 */
function selectUpcomingPrograms(schedule: ScheduleItem[]): UpcomingProgram[] {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const stillAiring = schedule.filter((item) => item.end_timestamp > nowSeconds);

  return mergeConsecutiveScheduleItems(stillAiring)
    .filter((item) => item.start_timestamp > nowSeconds)
    .slice(0, UPCOMING_LIMIT)
    .map((item) => ({
      title: item.title,
      start: formatHour(item.start_timestamp),
    }));
}

async function fetchTodayReading(): Promise<string | null> {
  try {
    const response = await fetch(apiUrl("/api/bible/reading/today"));
    if (!response.ok) return null;

    const data = (await response.json()) as BibleReadingToday;
    const chapters = data.reading?.chapters ?? [];
    return chapters.length > 0 ? formatChapters(chapters) : null;
  } catch {
    return null;
  }
}

/**
 * Content shown only while the stream is down: what airs next and the Bible
 * reading of the day, so a listener without audio still has something useful
 * to read. Renders nothing when neither source loads, keeping the banner
 * compact instead of showing an empty shell.
 */
export function StreamDownHelp() {
  const [programs, setPrograms] = useState<UpcomingProgram[]>([]);
  const [reading, setReading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchSchedule(API_BASE_URL).then((schedule) => {
      if (!cancelled && schedule) setPrograms(selectUpcomingPrograms(schedule));
    });
    fetchTodayReading().then((value) => {
      if (!cancelled) setReading(value);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (programs.length === 0 && !reading) return null;

  return (
    <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {programs.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5">
          <CalendarDays className="size-3.5 shrink-0" />
          <span className="opacity-80">Sigue:</span>
          {programs.map((program) => (
            <span
              key={`${program.title}-${program.start}`}
              className="font-medium"
            >
              {program.start} · {program.title}
            </span>
          ))}
        </p>
      )}

      {reading && (
        <p className="flex flex-wrap items-center gap-1.5">
          <BookOpen className="size-3.5 shrink-0" />
          <span className="opacity-80">Lectura bíblica de hoy:</span>
          <span className="font-medium">{reading}</span>
        </p>
      )}

      <Link
        to="/programacion"
        className="font-medium underline underline-offset-2"
      >
        Ver programación
      </Link>
    </div>
  );
}
