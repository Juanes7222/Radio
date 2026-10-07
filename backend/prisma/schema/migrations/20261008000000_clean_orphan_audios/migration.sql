-- Elimina los audios que quedaron sin plantilla.
--
-- El endpoint GET /admin-api/locutor/audios fallaba con un 500 porque Prisma
-- rechaza la consulta completa cuando una relación requerida llega nula. Estos
-- audios tienen un template_id que ya no resuelve: se generaron antes de que
-- existiera el bloqueo de borrado, cuando era posible eliminar una plantilla que
-- todavía tenía audios generados.
--
-- Se borran y no se reparan porque no hay a qué plantilla reasignarlos sin
-- inventarla, y el texto ya renderizado queda en text_rendered aunque la
-- plantilla que lo produjo ya no exista. Un audio sin plantilla tampoco se
-- reproduce hoy: el panel solo lo usaba para leer el nombre y el tipo, y
-- AudioBank no los muestra.
DELETE FROM "generated_audios"
WHERE "template_id" NOT IN (
    SELECT "id" FROM "announcement_templates"
);
