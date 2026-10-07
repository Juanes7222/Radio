-- Limpia los audios que quedaron sin plantilla, y antes sus horarios.
--
-- El endpoint GET /admin-api/locutor/audios devolvía 500 porque Prisma rechaza
-- la consulta completa cuando una relación requerida llega nula. Estos audios
-- tienen un template_id que ya no resuelve: se generaron antes de que existiera
-- el bloqueo de borrado, cuando era posible eliminar una plantilla que todavía
-- tenía audios generados.
--
-- El orden importa. audio_schedules.audio_id declara ON DELETE RESTRICT sobre
-- generated_audios, así que borrar un audio que todavía tenga un horario
-- programme falla con "FOREIGN KEY constraint failed". Por eso los horarios
-- huérfanos se van primero.
--
-- Se borran y no se reparan porque no hay a qué plantilla reasignarlos sin
-- inventarla. El texto ya renderizado queda en text_rendered aunque la
-- plantilla que lo produjo ya no exista. Ningún consumidor actual necesita la
-- fila: el panel solo leía el nombre y el tipo de la plantilla, y AudioBank no
-- los muestra.
DELETE FROM "audio_schedules"
WHERE "audio_id" IN (
    SELECT "ga"."id"
    FROM "generated_audios" AS "ga"
    LEFT JOIN "announcement_templates" AS "t" ON "t"."id" = "ga"."template_id"
    WHERE "t"."id" IS NULL
);

DELETE FROM "generated_audios"
WHERE "template_id" NOT IN (
    SELECT "id" FROM "announcement_templates"
);
