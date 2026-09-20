import { prisma } from "../../infrastructure/database/prisma";
import { normalizeSearch } from "../../shared/utils/sanitize";
import { parseSubscriptions } from "../../shared/utils/subscriptions";
import { logger } from "../../shared/logger/logger";

/**
 * Titles that are station filler rather than programs: they are still synced
 * into the catalog (so the admin sees what exists) but they can never be
 * offered as notifiable.
 */
const NON_PROGRAM_KEYWORDS = [
  "contenido variado",
  "musica",
  "jingles",
  "jingle",
  "himno nacional",
];

export interface NotificationProgramDto {
  id: string;
  titleKey: string;
  title: string;
  notifiable: boolean;
  isDefault: boolean;
  /** True for a real program, false for station filler (music, jingles...). */
  isProgram: boolean;
}

interface RawScheduleItem {
  title?: unknown;
}

function isFillerTitle(title: string): boolean {
  return NON_PROGRAM_KEYWORDS.some((keyword) => title.includes(keyword));
}

function isProgramTitle(title: unknown): title is string {
  return typeof title === "string" && title.trim().length > 0;
}

/**
 * Syncs the catalog with the current AzuraCast schedule: new titles are added
 * as not notifiable, titles that left the schedule are marked as missing so
 * the admin can see them, and existing rows keep their admin configuration.
 */
export async function syncProgramsFromSchedule(schedule: unknown[]): Promise<number> {
  const titles = [
    ...new Set(
      schedule
        .map((item) => (item as RawScheduleItem).title)
        .filter(isProgramTitle)
        .map((title) => title.trim())
    ),
  ];

  for (const title of titles) {
    const titleKey = normalizeSearch(title);
    await prisma.notificationProgram.upsert({
      where: { titleKey },
      create: { titleKey, title, notifiable: false, isDefault: false },
      update: { title },
    });
  }

  logger.info("NotificationPrograms", "Schedule sync finished", {
    scheduleTitles: titles.length,
  });
  return titles.length;
}

export async function listPrograms(): Promise<NotificationProgramDto[]> {
  const rows = await prisma.notificationProgram.findMany({
    orderBy: [{ notifiable: "desc" }, { title: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    titleKey: row.titleKey,
    title: row.title,
    notifiable: row.notifiable,
    isDefault: row.isDefault,
    isProgram: !isFillerTitle(normalizeSearch(row.title)),
  }));
}

export interface UpdateProgramInput {
  notifiable?: boolean;
  isDefault?: boolean;
}

/**
 * Removes a title from every device subscription list. Called when a program
 * stops being notifiable: devices that never reopen the app would otherwise
 * keep receiving reminders for a program the admin turned off.
 */
async function pruneSubscriptions(titleKey: string): Promise<number> {
  const devices = await prisma.device.findMany({
    where: { subscriptions: { not: null } },
    select: { id: true, subscriptions: true },
  });

  let prunedDevices = 0;
  for (const device of devices) {
    const titles = parseSubscriptions(device.subscriptions);
    const next = titles.filter((title) => normalizeSearch(title) !== titleKey);
    if (next.length === titles.length) continue;

    await prisma.device.update({
      where: { id: device.id },
      data: { subscriptions: JSON.stringify(next) },
    });
    prunedDevices += 1;
  }
  return prunedDevices;
}

/**
 * Applies an admin change. Turning off `notifiable` also clears `isDefault`
 * (a program nobody can subscribe to cannot come pre-selected) and prunes the
 * title from every existing device subscription.
 */
export async function updateProgram(
  id: string,
  input: UpdateProgramInput
): Promise<NotificationProgramDto> {
  const current = await prisma.notificationProgram.findUnique({ where: { id } });
  if (!current) throw new Error("Programa no encontrado");

  const notifiable = input.notifiable ?? current.notifiable;
  const isDefault = input.isDefault === undefined ? current.isDefault : input.isDefault;

  const updated = await prisma.notificationProgram.update({
    where: { id },
    data: {
      notifiable,
      isDefault: notifiable ? isDefault : false,
    },
  });

  let prunedDevices = 0;
  if (!notifiable && current.notifiable) {
    prunedDevices = await pruneSubscriptions(current.titleKey);
  }

  logger.info("NotificationPrograms", "Program updated", {
    id: updated.id,
    title: updated.title,
    notifiable: updated.notifiable,
    isDefault: updated.isDefault,
    prunedDevices,
  });

  return {
    id: updated.id,
    titleKey: updated.titleKey,
    title: updated.title,
    notifiable: updated.notifiable,
    isDefault: updated.isDefault,
    isProgram: !isFillerTitle(normalizeSearch(updated.title)),
  };
}

/** Notifiable titles for the public app endpoint, in a stable order. */
export async function listNotifiableTitles(): Promise<string[]> {
  const rows = await prisma.notificationProgram.findMany({
    where: { notifiable: true },
    orderBy: { title: "asc" },
    select: { title: true },
  });
  return rows.map((row) => row.title);
}

/** Titles pre-selected for fresh installs of the app. */
export async function listDefaultTitles(): Promise<string[]> {
  const rows = await prisma.notificationProgram.findMany({
    where: { notifiable: true, isDefault: true },
    orderBy: { title: "asc" },
    select: { title: true },
  });
  return rows.map((row) => row.title);
}
