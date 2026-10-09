-- Corrige la capitalizacion de la hora en las plantillas de ejemplo.
--
-- {{time_text}} entrega la frase en minuscula porque casi todas las plantillas
-- la incrustan a mitad de oracion ("En este momento, {{time_text}}"), que es
-- donde minuscula es lo correcto. "Te acompanamos en {{station_name}}.
-- {{time_text}}." la coloca al principio de una oracion, y ahi sonaba a error:
-- "La Voz de la Verdad. son las diez y once de la noche."
--
-- {{time_sentence}} es la misma frase con la inicial en mayuscula, para esa
-- posicion. Antes la unica hora que devolvia mayuscula era la medianoche
-- ("Es medianoche"), de modo que "En este momento, Es medianoche" fallaba una
-- vez al dia y las otras 23 horas pasaban por filtros que nadie miraba.

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