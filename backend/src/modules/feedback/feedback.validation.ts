import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_LIMITS,
  FEEDBACK_MIN_MENSAJE,
  FEEDBACK_STATUSES,
  type FeedbackCategory,
  type FeedbackStatus,
} from "@radio/types";

const CATEGORY_VALUES = Object.values(FEEDBACK_CATEGORIES);
const STATUS_VALUES = Object.values(FEEDBACK_STATUSES);

export interface FeedbackInput {
  categoria: FeedbackCategory;
  mensaje: string;
  nombre: string | null;
  contacto: string | null;
}

export type ValidationResult =
  | { ok: true; data: FeedbackInput }
  | { ok: false; error: string };

export function isFeedbackCategory(value: unknown): value is FeedbackCategory {
  return (
    typeof value === "string" &&
    (CATEGORY_VALUES as readonly string[]).includes(value)
  );
}

export function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return (
    typeof value === "string" &&
    (STATUS_VALUES as readonly string[]).includes(value)
  );
}

/**
 * Optional fields arrive as `undefined`, `null`, `""` or a string. Everything
 * that is not a non-blank string becomes `null` so the column carries one
 * shape instead of three.
 */
function optionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, maxLength);
}

/**
 * Validates the public POST body. Returns the first problem it finds as a
 * Spanish sentence the caller can send back verbatim.
 */
export function validateFeedbackSubmission(
  body: Record<string, unknown>
): ValidationResult {
  if (body.consent !== true) {
    return { ok: false, error: "Debe aceptar el tratamiento de datos" };
  }

  if (!isFeedbackCategory(body.categoria)) {
    return { ok: false, error: "Motivo invalido" };
  }

  if (typeof body.mensaje !== "string" || body.mensaje.trim().length === 0) {
    return { ok: false, error: "El mensaje es obligatorio" };
  }

  const mensaje = body.mensaje.trim();
  if (mensaje.length < FEEDBACK_MIN_MENSAJE) {
    return {
      ok: false,
      error: `El mensaje debe tener al menos ${FEEDBACK_MIN_MENSAJE} caracteres`,
    };
  }
  if (mensaje.length > FEEDBACK_LIMITS.mensaje) {
    return {
      ok: false,
      error: `El mensaje no puede superar ${FEEDBACK_LIMITS.mensaje} caracteres`,
    };
  }

  const nombre = optionalText(body.nombre, FEEDBACK_LIMITS.nombre);
  if (nombre !== null && nombre.length > FEEDBACK_LIMITS.nombre) {
    return {
      ok: false,
      error: `El nombre no puede superar ${FEEDBACK_LIMITS.nombre} caracteres`,
    };
  }

  const contacto = optionalText(body.contacto, FEEDBACK_LIMITS.contacto);
  if (contacto !== null && contacto.length > FEEDBACK_LIMITS.contacto) {
    return {
      ok: false,
      error: `El contacto no puede superar ${FEEDBACK_LIMITS.contacto} caracteres`,
    };
  }

  return { ok: true, data: { categoria: body.categoria, mensaje, nombre, contacto } };
}

export interface Pagination {
  page: number;
  limit: number;
  skip: number;
}

export function validatePagination(query: Record<string, unknown>): Pagination {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
}