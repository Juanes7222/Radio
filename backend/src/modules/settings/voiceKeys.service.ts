import fs from "fs/promises";
import path from "path";
import { prisma } from "../../infrastructure/database/prisma";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { AppError } from "../../shared/errors/app-error";
import {
  decryptSecret,
  encryptSecret,
  isSecretsKeyConfigured,
} from "../../shared/crypto/secrets";
import {
  getElevenLabsStatus,
  refreshElevenLabsBalance,
  reloadApiKeys,
  type ElevenLabsBalance,
} from "../locutor/tts/elevenLabs.provider";
import { maskKey } from "../locutor/tts/apiKeyPool.service";
import { TtsProviderConfigError, type TtsProviderId } from "../locutor/tts/tts.types";
import { synthesize } from "../locutor/tts.service";
import { redactForAudit } from "./settings.view";

/**
 * Claves de API de voz guardadas desde el panel.
 *
 * Viven en su propia tabla y no en `station_settings` porque esa tabla entra en
 * el respaldo diario que sube a R2 y se sirve desde el panel: un secreto ahí
 * tendría copia en disco, copia en cada respaldo y un endpoint de lectura más
 * que proteger. Aquí el valor está cifrado y el panel solo recibe los últimos
 * cuatro caracteres.
 */

const LOG = "VoiceKeys";

/** El proveedor cuyo pool se reconstruye desde esta tabla. */
const VOICE_PROVIDER = "elevenlabs";

const MAX_LABEL_LENGTH = 60;
/** Una clave de ElevenLabs ronda los 50 caracteres; el margen es por seguridad. */
const MIN_KEY_LENGTH = 16;
const MAX_KEY_LENGTH = 200;

const TEST_TEXT = "En este momento son las tres de la tarde. Esto es La Voz de la Verdad.";

interface EncryptedParts {
  ciphertext: string;
  iv: string;
  tag: string;
}

export interface VoiceKeyView {
  id: string;
  label: string;
  /** Last four characters, or `****` when the stored value cannot be decrypted. */
  hint: string;
  enabled: boolean;
  /** False when the master key changed or is missing: the value is unreadable. */
  readable: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
  available: boolean;
  blockReason: string | null;
  blockedUntil: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
  balance: ElevenLabsBalance | null;
}

export interface VoiceKeyOverview {
  keys: VoiceKeyView[];
  /** Whether the server can encrypt and decrypt at all. */
  encryptionConfigured: boolean;
  /** Where the pool came from: the table or `ELEVENLABS_API_KEYS`. */
  keySource: "panel" | "environment";
  poolSize: number;
  availableKeys: number;
  balance: ElevenLabsBalance;
}

/**
 * Loads the table into the pool on boot. Fails soft like the settings
 * hydration: a station that starts with the environment keys is recoverable,
 * one that does not start is not.
 */
