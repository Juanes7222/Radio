-- Configuración, plan y bitácora de los avisos de hora.
--
-- El plan se persiste porque el panel necesita mostrarlo y explicar por qué una
-- hora no sonó. La decisión final sigue tomándose en vivo: un programa puede
-- terminar antes de lo previsto y la ventana que el plan descartó vuelve a
-- estar disponible.
CREATE TABLE "announcement_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
    "per_hour" INTEGER NOT NULL DEFAULT 2,
    "min_gap_minutes" INTEGER NOT NULL DEFAULT 20,
    "window_edge_margin_minutes" INTEGER NOT NULL DEFAULT 3,
    "min_window_minutes" INTEGER NOT NULL DEFAULT 10,
    "retry_interval_minutes" INTEGER NOT NULL DEFAULT 5,
    "max_retries" INTEGER NOT NULL DEFAULT 4,
    "respect_live_streamer" BOOLEAN NOT NULL DEFAULT true,
    "respect_scheduled_programs" BOOLEAN NOT NULL DEFAULT true,
    "streamer_user" TEXT,
    "streamer_password" TEXT,
    "beds_dir" TEXT NOT NULL DEFAULT '../packages/assets/audio',
    "bed_volume" REAL NOT NULL DEFAULT 0.15,
    "trailing_silence_seconds" INTEGER NOT NULL DEFAULT 3,
    "updated_at" DATETIME NOT NULL
);

-- Un slot por aviso candidato. `status` recorre pending -> deferred -> played,
-- con skipped y failed como finales, para que el panel distinga "aún no
-- ocurrió" de "ocurrió y se descartó".
CREATE TABLE "announcement_slots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "minute_of_day" INTEGER NOT NULL,
    "planned_for" DATETIME NOT NULL,
    "plan_date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "settled_at" DATETIME,
    "played_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "announcement_slots_plan_date_minute_of_day_idx" ON "announcement_slots"("plan_date", "minute_of_day");
CREATE INDEX "announcement_slots_status_idx" ON "announcement_slots"("status");
CREATE INDEX "announcement_slots_planned_for_idx" ON "announcement_slots"("planned_for");

-- Una fila por intento, incluidas las reevaluaciones del diferimiento. Guarda
-- la playlist que sonaba para que un bloqueo se pueda explicar con nombre
-- propio en vez de con un código opaco.
CREATE TABLE "announcement_run_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slot_id" TEXT,
    "outcome" TEXT NOT NULL,
    "detail" TEXT,
    "playing_playlist" TEXT,
    "live_streamer" TEXT,
    "duration_ms" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "announcement_run_logs_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "announcement_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "announcement_run_logs_created_at_idx" ON "announcement_run_logs"("created_at");
CREATE INDEX "announcement_run_logs_outcome_idx" ON "announcement_run_logs"("outcome");
