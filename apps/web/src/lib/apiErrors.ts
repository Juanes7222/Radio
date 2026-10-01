import axios from 'axios';

function isHtml(value: unknown): boolean {
  return typeof value === 'string' && value.trimStart().startsWith('<');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Turns a failed request into a message the admin panel can act on.
 *
 * A single generic fallback used to hide the failures that actually happen
 * while developing: a wrong proxy target (the dev server answers 404 with an
 * HTML page), an unreachable backend, and a backend that never answers. Each
 * one needs a different fix, so they are reported separately.
 */
export function describeRequestError(err: unknown): string {
  if (!axios.isAxiosError(err)) {
    return 'Error inesperado al procesar la solicitud.';
  }

  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
    return 'El servidor no respondio a tiempo. Revisa la red o el destino configurado en VITE_API_PROXY_TARGET.';
  }

  const response = err.response;
  if (!response) {
    return 'No se pudo conectar con el backend. Revisa VITE_API_BASE_URL y VITE_API_PROXY_TARGET.';
  }

  if (isRecord(response.data) && typeof response.data.error === 'string') {
    return response.data.error;
  }

  if (isHtml(response.data)) {
    return `El servidor respondio ${response.status} con una pagina HTML en lugar de JSON: la URL no apunta al backend de la API.`;
  }

  const status = [response.status, response.statusText].filter(Boolean).join(' ');
  return `El servidor respondio ${status}.`;
}