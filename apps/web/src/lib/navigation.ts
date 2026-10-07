import { CalendarClock, CircleQuestionMark, Home, MessageSquareText, type LucideIcon } from 'lucide-react';

export interface NavLink {
  to: string;
  label: string;
}

/**
 * The station's public route map. `PUBLIC_DESTINATIONS` drives the mobile
 * drawer; `LEGAL_LINKS` is shared with the footer so the four legal documents
 * never drift apart between the two places that list them.
 */
export const PUBLIC_DESTINATIONS: readonly (NavLink & { icon: LucideIcon })[] = [
  { to: '/', label: 'Inicio', icon: Home },
  { to: '/programacion', label: 'Programación', icon: CalendarClock },
  { to: '/opiniones', label: 'Opiniones', icon: MessageSquareText },
  { to: '/info/who-we-are', label: '¿Quiénes somos?', icon: CircleQuestionMark },
];

export const LEGAL_LINKS: readonly NavLink[] = [
  { to: '/info/terms', label: 'Términos y condiciones' },
  { to: '/info/privacy', label: 'Política de privacidad' },
  { to: '/info/data-treatment', label: 'Tratamiento de datos personales' },
  { to: '/info/cookies', label: 'Política de cookies' },
];