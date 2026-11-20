-- Telemetría mínima de la app: actividad diaria por dispositivo y errores
-- agrupados. No hay claves foráneas a "devices" a propósito: un ping puede
-- llegar antes de que el dispositivo esté registrado.

CREATE TABLE "device_activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "device_id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "app_version" TEXT,
    "platform" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "device_activity_device_id_day_key" ON "device_activity"("device_id", "day");
CREATE INDEX "device_activity_day_idx" ON "device_activity"("day");

CREATE TABLE "app_errors" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fingerprint" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "app_version" TEXT,
    "platform" TEXT,
    "device_id" TEXT,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "app_errors_fingerprint_key" ON "app_errors"("fingerprint");
CREATE INDEX "app_errors_last_seen_at_idx" ON "app_errors"("last_seen_at");
