-- Restaura la ortografia en las plantillas de ejemplo.
--
-- La migracion anterior se escribio sin tildes ni enye por precaucion con el
-- encoding del archivo, y eso rompio la pronunciacion: el motor de voz leera
-- "acompanamos" como una palabra distinta de "acompañamos". El texto que sale al
-- aire es el unico que no admite esas abreviaturas.

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
    'Te acompañamos en {{station_name}}. {{time_text}}.',
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
