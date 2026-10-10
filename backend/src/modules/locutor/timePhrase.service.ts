import { config } from "../../config";

/**
 * Natural Spanish time phrasing for spoken announcements.
 *
 * The previous formatter only produced the hour word and leaned on "menos
 * dieciocho" for anything past the half hour. On air that produced sentences
 * like "la hora en este momento es doce", which nobody says, and it could not
 * describe a minute at all: an announcement fired at 21:42 announced the hour
 * alone and was simply wrong.
 *
 * Everything here is built for the ear. Numbers are spelled out because a TTS
 * engine reading "42" produces inconsistent pronunciation, "en punto" is only
 * used at minute zero, and the verb agrees with the hour ("es la una", "son
 * las dos") because that agreement is exactly what makes a sentence sound like
 * a person said it.
 */

const SPANISH_NUMBERS: Record<number, string> = {
  0: "cero",
  1: "uno",
  2: "dos",
  3: "tres",
  4: "cuatro",
  5: "cinco",
  6: "seis",
  7: "siete",
  8: "ocho",
  9: "nueve",
  10: "diez",
  11: "once",
  12: "doce",
  13: "trece",
  14: "catorce",
  15: "quince",
  16: "dieciséis",
  17: "diecisiete",
  18: "dieciocho",
  19: "diecinueve",
  20: "veinte",
  21: "veintiuno",
  22: "veintidós",
  23: "veintitrés",
  24: "veinticuatro",
  25: "veinticinco",
  26: "veintiséis",
  27: "veintisiete",
  28: "veintiocho",
  29: "veintinueve",
  30: "treinta",
  31: "treinta y uno",
  32: "treinta y dos",
  33: "treinta y tres",
  34: "treinta y cuatro",
  35: "treinta y cinco",
  36: "treinta y seis",
  37: "treinta y siete",
  38: "treinta y ocho",
  39: "treinta y nueve",
  40: "cuarenta",
  41: "cuarenta y uno",
  42: "cuarenta y dos",
  43: "cuarenta y tres",
  44: "cuarenta y cuatro",
  45: "cuarenta y cinco",
  46: "cuarenta y seis",
  47: "cuarenta y siete",
  48: "cuarenta y ocho",
  49: "cuarenta y nueve",
  50: "cincuenta",
  51: "cincuenta y uno",
  52: "cincuenta y dos",
  53: "cincuenta y tres",
  54: "cincuenta y cuatro",
  55: "cincuenta y cinco",
  56: "cincuenta y seis",
  57: "cincuenta y siete",
  58: "cincuenta y ocho",
  59: "cincuenta y nueve",
};

/** Hour word on the 12-hour clock. Index is 1-12, so `0` maps to twelve. */
const HOUR_WORDS: Record<number, string> = {
  1: "una",
  2: "dos",
  3: "tres",
  4: "cuatro",
  5: "cinco",
  6: "seis",
  7: "siete",
  8: "ocho",
  9: "nueve",
  10: "diez",
  11: "once",
  12: "doce",
};

const PERIOD_WORDS: Record<number, string> = {
  0: "de la madrugada",
  1: "de la madrugada",
  2: "de la madrugada",
  3: "de la madrugada",
  4: "de la madrugada",
  5: "de la madrugada",
  6: "de la mañana",
  7: "de la mañana",
  8: "de la mañana",
  9: "de la mañana",
  10: "de la mañana",
  11: "de la mañana",
  12: "del mediodía",
  13: "de la tarde",
  14: "de la tarde",
  15: "de la tarde",
  16: "de la tarde",
  17: "de la tarde",
  18: "de la tarde",
  19: "de la noche",
  20: "de la noche",
  21: "de la noche",
  22: "de la noche",
  23: "de la noche",
};

const DAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function normalizeHour(hour24: number): number {
  const wrapped = ((Math.trunc(hour24) % 24) + 24) % 24;
  return wrapped;
}

function normalizeMinute(minute: number): number {
  const wrapped = ((Math.trunc(minute) % 60) + 60) % 60;
  return wrapped;
}

