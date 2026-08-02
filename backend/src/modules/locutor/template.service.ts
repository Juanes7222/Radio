import { config } from "../../config";
import { logger } from "../../shared/logger/logger";

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

const HOUR_WORDS: Record<number, string> = {
  0: "doce",
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
  13: "una",
  14: "dos",
  15: "tres",
  16: "cuatro",
  17: "cinco",
  18: "seis",
  19: "siete",
  20: "ocho",
  21: "nueve",
  22: "diez",
  23: "once",
};

const PERIOD_WORDS: Record<number, string> = {
  0: "de la noche",
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

function getPeriod(): string {
  const hour = new Date().getHours();
  return PERIOD_WORDS[hour] ?? "";
}

function getDayName(): string {
  const days = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  return days[new Date().getDay()];
}

function getFormattedDate(): string {
  const date = new Date();
  const months = [
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
  return `${date.getDate()} de ${months[date.getMonth()]}`;
}

function getPeriodGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "días";
  if (hour < 19) return "tardes";
  return "noches";
}

function numberToSpanishMinutes(minutes: number): string {
  if (minutes === 0) return "en punto";
  if (minutes === 15) return "y cuarto";
  if (minutes === 30) return "y media";
  if (minutes === 45) return "menos cuarto";
  if (minutes < 30) return `y ${SPANISH_NUMBERS[minutes]}`;
  return `menos ${SPANISH_NUMBERS[60 - minutes]}`;
}

function getTimeText(hour24: number, minutes: number): string {
  const minutesPhrase = numberToSpanishMinutes(minutes);
  const isAfterHalf = minutes > 30;
  const targetHour = isAfterHalf ? (hour24 + 1) % 24 : hour24;
  const hourWord = HOUR_WORDS[targetHour] ?? `${targetHour}`;
  const periodStr = PERIOD_WORDS[targetHour] ?? "";
  const isOne = targetHour % 12 === 1;
  const verb = isOne ? "Es" : "Son";
  const article = isOne ? "la" : "las";
  return `${verb} ${article} ${hourWord} ${minutesPhrase} ${periodStr}`;
}

export function renderTemplate(template: string, variables: Record<string, string> = {}): string {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();
  const currentHour12 = currentHour % 12 || 12;

  const computedDefaults: Record<string, string | number> = {
    hour: currentHour12,
    hour24: currentHour,
    hour_text: HOUR_WORDS[currentHour12] ?? String(currentHour12),
    period: getPeriod(),
    period_greeting: getPeriodGreeting(),
    station_name: config.locutor.stationName,
    day: getDayName(),
    date: getFormattedDate(),
    minutes: String(currentMinutes).padStart(2, "0"),
    minutes_text: numberToSpanishMinutes(currentMinutes),
    time_text: getTimeText(currentHour, currentMinutes),
  };

  const merged: Record<string, string | number> = { ...computedDefaults };
  for (const key of Object.keys(variables)) {
    if (variables[key] !== undefined && variables[key] !== null && variables[key] !== "") {
      merged[key] = variables[key];
    }
  }

  if (variables.hour24 !== undefined && variables.minutes !== undefined) {
    const h = parseInt(String(variables.hour24), 10);
    const m = parseInt(String(variables.minutes), 10);
    if (!isNaN(h) && !isNaN(m)) {
      merged.minutes_text = numberToSpanishMinutes(m);
      merged.time_text = getTimeText(h, m);
    }
  }

  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = merged[key];
    if (value === undefined || value === null) {
      logger.warn("TemplateService", "Unknown template variable", { key, template });
      return "";
    }
    return String(value);
  });
}
