import { config } from '../config';

function getCurrentHour12(): number {
  const hour = new Date().getHours() % 12;
  return hour === 0 ? 12 : hour;
}

function getPeriod(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'de la mañana';
  if (hour < 19) return 'de la tarde';
  return 'de la noche';
}

function getDayName(): string {
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return days[new Date().getDay()];
}

function getFormattedDate(): string {
  const date = new Date();
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${date.getDate()} de ${months[date.getMonth()]}`;
}

function getPeriodGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'días';
  if (hour < 19) return 'tardes';
  return 'noches';
}

export function renderTemplate(template: string, variables: Record<string, string> = {}): string {
  const defaults: Record<string, string | number> = {
    hour: getCurrentHour12(),
    hour24: new Date().getHours(),
    period: getPeriod(),
    period_greeting: getPeriodGreeting(),
    station_name: config.locutor.stationName,
    day: getDayName(),
    date: getFormattedDate(),
    temperature: variables.temperature || '',
  };
  
  return template.replace(/\\{\\{(\\w+)\\}\\}/g, (_, key) => {
    return String(defaults[key] || variables[key] || '');
  });
}