/** Hour on the 12-hour clock, where midnight and noon are both twelve. */
export function to12Hour(hour24: number): number {
  const remainder = normalizeHour(hour24) % 12;
  return remainder === 0 ? 12 : remainder;
}

export function hourWord(hour24: number): string {
  const twelve = to12Hour(hour24);
  return HOUR_WORDS[twelve] ?? String(twelve);
}

export function periodWord(hour24: number): string {
  return PERIOD_WORDS[normalizeHour(hour24)] ?? "de la noche";
}

/**
 * The minutes clause. Minute zero is "en punto" because that is what a clock
 * announcement says; quarter and half have their own words because "y quince"
 * and "y treinta" sound like a machine counting.
 */
export function minuteClause(minute: number): string {
  const value = normalizeMinute(minute);
  if (value === 0) return "en punto";
  if (value === 15) return "y cuarto";
  if (value === 30) return "y media";
  return `y ${SPANISH_NUMBERS[value]}`;
}

/**
 * Full spoken time as a clause: "son las nueve y cuarenta y dos de la noche".
 *
 * The verb agrees with the hour, which is what makes the sentence sound spoken
 * rather than read: Spanish uses "es la una" but "son las dos" onward, and
 * twelve behaves like a plural.
 *
 * Always lowercase: it is a clause for mid-sentence use. Templates that open the
 * announcement with it need `timePhraseSentence`, since only one of the two
 * positions can be spelled correctly.
 */
export function timePhrase(hour24: number, minute: number): string {
  const hour = normalizeHour(hour24);
  const minuteValue = normalizeMinute(minute);

  if (hour === 0 && minuteValue === 0) {
    return "es medianoche";
  }

  const twelve = to12Hour(hour);
  const hourName = hourWord(hour);
  const clause = minuteClause(minuteValue);
  const period = periodWord(hour);

  const isSingular = twelve === 1;
  const verb = isSingular ? "es" : "son";
  const article = isSingular ? "la" : "las";

  return `${verb} ${article} ${hourName} ${clause} ${period}`;
}

/** `timePhrase` with the initial capitalized: "Son las nueve y cuarenta y dos". */
export function timePhraseSentence(hour24: number, minute: number): string {
  const clause = timePhrase(hour24, minute);
  return clause.charAt(0).toUpperCase() + clause.slice(1);
}

/**
 * Time without the verb and without the article: "nueve y cuarenta y dos de la
 * noche". For templates that already supply their own wording, so the article
 * is never doubled up.
 */
export function timePhraseBare(hour24: number, minute: number): string {
  const hour = normalizeHour(hour24);
  if (hour === 0 && normalizeMinute(minute) === 0) return "medianoche";

  return `${hourWord(hour)} ${minuteClause(minute)} ${periodWord(hour)}`;
}

export function dayName(dayIndex: number): string {
  return DAY_NAMES[dayIndex] ?? "";
}

export function formattedDate(day: number, month: number): string {
  return `${day} de ${MONTH_NAMES[month - 1] ?? ""}`;
}

export function greetingPeriod(hour24: number): string {
  const hour = normalizeHour(hour24);
  if (hour < 12) return "días";
  if (hour < 19) return "tardes";
  return "noches";
}

/**
 * Every variable a template can use, for a given station instant. Announcements
 * fire at arbitrary minutes, so `hour24` and `minutes` must be passed
 * together by the caller to describe the moment the audio is actually made.
 */
export function buildTemplateVariables(
  hour24: number,
  minute: number,
  dayIndex: number,
  day: number,
  month: number
): Record<string, string> {
  return {
    hour: String(to12Hour(hour24)),
    hour24: String(normalizeHour(hour24)),
    hour_text: hourWord(hour24),
    minutes: String(normalizeMinute(minute)).padStart(2, "0"),
    minutes_text: minuteClause(minute),
    period: periodWord(hour24),
    period_greeting: greetingPeriod(hour24),
    time_text: timePhrase(hour24, minute),
    time_sentence: timePhraseSentence(hour24, minute),
    time_bare: timePhraseBare(hour24, minute),
    station_name: config.locutor.stationName,
    day: dayName(dayIndex),
    date: formattedDate(day, month),
  };
}
