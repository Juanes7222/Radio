UPDATE "announcement_templates"
SET "text_template" = 'Una pausa para poner el reloj al día. {{time_sentence}}. Seguimos en {{station_name}}.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "type" = 'hourly' AND (
  ("id" = 'plantilla-hora-natural' AND "text_template" = 'En este momento, {{time_text}}. Esto es {{station_name}}.')
  OR ("name" = 'Aviso de Hora (Dinamico)' AND "text_template" = 'Estás escuchando {{station_name}}, la hora en este momento es {{hour_text}}.')
);

UPDATE "announcement_templates"
SET "text_template" = 'Gracias por dejarnos acompañarte. Aquí, en {{station_name}}, {{time_text}}.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "type" = 'hourly' AND (
  ("id" = 'plantilla-compania' AND "text_template" = 'Te acompañamos en {{station_name}}. {{time_sentence}}.')
  OR ("name" = 'Aviso de Hora (Calido)' AND "text_template" = 'Sigue en sintonía con {{station_name}}. En este momento, son las {{hour_text}}.')
);

UPDATE "announcement_templates"
SET "text_template" = 'A quienes se conectan a esta hora, un saludo desde {{station_name}}. {{time_sentence}}.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "type" = 'hourly'
  AND "name" = 'Aviso de Hora (Nocturno)'
  AND "text_template" = 'Te acompañamos en {{station_name}}... Son las {{hour_text}}.';

INSERT INTO "announcement_templates" (id, type, name, text_template, voice, speed, active, created_at, updated_at)
SELECT 'plantilla-pausa-reloj', 'hourly', 'Saludo a quienes se conectan',
       'A quienes se conectan a esta hora, un saludo desde {{station_name}}. {{time_sentence}}.',
       "voice", "speed", 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "announcement_templates"
WHERE "id" = 'plantilla-hora-natural' AND "active" = 1
  AND "text_template" = 'Una pausa para poner el reloj al día. {{time_sentence}}. Seguimos en {{station_name}}.'
  AND NOT EXISTS (SELECT 1 FROM "announcement_templates" WHERE "id" = 'plantilla-pausa-reloj');
