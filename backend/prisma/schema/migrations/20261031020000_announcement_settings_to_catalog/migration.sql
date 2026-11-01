-- Mueve la configuración de avisos de la fila singleton al catálogo de ajustes.
--
-- El catálogo ya trae defaults, respaldo de entorno y auditoría; mantener dos
-- sistemas para lo mismo conservaba el fallo documentado: `timezone` vivía en
-- la fila y en el entorno a la vez. Cada copia es idempotente: si la clave ya
-- tiene una fila en `station_settings`, la del panel gana y no se pisa.

INSERT INTO "station_settings" ("key", "value", "updated_at", "updated_by")
SELECT 'announcements.enabled', CASE WHEN "enabled" THEN 'true' ELSE 'false' END, CURRENT_TIMESTAMP, 'migracion'
FROM "announcement_settings" WHERE "id" = 'singleton'
  AND NOT EXISTS (SELECT 1 FROM "station_settings" WHERE "key" = 'announcements.enabled');

INSERT INTO "station_settings" ("key", "value", "updated_at", "updated_by")
SELECT 'announcements.maxPerHour', CAST("per_hour" AS TEXT), CURRENT_TIMESTAMP, 'migracion'
FROM "announcement_settings" WHERE "id" = 'singleton'
  AND NOT EXISTS (SELECT 1 FROM "station_settings" WHERE "key" = 'announcements.maxPerHour');

INSERT INTO "station_settings" ("key", "value", "updated_at", "updated_by")
SELECT 'announcements.minGapMinutes', CAST("min_gap_minutes" AS TEXT), CURRENT_TIMESTAMP, 'migracion'
FROM "announcement_settings" WHERE "id" = 'singleton'
  AND NOT EXISTS (SELECT 1 FROM "station_settings" WHERE "key" = 'announcements.minGapMinutes');

INSERT INTO "station_settings" ("key", "value", "updated_at", "updated_by")
SELECT 'announcements.retryIntervalMinutes', CAST("retry_interval_minutes" AS TEXT), CURRENT_TIMESTAMP, 'migracion'
FROM "announcement_settings" WHERE "id" = 'singleton'
  AND NOT EXISTS (SELECT 1 FROM "station_settings" WHERE "key" = 'announcements.retryIntervalMinutes');

-- Los reintentos del plan nuevo se llaman programRetries; el tope anterior era
-- maxRetries y gobernaba el mismo caso, así que se copia a la clave nueva.
INSERT INTO "station_settings" ("key", "value", "updated_at", "updated_by")
SELECT 'announcements.programRetries', CAST("max_retries" AS TEXT), CURRENT_TIMESTAMP, 'migracion'
FROM "announcement_settings" WHERE "id" = 'singleton'
  AND NOT EXISTS (SELECT 1 FROM "station_settings" WHERE "key" = 'announcements.programRetries');

INSERT INTO "station_settings" ("key", "value", "updated_at", "updated_by")
SELECT 'announcements.respectLiveStreamer', CASE WHEN "respect_live_streamer" THEN 'true' ELSE 'false' END, CURRENT_TIMESTAMP, 'migracion'
FROM "announcement_settings" WHERE "id" = 'singleton'
  AND NOT EXISTS (SELECT 1 FROM "station_settings" WHERE "key" = 'announcements.respectLiveStreamer');

INSERT INTO "station_settings" ("key", "value", "updated_at", "updated_by")
SELECT 'announcements.respectScheduledPrograms', CASE WHEN "respect_scheduled_programs" THEN 'true' ELSE 'false' END, CURRENT_TIMESTAMP, 'migracion'
FROM "announcement_settings" WHERE "id" = 'singleton'
  AND NOT EXISTS (SELECT 1 FROM "station_settings" WHERE "key" = 'announcements.respectScheduledPrograms');

INSERT INTO "station_settings" ("key", "value", "updated_at", "updated_by")
SELECT 'announcements.streamerUser', COALESCE("streamer_user", ''), CURRENT_TIMESTAMP, 'migracion'
FROM "announcement_settings" WHERE "id" = 'singleton'
  AND NOT EXISTS (SELECT 1 FROM "station_settings" WHERE "key" = 'announcements.streamerUser');

INSERT INTO "station_settings" ("key", "value", "updated_at", "updated_by")
SELECT 'announcements.bedsDir', "beds_dir", CURRENT_TIMESTAMP, 'migracion'
FROM "announcement_settings" WHERE "id" = 'singleton'
  AND NOT EXISTS (SELECT 1 FROM "station_settings" WHERE "key" = 'announcements.bedsDir');

INSERT INTO "station_settings" ("key", "value", "updated_at", "updated_by")
SELECT 'announcements.bedVolume', CAST("bed_volume" AS TEXT), CURRENT_TIMESTAMP, 'migracion'
FROM "announcement_settings" WHERE "id" = 'singleton'
  AND NOT EXISTS (SELECT 1 FROM "station_settings" WHERE "key" = 'announcements.bedVolume');

INSERT INTO "station_settings" ("key", "value", "updated_at", "updated_by")
SELECT 'announcements.trailingSilenceSeconds', CAST("trailing_silence_seconds" AS TEXT), CURRENT_TIMESTAMP, 'migracion'
FROM "announcement_settings" WHERE "id" = 'singleton'
  AND NOT EXISTS (SELECT 1 FROM "station_settings" WHERE "key" = 'announcements.trailingSilenceSeconds');

INSERT INTO "station_settings" ("key", "value", "updated_at", "updated_by")
SELECT 'station.timezone', "timezone", CURRENT_TIMESTAMP, 'migracion'
FROM "announcement_settings" WHERE "id" = 'singleton'
  AND NOT EXISTS (SELECT 1 FROM "station_settings" WHERE "key" = 'station.timezone');

-- SQLite no renombra preservando índices ni columnas, así que la tabla se
-- reconstruye. La contraseña del streamer se conserva: es lo único que no se
-- movió al catálogo y perderla obligaría a volver a pedirla.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_announcement_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "streamer_password" TEXT,
    "window_edge_margin_minutes" INTEGER NOT NULL DEFAULT 3,
    "min_window_minutes" INTEGER NOT NULL DEFAULT 10,
    "updated_at" DATETIME NOT NULL
);

INSERT INTO "new_announcement_settings" ("id", "streamer_password", "window_edge_margin_minutes", "min_window_minutes", "updated_at")
SELECT "id", "streamer_password", "window_edge_margin_minutes", "min_window_minutes", "updated_at"
FROM "announcement_settings";

DROP TABLE "announcement_settings";

ALTER TABLE "new_announcement_settings" RENAME TO "announcement_settings";

PRAGMA foreign_keys=ON;
