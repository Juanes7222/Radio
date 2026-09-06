import { runNightlyGeneration } from "../locutor/nightly.job";
import { runHourlyCheck } from "../locutor/hourly.job";
import { cleanupNewsFolder } from "../azuracast/cleanup/folderCleanup.service";
import { rescheduleAnnouncements } from "../locutor/playback.job";
import { recoverStaleJobs } from "../workers/jobDispatcher";
import { runProgramNotify } from "../schedule/programNotify.job";
import { captureListenerSnapshot } from "../azuracast/listenerHistory.service";
import { runAllActiveRotations } from "../rotation/rotation.service";
import { updateDbIpDatabase, updateGeoIpDatabase } from "../devices/geoipUpdate.service";
import { cleanupOrphanNoticeMedia } from "../notices/media/media.cleanup";

export type SystemJobKey =
  | "nightly-generation"
  | "hourly-check"
  | "folder-cleanup"
  | "playback-reschedule"
  | "job-recovery"
  | "program-notify"
  | "listener-sampling"
  | "rotations"
  | "geoip-update"
  | "notice-media-cleanup";

export interface SystemJobMeta {
  key: SystemJobKey;
  label: string;
  description: string;
  schedule: string;
  requiresConfirm: boolean;
}

async function runGeoIpUpdate(): Promise<void> {
  await Promise.all([updateGeoIpDatabase(), updateDbIpDatabase()]);
}

export const SYSTEM_JOB_CATALOG: SystemJobMeta[] = [
  {
    key: "nightly-generation",
    label: "Generación nocturna del locutor",
    description: "Genera y programa los audios de las próximas 48 horas. Puede tardar varios minutos y consume TTS.",
    schedule: "02:30",
    requiresConfirm: true,
  },
  {
    key: "hourly-check",
    label: "Revisión horaria del locutor",
    description: "Verifica que la próxima hora tenga audio listo y lo genera si falta.",
    schedule: "minuto 45 de cada hora",
    requiresConfirm: false,
  },
  {
    key: "folder-cleanup",
    label: "Limpieza de carpeta de noticias",
    description: "Elimina de AzuraCast los archivos de noticias ya emitidos. Acción destructiva.",
    schedule: "07:00, 13:00, 19:00",
    requiresConfirm: true,
  },
  {
    key: "playback-reschedule",
    label: "Replanificar anuncios",
    description: "Recalcula los horarios aleatorios de anuncios del día. No reproduce nada de inmediato.",
    schedule: "diario 00:01",
    requiresConfirm: false,
  },
  {
    key: "job-recovery",
    label: "Recuperar jobs de workers",
    description: "Reencola jobs de transcodificación atascados o en error recuperable.",
    schedule: "cada 5 min",
    requiresConfirm: false,
  },
  {
    key: "program-notify",
    label: "Notificar programas próximos",
    description: "Envía push a dispositivos suscritos a programas que empiezan en los próximos 10 minutos.",
    schedule: "cada 5 min",
    requiresConfirm: false,
  },
  {
    key: "listener-sampling",
    label: "Muestra de oyentes",
    description: "Guarda una muestra actual de oyentes para la gráfica del dashboard.",
    schedule: "cada 5 min",
    requiresConfirm: false,
  },
  {
    key: "rotations",
    label: "Rotaciones de playlists",
    description: "Ejecuta todas las rotaciones activas y reconstruye sus playlists destino.",
    schedule: "03:30",
    requiresConfirm: true,
  },
  {
    key: "geoip-update",
    label: "Actualizar bases GeoIP",
    description: "Descarga las bases MaxMind y DB-IP. Requiere red y puede tardar.",
    schedule: "mar/vie 03:00",
    requiresConfirm: false,
  },
  {
    key: "notice-media-cleanup",
    label: "Limpieza de medios de avisos",
    description: "Elimina imágenes y videos huérfanos de más de 90 días sin uso.",
    schedule: "04:15",
    requiresConfirm: false,
  },
];

export const SYSTEM_JOB_RUNNERS: Record<SystemJobKey, () => Promise<unknown>> = {
  "nightly-generation": runNightlyGeneration,
  "hourly-check": runHourlyCheck,
  "folder-cleanup": cleanupNewsFolder,
  "playback-reschedule": rescheduleAnnouncements,
  "job-recovery": recoverStaleJobs,
  "program-notify": runProgramNotify,
  "listener-sampling": captureListenerSnapshot,
  rotations: runAllActiveRotations,
  "geoip-update": runGeoIpUpdate,
  "notice-media-cleanup": cleanupOrphanNoticeMedia,
};

export function isSystemJobKey(value: string): value is SystemJobKey {
  return SYSTEM_JOB_CATALOG.some((job) => job.key === value);
}
