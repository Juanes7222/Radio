const MAX_RESPONSE_CHARS = 400;

interface HttpErrorShape {
  response?: {
    status?: unknown;
    data?: unknown;
  };
}

function stringifySafely(value: unknown): string | undefined {
  try {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    if (!serialized) return undefined;
    return serialized.length > MAX_RESPONSE_CHARS
      ? `${serialized.slice(0, MAX_RESPONSE_CHARS)}...`
      : serialized;
  } catch {
    return undefined;
  }
}

/**
 * Serializes a thrown value into log-friendly fields. A plain `error.message`
 * hides the driver code (Prisma) and the HTTP status/body (axios), which is
 * exactly the information needed to diagnose a failing job.
 */
export function describeError(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) {
    return { error: String(err) };
  }

  const details: Record<string, unknown> = { error: err.message, errorName: err.name };

  const code = (err as { code?: unknown }).code;
  if (code !== undefined && code !== null) {
    details.code = code;
  }

  const response = (err as HttpErrorShape).response;
  if (response) {
    details.status = response.status;
    details.response = stringifySafely(response.data);
  }

  if (err.stack) {
    details.stack = err.stack
      .split("\n")
      .slice(0, 4)
      .map((line) => line.trim())
      .join(" | ");
  }

  return details;
}
