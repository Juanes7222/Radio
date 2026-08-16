import { prisma } from "../../infrastructure/database/prisma";
import { azuracastApi, STATION_ID } from "./azuracast.client";
import { AZURACAST_BASE_URL_TIMEOUTS } from "../../shared/constants";

const SNAPSHOT_RETENTION_DAYS = 30;

export interface ListenerHistoryPoint {
  recordedAt: Date;
  current: number;
  unique: number;
  total: number;
}

/**
 * Consulta el nowplaying de AzuraCast y guarda un punto del historial.
 * Se ejecuta cada 5 minutos desde el scheduler.
 */
export async function captureListenerSnapshot(): Promise<void> {
  const { data } = await azuracastApi.get(`/nowplaying/${STATION_ID}`, {
    timeout: AZURACAST_BASE_URL_TIMEOUTS.nowPlaying,
  });

  const listeners = data?.listeners ?? {};

  await prisma.listenerSnapshot.create({
    data: {
      current: listeners.current ?? 0,
      unique: listeners.unique ?? 0,
      total: listeners.total ?? 0,
    },
  });

  // Retention: descarta muestras antiguas para evitar crecimiento sin límite.
  const cutoff = new Date(Date.now() - SNAPSHOT_RETENTION_DAYS * 86_400_000);
  await prisma.listenerSnapshot.deleteMany({
    where: { recordedAt: { lt: cutoff } },
  });
}

/** Devuelve los puntos de historial registrados en las últimas `hours` horas. */
export async function getListenerHistory(hours: number): Promise<ListenerHistoryPoint[]> {
  const since = new Date(Date.now() - hours * 3_600_000);
  const rows = await prisma.listenerSnapshot.findMany({
    where: { recordedAt: { gte: since } },
    orderBy: { recordedAt: "asc" },
    select: { current: true, unique: true, total: true, recordedAt: true },
  });
  return rows;
}
