import crypto from "crypto";

/**
 * Cifrado de secretos de proveedor con AES-256-GCM.
 *
 * GCM se elige por la etiqueta de autenticación: una clave alterada en disco
 * falla al descifrar en vez de producir basura que el proveedor rechace sin
 * explicar por qué. La clave maestra vive en `SECRETS_ENCRYPTION_KEY` y no en
 * la base, que entra completa en cada respaldo.
 *
 * No se cachea: leerla en cada llamada cuesta nada y evita que un módulo
 * importado antes de que Infisical cargue se quede con el valor vacío.
 */

const ALGORITHM = "aes-256-gcm";
/** 96 bits es el tamaño de IV para el que GCM está diseñado. */
const IV_BYTES = 12;
const KEY_BYTES = 32;
const HEX_KEY_PATTERN = /^[0-9a-f]{64}$/i;

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

/** La variable de entorno falta o no tiene los 32 bytes que exige el cifrado. */
export class SecretsKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretsKeyError";
  }
}

export function isSecretsKeyConfigured(): boolean {
  try {
    readMasterKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const key = readMasterKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

/**
 * Throws when the master key is missing, when the stored parts have the wrong
 * size or when the authentication tag does not match. Callers decide whether
 * that is a skipped key or a failed request; this module never guesses.
 */
export function decryptSecret({ ciphertext, iv, tag }: EncryptedSecret): string {
  const key = readMasterKey();

  const initializationVector = Buffer.from(iv, "base64");
  if (initializationVector.length !== IV_BYTES) {
    throw new SecretsKeyError("El vector de inicialización guardado no tiene el tamaño esperado.");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, initializationVector);
  decipher.setAuthTag(Buffer.from(tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function readMasterKey(): Buffer {
  const raw = (process.env.SECRETS_ENCRYPTION_KEY ?? "").trim();

  if (!raw) {
    throw new SecretsKeyError(
      "Falta SECRETS_ENCRYPTION_KEY: sin esa variable las claves de proveedor no se pueden cifrar ni descifrar."
    );
  }

  // Hex admite el valor impreso tal cual por `openssl rand -hex 32`; base64 el
  // que produce `openssl rand -base64 32`. Cualquier otra forma se trata como
  // base64 y el tamaño la descarta.
  const key = HEX_KEY_PATTERN.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new SecretsKeyError(
      "SECRETS_ENCRYPTION_KEY debe tener 32 bytes: 64 caracteres hexadecimales o 44 en base64."
    );
  }

  return key;
}
