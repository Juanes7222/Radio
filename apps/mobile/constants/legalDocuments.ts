import { WEB_URL } from '@/constants/api';

/**
 * The station's legal corpus as published on the website. Mirrors LEGAL_LINKS
 * in apps/web/src/lib/navigation.ts so the mobile app and the site footer never
 * list different documents, different labels or different paths.
 *
 * `requiredInApp` marks the documents the app itself asks the listener to
 * accept, as opposed to the ones that only govern the website.
 */
export const LEGAL_DOCUMENTS = {
  terms: {
    id: 'terms',
    path: '/info/terms',
    label: 'Términos y condiciones',
    note: 'Qué se acepta al usar la app',
    requiredInApp: false,
  },
  privacy: {
    id: 'privacy',
    path: '/info/privacy',
    label: 'Política de privacidad',
    note: 'Qué datos guarda la app y por qué',
    requiredInApp: false,
  },
  'data-treatment': {
    id: 'data-treatment',
    path: '/info/data-treatment',
    label: 'Tratamiento de datos personales',
    note: 'Ley 1581 de 2012 · Colombia',
    requiredInApp: true,
  },
  cookies: {
    id: 'cookies',
    path: '/info/cookies',
    label: 'Política de cookies',
    note: 'Cookies del sitio web',
    requiredInApp: false,
  },
} as const;

export type LegalDocumentId = keyof typeof LEGAL_DOCUMENTS;

export type LegalDocument = (typeof LEGAL_DOCUMENTS)[LegalDocumentId];

export function legalUrl(id: LegalDocumentId): string {
  return `${WEB_URL}${LEGAL_DOCUMENTS[id].path}`;
}