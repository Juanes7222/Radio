import "dotenv/config";
import { prisma } from "../infrastructure/database/prisma";
import { parseChannelId } from "../modules/youtube/channelId";

/**
 * One-shot migration of the channel list out of the environment and into the
 * registry, so deploying the panel does not silently stop the ingestion.
 *
 * Read `YOUTUBE_CHANNEL_IDS` and `YOUTUBE_CHANNEL_NOTICES` one last time, write the
 * rows, then delete both from Infisical and from the .env.
 *
 * `update: {}` is deliberate: an operator who already added a channel by hand keeps
 * whatever name and category they gave it.
 */
function listFromEnv(key: string): string[] {
  return (process.env[key] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const groups: ReadonlyArray<readonly [string[], "GENERAL" | "NEWS"]> = [
    [listFromEnv("YOUTUBE_CHANNEL_IDS"), "GENERAL"],
    [listFromEnv("YOUTUBE_CHANNEL_NOTICES"), "NEWS"],
  ];

  let written = 0;

  for (const [channelIds, category] of groups) {
    for (const raw of channelIds) {
      let channelId: string;
      try {
        channelId = parseChannelId(raw);
      } catch {
        console.error(`[backfill] no se pudo leer el canal "${raw}", se omite`);
        continue;
      }

      await prisma.youTubeChannel.upsert({
        where: { channelId },
        create: { channelId, title: channelId, category },
        update: {},
      });
      written += 1;
      console.log(`[backfill] ${channelId} -> ${category}`);
    }
  }

  console.log(`[backfill] listo. ${written} canales escritos.`);
  console.log("[backfill] borra YOUTUBE_CHANNEL_IDS y YOUTUBE_CHANNEL_NOTICES de Infisical.");
}

main()
  .catch((err) => {
    console.error("[backfill] falló:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());