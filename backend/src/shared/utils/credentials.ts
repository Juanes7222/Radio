import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const CREDENTIAL_BYTES = 32;

export interface IssuedCredential {
  token: string;
  tokenHash: string;
}

function hashCredential(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Issues a 256-bit bearer credential. Only its SHA-256 hash is persisted, so a
 * database leak does not hand over directly usable tokens. The plaintext token
 * is returned once to the caller that requested the credential.
 */
export function issueCredential(): IssuedCredential {
  const token = randomBytes(CREDENTIAL_BYTES).toString("base64url");
  return { token, tokenHash: hashCredential(token) };
}

/**
 * Compares a presented credential against a stored hex hash in constant time.
 * A missing stored hash always denies, so a legacy row without a credential is
 * never authorized by presenting anything.
 */
export function matchesCredential(
  presented: string | null,
  storedHexHash: string | null | undefined
): boolean {
  if (!presented || !storedHexHash) return false;

  const presentedHash = createHash("sha256").update(presented, "utf8").digest();
  const expectedHash = Buffer.from(storedHexHash, "hex");
  if (presentedHash.length !== expectedHash.length) return false;

  return timingSafeEqual(presentedHash, expectedHash);
}

/** Reads a bearer token from an Authorization header, or null when absent. */
export function readBearerCredential(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}
