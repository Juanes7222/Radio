import { AppError } from "../../shared/errors/app-error";

const CHANNEL_ID_PATTERN = /^UC[\w-]{22}$/;

/**
 * Reduces what an operator pastes to a channel id: the bare id, a URL that carries
 * `channel_id`, or the `/channel/UC...` path form.
 *
 * An `@handle` cannot be resolved without a Google credential, so it is rejected
 * with a message that says so instead of failing somewhere further down.
 *
 * This lives apart from the channel service on purpose: the one-shot backfill needs
 * the parser, and importing the service from it would pull the whole backend config
 * into a script that only has to write a few rows.
 */
export function parseChannelId(input: string): string {
  const value = input.trim();

  if (CHANNEL_ID_PATTERN.test(value)) return value;

  const fromQuery = /[?&]channel_id=(UC[\w-]{22})/.exec(value)?.[1];
  const fromPath = /\/channel\/(UC[\w-]{22})/.exec(value)?.[1];
  const resolved = fromQuery ?? fromPath;

  if (resolved) return resolved;

  throw new AppError(
    400,
    "No se pudo leer el canal. Pega el identificador (empieza por UC) o la URL del canal; un @nombre no alcanza."
  );
}