-- Points the shipped templates at the time variable that matches where the
-- clause lands in the sentence.
--
-- {{time_text}} is lowercase, which is right mid-sentence ("En este momento,
-- {{time_text}}"). "Te acompanamos en {{station_name}}. {{time_text}}." puts it
-- at the start of a sentence, where it read "La Voz de la Verdad. son las diez
-- y once de la noche." Midnight was the only hour that came back capitalized, so
-- that template was right for 23 hours and the other one for a single hour.
--
-- {{time_sentence}} is the same clause with the initial capitalized.

INSERT INTO "announcement_templates"
  (id, type, name, text_template, voice, speed, active, created_at, updated_at)
VALUES (
    'plantilla-hora-natural',
    'hourly',
    'Hora natural',
    'En este momento, {{time_text}}. Esto es {{station_name}}.',
    'ef_dora',
    0.9,
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  text_template = excluded.text_template,
  updated_at = excluded.updated_at;

INSERT INTO "announcement_templates"
  (id, type, name, text_template, voice, speed, active, created_at, updated_at)
VALUES (
    'plantilla-compania',
    'hourly',
    'Compañía de La Voz',
    'Te acompañamos en {{station_name}}. {{time_sentence}}.',
    'em_alex',
    0.9,
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  text_template = excluded.text_template,
  updated_at = excluded.updated_at;