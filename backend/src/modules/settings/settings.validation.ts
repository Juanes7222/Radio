import { getDefinition } from "./settings.catalog";
import type {
  SettingDefinition,
  SettingFieldType,
  SettingValue,
} from "./settings.types";

export type ParseResult<T = SettingValue> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Same shape, named for what it carries: the raw request value already
 * serialized into the text the catalog parse expects, which is not yet a
 * validated setting value.
 */
type Serialized = { ok: true; text: string } | { ok: false; error: string };

/**
 * Deliberately permissive: enough to reject a typo, not to adjudicate an
 * address. A real check is an email, and the station has no way to send one.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What the panel has to send, in the words the error message uses. */
const EXPECTED_TYPE: Record<SettingFieldType, string> = {
  number: "un número",
  boolean: "un valor verdadero o falso",
  text: "un texto",
  emailList: "una lista de correos",
};

/**
 * Turns untrusted request input into either a validated value or a Spanish
 * sentence the caller can return verbatim. It reads no environment and writes
 * nothing: the range check belongs to the write path only, because the
 * environment seeds a read and must not change what an operator may save.
 *
 * Never throws, and never clamps. A rejected out-of-range value is the point:
 * silently moving a 0 to the minimum would let the operator save something they
 * did not write.
 */
export function parseSettingInput(key: string, raw: unknown): ParseResult {
  const definition = getDefinition(key);
  if (!definition) {
    return {
      ok: false,
      error: `No existe el ajuste "${key}" en el catálogo.`,
    };
  }

  const serialized = serializeForDefinition(definition, raw);
  if (!serialized.ok) return serialized;

  let value: SettingValue;
  try {
    value = definition.parse(serialized.text);
  } catch {
    // The catalog message explains the shape to a developer reading the
    // definition; the operator only needs to know the value is unusable.
    return {
      ok: false,
      error: `El valor recibido para "${key}" no es válido.`,
    };
  }

  const rangeError = checkRange(definition, value);
  if (rangeError) return { ok: false, error: rangeError };

  return { ok: true, value };
}

/**
 * The only way a value reaches `station_settings`: the catalog formats it, and
 * the catalog parses whatever it formatted, so the pair cannot drift apart.
 *
 * Throws on a key the catalog does not know. There is no definition to format
 * with, and a row written without one could never be read back.
 */
export function normalizeSettingValue(key: string, value: SettingValue): string {
  const definition = getDefinition(key);
  if (!definition) {
    throw new Error(`Setting not in the catalog: "${key}"`);
  }
  return definition.format(value);
}

/**
 * Serializes the raw request value into the text the definition parses.
 * Numbers and booleans also accept their text form because the table stores
 * text, so a form that posts back what it read sends a string.
 */
function serializeForDefinition(
  definition: SettingDefinition,
  raw: unknown,
): Serialized {
  switch (definition.type) {
    case "number":
      return typeof raw === "number" || typeof raw === "string"
        ? { ok: true, text: String(raw) }
        : wrongType(definition);
    case "boolean":
      return typeof raw === "boolean" || typeof raw === "string"
        ? { ok: true, text: String(raw) }
        : wrongType(definition);
    case "text":
      return typeof raw === "string"
        ? { ok: true, text: raw }
        : wrongType(definition);
    case "emailList":
      return serializeEmailList(definition, raw);
  }
}

/** Every element is checked before the list is joined for the definition. */
function serializeEmailList(
  definition: SettingDefinition,
  raw: unknown,
): Serialized {
  if (!Array.isArray(raw)) return wrongType(definition);

  const items: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !EMAIL_PATTERN.test(item)) {
      return {
        ok: false,
        error: `"${definition.key}" solo admite correos válidos.`,
      };
    }
    items.push(item);
  }
  return { ok: true, text: items.join(",") };
}

function wrongType(definition: SettingDefinition): Serialized {
  return {
    ok: false,
    error: `"${definition.key}" espera ${EXPECTED_TYPE[definition.type]}.`,
  };
}

/** A range only means something for a number, which is the only type that declares one. */
function checkRange(
  definition: SettingDefinition,
  value: SettingValue,
): string | null {
  if (typeof value !== "number") return null;

  const { min, max } = definition;
  if (min !== undefined && max !== undefined) {
    return value >= min && value <= max
      ? null
      : `"${definition.key}" debe estar entre ${min} y ${max}.`;
  }
  // A single bound is still a bound: ignoring it would let a value through that
  // the catalog says is out of range.
  if (min !== undefined && value < min) {
    return `"${definition.key}" no puede ser menor que ${min}.`;
  }
  if (max !== undefined && value > max) {
    return `"${definition.key}" no puede ser mayor que ${max}.`;
  }
  return null;
}