import { prisma } from "../../infrastructure/database/prisma";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Deletes every prayer request older than the retention window. The bearer
 * credential lives in the same row, so the purge removes it as well. Returns
 * the number of removed requests. A non-positive window disables the purge.
 */
export async function purgeExpiredPrayerRequests(retentionDays: number): Promise<number> {
  if (retentionDays <= 0) return 0;

  const cutoff = new Date(Date.now() - retentionDays * MS_PER_DAY);
  const result = await prisma.prayerRequest.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}
