import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/**
 * Closes the client without throwing.
 *
 * A cleanup that throws replaces the error the operator has to read, and the
 * one that says what actually went wrong is the one that matters.
 */
export async function disconnectPrisma(): Promise<void> {
  try {
    await prisma.$disconnect();
  } catch {
    // The cleanup never masks a real failure.
  }
}
