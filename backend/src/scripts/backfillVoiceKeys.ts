import "dotenv/config";
import { prisma } from "../infrastructure/database/prisma";
import {
  decryptSecret,
  encryptSecret,
  isSecretsKeyConfigured,
} from "../shared/crypto/secrets";

/**
 * One-shot migration of `ELEVENLABS_API_KEYS` into the encrypted table.
 *
 * Run it once per deployment, then delete the variable from Infisical: from
 * then on the panel is the only owner of the pool. Keys already stored are
 * skipped, so running it twice is harmless.
 */
const PROVIDER = "elevenlabs";

function listFromEnv(key: string): string[] {
  return (process.env[key] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function hint(key: string): string {
  return `****${key.slice(-4)}`;
}

async function main(): Promise<void> {
  if (!isSecretsKeyConfigured()) {
    console.error(
      "[backfill] falta SECRETS_ENCRYPTION_KEY. Genera una con `openssl rand -base64 32` y vuelve a intentarlo."
    );
    process.exitCode = 1;
    return;
  }

  const keys = listFromEnv("ELEVENLABS_API_KEYS");
  if (keys.length === 0) {
    console.log("[backfill] ELEVENLABS_API_KEYS esta vacia o no existe: no hay nada que copiar.");
    return;
  }

  const existing = await prisma.providerApiKey.findMany({ where: { provider: PROVIDER } });
  const stored = new Set<string>();
  for (const row of existing) {
    try {
      stored.add(decryptSecret(row));
    } catch {
      // A row encrypted with another master key cannot be compared; it is
      // reported and left alone instead of being silently overwritten.
      console.error(`[backfill] la clave ${row.label} no se puede descifrar, se omite`);
    }
  }

  let written = 0;

  for (const key of keys) {
    if (stored.has(key)) {
      console.log(`[backfill] ${hint(key)} ya estaba guardada, se omite`);
      continue;
    }

    await prisma.providerApiKey.create({
      data: {
        provider: PROVIDER,
        label: `Entorno ${hint(key)}`,
        ...encryptSecret(key),
        updatedBy: "backfill",
      },
    });

    written += 1;
    console.log(`[backfill] ${hint(key)} cifrada`);
  }

  console.log(`[backfill] listo. ${written} claves escritas.`);
  console.log("[backfill] borra ELEVENLABS_API_KEYS de Infisical y reinicia el backend.");
}

main()
  .catch((err) => {
    console.error("[backfill] fallo:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
