-- Ajustes de la estación administrables desde el panel. Una fila por clave, en
-- texto: el catálogo de código declara el tipo y lo parsea al leer, así que
-- agregar un ajuste es un cambio de código y no una migración.
CREATE TABLE "station_settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL,
    "updated_by" TEXT
);

-- Quién cambió qué. El índice por clave existe porque el historial se filtra
-- por clave; el de fecha porque se lee en orden inverso al escribir.
CREATE TABLE "station_setting_changes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "previous_value" TEXT,
    "new_value" TEXT,
    "changed_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "station_setting_changes_created_at_idx" ON "station_setting_changes"("created_at");
CREATE INDEX "station_setting_changes_key_idx" ON "station_setting_changes"("key");
