import { describe, expect, it } from "vitest";
import { disconnectPrisma, prisma } from "../../src/infrastructure/database/prisma";

type Disconnectable = { $disconnect: () => Promise<void> };

describe("disconnectPrisma", () => {
  it("closes the client", async () => {
    await expect(disconnectPrisma()).resolves.toBeUndefined();
  });

  it("never throws, so a cleanup cannot replace the error of the export", async () => {
    const client = prisma as unknown as Disconnectable;
    const original = client.$disconnect;
    client.$disconnect = () => Promise.reject(new Error("cleanup-boom"));

    try {
      await expect(disconnectPrisma()).resolves.toBeUndefined();
    } finally {
      client.$disconnect = original;
    }
  });
});