export async function initVoiceKeyPool(): Promise<void> {
  try {
    await reloadVoiceKeyPool();
  } catch (error) {
    logger.error(LOG, "Could not load the voice keys; the environment keys stay in use", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function getVoiceKeyOverview(): Promise<VoiceKeyOverview> {
  const rows = await prisma.providerApiKey.findMany({
    where: { provider: VOICE_PROVIDER },
    orderBy: { createdAt: "asc" },
  });

  const status = getElevenLabsStatus();

  const keys = rows.map((row) => {
    const plaintext = decryptOrNull(row);
    const hint = plaintext === null ? "****" : maskKey(plaintext);
    const poolEntry = plaintext === null ? undefined : status.keys.find((key) => key.hint === hint);

    return {
      id: row.id,
      label: row.label,
      hint,
      enabled: row.enabled,
      readable: plaintext !== null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy,
      available: poolEntry?.available ?? false,
      blockReason: poolEntry?.blockReason ?? null,
      blockedUntil: poolEntry?.blockedUntil ?? null,
      lastUsedAt: poolEntry?.lastUsedAt ?? null,
      lastError: poolEntry?.lastError ?? null,
      balance: poolEntry?.balance ?? null,
    };
  });

  return {
    keys,
    encryptionConfigured: isSecretsKeyConfigured(),
    keySource: status.apiKeySource,
    poolSize: status.keys.length,
    availableKeys: status.availableKeys,
    balance: status.balance,
  };
}

/**
 * Adds a key and rebuilds the pool before answering, so the next announcement
 * can use it without a restart. The value is compared against the stored ones
 * because pasting the same key twice would just halve its effective quota.
 */
export async function addVoiceKey(input: unknown, actor: string): Promise<void> {
  const { label, key } = parseNewVoiceKey(input);

  if (!isSecretsKeyConfigured()) {
    throw new AppError(
      503,
      "El servidor no tiene SECRETS_ENCRYPTION_KEY, así que no puede cifrar la clave. Configúrala y vuelve a intentarlo."
    );
  }

  const rows = await prisma.providerApiKey.findMany({ where: { provider: VOICE_PROVIDER } });
  const duplicate = rows.some((row) => decryptOrNull(row) === key);
  if (duplicate) {
    throw new AppError(409, "Esa clave ya está guardada.");
  }

  const created = await prisma.providerApiKey.create({
    data: {
      provider: VOICE_PROVIDER,
      label,
      ...encryptSecret(key),
      updatedBy: actor,
    },
  });

  await recordChange(label, null, actor);

  logger.info(LOG, "Voice key added from the panel", {
    id: created.id,
    hint: maskKey(key),
    actor,
  });

  await reloadVoiceKeyPool();
}

/**
 * Retires a key. The pool is rebuilt from the table, so the removed value stops
 * being usable on the next synthesis instead of on the next restart.
 */
export async function removeVoiceKey(id: unknown, actor: string): Promise<void> {
  if (typeof id !== "string" || id.trim() === "") {
    throw new AppError(400, "Falta el identificador de la clave.");
  }

  const row = await prisma.providerApiKey.findUnique({ where: { id } });
  if (!row || row.provider !== VOICE_PROVIDER) {
    throw new AppError(404, "Esa clave ya no existe.");
  }

  await prisma.providerApiKey.delete({ where: { id } });
  await recordChange(row.label, null, actor);

  logger.info(LOG, "Voice key removed from the panel", { id, label: row.label, actor });

  await reloadVoiceKeyPool();
}

/**
 * Synthesizes one short phrase through the same chain the announcements use and
 * reports which engine answered. Refreshing the balance afterwards is the only
 * way to see how much a key has left without waiting for a quota failure.
 */
export async function testVoiceChain(): Promise<{
  provider: TtsProviderId;
  voice: string;
  durationMs: number;
}> {
  const outputPath = path.join(config.locutor.mediaDir, `voice_key_test_${Date.now()}.mp3`);

  try {
    const result = await synthesize({
      text: TEST_TEXT,
      voice: "ef_dora",
      speed: 0.95,
      outputPath,
    });

    return { provider: result.provider, voice: result.voice, durationMs: result.durationMs };
  } catch (error) {
    // The config errors are written for the operator; anything else is a
    // provider or network failure and its message is not worth leaking.
    const message =
      error instanceof TtsProviderConfigError
        ? error.message
        : "Ningún motor de voz pudo sintetizar la frase de prueba.";
    throw new AppError(502, message);
  } finally {
    await fs.unlink(outputPath).catch(() => {});
    await refreshElevenLabsBalance().catch(() => {});
  }
}

/**
 * Rebuilds the pool from the table. An empty table falls back to
 * `ELEVENLABS_API_KEYS` inside the provider, which logs the legacy mode; that
 * keeps a deployment working before the backfill runs.
 */
async function reloadVoiceKeyPool(): Promise<void> {
  const rows = await prisma.providerApiKey.findMany({
    where: { provider: VOICE_PROVIDER, enabled: true },
    orderBy: { createdAt: "asc" },
  });

  const keys: string[] = [];
  for (const row of rows) {
    const plaintext = decryptOrNull(row);
    if (plaintext !== null) keys.push(plaintext);
  }

  reloadApiKeys(keys);
}

function decryptOrNull(row: EncryptedParts & { id?: string; label?: string }): string | null {
  try {
    return decryptSecret(row);
  } catch (error) {
    logger.warn(LOG, "A stored voice key cannot be decrypted", {
      id: row.id,
      label: row.label,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * The audit entry carries the label so the log says which key changed, and the
 * value goes through the redaction marker: a secret never reaches the log.
 */
async function recordChange(label: string, previous: string | null, actor: string): Promise<void> {
  const key = `voice.apiKey.${label}`;

  await prisma.stationSettingChange.create({
    data: {
      key,
      previousValue: redactForAudit(key, previous),
      newValue: redactForAudit(key, label),
      changedBy: actor,
    },
  });
}

function parseNewVoiceKey(input: unknown): { label: string; key: string } {
  const body = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;

  const label = typeof body.label === "string" ? body.label.trim() : "";
  const key = typeof body.key === "string" ? body.key.trim() : "";

  if (label.length === 0 || label.length > MAX_LABEL_LENGTH) {
    throw new AppError(
      400,
      `La etiqueta es obligatoria y no puede pasar de ${MAX_LABEL_LENGTH} caracteres.`
    );
  }

  if (key.length < MIN_KEY_LENGTH || key.length > MAX_KEY_LENGTH || /\s/.test(key)) {
    throw new AppError(400, "La clave no parece completa: pega el valor entero del proveedor.");
  }

  return { label, key };
}
