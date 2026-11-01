-- Cierra el traslado de la configuración de avisos al catálogo.
--
-- Quedaba una tabla con un nombre que ya no describía su contenido: dos
-- márgenes del análisis del día, que dejaron de ser ajustes, y la contraseña del
-- locutor automático. La contraseña se conserva en una tabla propia con nombre
-- honesto; los márgenes se van con la tabla, porque el análisis del día usa
-- constantes desde que el muestreo dejó de hacerse por franjas.

CREATE TABLE "announcement_streamer_credentials" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "streamer_password" TEXT,
    "updated_at" DATETIME NOT NULL
);

INSERT INTO "announcement_streamer_credentials" ("id", "streamer_password", "updated_at")
SELECT "id", "streamer_password", "updated_at"
FROM "announcement_settings"
WHERE "streamer_password" IS NOT NULL;

DROP TABLE "announcement_settings";
