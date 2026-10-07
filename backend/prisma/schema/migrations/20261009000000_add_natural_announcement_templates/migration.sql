-- Plantillas de ejemplo con el texto hablado corregido.
--
-- Las plantillas existentes usaban {{hour_text}}, que solo devuelve la hora.
-- Con el planificador anunciando en minutos arbitrarios, un aviso que suena a
-- las 21:42 decia "son las nueve": no solo sonaba raro, era incorrecto.
-- {{time_text}} entrega la frase completa, con concordancia de verbo y articulo
-- y el minuto en palabras.
--
-- Solo se insertan si la tabla esta vacia: una instalacion que ya tiene
-- plantillas propias conserva las suyas y puede revisarlas en el panel con la
-- previsualizacion.
INSERT INTO "announcement_templates" (id, type, name, text_template, voice, speed, active, created_at, updated_at)
SELECT
    'plantilla-hora-natural',
    'hourly',
    'Hora natural',
    'En este momento, {{time_text}}. Esto es {{station_name}}.',
    'ef_dora',
    0.9,
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "announcement_templates");

INSERT INTO "announcement_templates" (id, type, name, text_template, voice, speed, active, created_at, updated_at)
SELECT
    'plantilla-compania',
    'hourly',
    'Compania de La Voz',
    'Te acompanamos en {{station_name}}. {{time_text}}.',
    'em_alex',
    0.9,
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE (SELECT COUNT(*) FROM "announcement_templates" WHERE id = 'plantilla-hora-natural') = 1
  AND NOT EXISTS (SELECT 1 FROM "announcement_templates" WHERE id = 'plantilla-compania');
