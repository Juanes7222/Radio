import { prisma } from "../../infrastructure/database/prisma";
import { sendPushToTokens } from "../../infrastructure/firebase/notification.service";
import { normalizeSearch } from "../../shared/utils/sanitize";
import { parseSubscriptions } from "../../shared/utils/subscriptions";
import { logger } from "../../shared/logger/logger";

export type PushAudience =
  | "all"
  | "devices"
  | "zone"
  | "platform"
  | "program"
  | "active";

export interface PushCampaignInput {
  title: string;
  body: string;
  audience: PushAudience;
  deviceIds?: string[];
  zoneId?: string;
  platform?: string;
  program?: string;
  activeDays?: number;
}

export interface PushCampaignResult {
  targeted: number;
  sent: number;
  failed: number;
  invalidTokens: number;
}

interface DeviceWithToken {
  deviceId: string;
  fcmToken: string | null;
  subscriptions: string | null;
}

function buildWhere(audience: PushAudience, input: PushCampaignInput) {
  const where: Record<string, unknown> = { fcmToken: { not: null } };

  switch (audience) {
    case "devices":
      where.deviceId = { in: input.deviceIds ?? [] };
      break;
    case "zone":
      where.zoneId = input.zoneId ?? null;
      break;
    case "platform":
      where.platform = input.platform ?? null;
      break;
    case "active":
      where.lastSeen = { gte: new Date(Date.now() - (input.activeDays ?? 7) * 86400_000) };
      break;
    default:
      break;
  }

  return where;
}

function matchesProgram(device: DeviceWithToken, program: string): boolean {
  const target = normalizeSearch(program);
  if (!target) return false;
  return parseSubscriptions(device.subscriptions).some(
    (title) => normalizeSearch(title) === target
  );
}

/**
 * Selects the FCM tokens that match the campaign audience and sends the
 * notification. Tokens reported as invalid are cleared from the devices
 * table so they are not targeted again.
 */
export async function sendPushCampaign(
  input: PushCampaignInput
): Promise<PushCampaignResult> {
  const where = buildWhere(input.audience, input);

  let devices: DeviceWithToken[] = await prisma.device.findMany({
    where: where as never,
    select: { deviceId: true, fcmToken: true, subscriptions: true },
  });

  if (input.audience === "program" && input.program) {
    devices = devices.filter((device) => matchesProgram(device, input.program!));
  }

  const tokens = devices
    .map((device) => device.fcmToken)
    .filter((token): token is string => Boolean(token));

  if (tokens.length === 0) {
    return { targeted: 0, sent: 0, failed: 0, invalidTokens: 0 };
  }

  const targeted = devices.filter((device) => device.fcmToken !== null).length;

  const result = await sendPushToTokens(tokens, {
    title: input.title,
    body: input.body,
  });

  if (result.invalidTokens.length > 0) {
    await prisma.device.updateMany({
      where: { fcmToken: { in: result.invalidTokens } },
      data: { fcmToken: null },
    });
    logger.info("PushCampaign", "Cleared invalid FCM tokens", {
      count: result.invalidTokens.length,
    });
  }

  return {
    targeted,
    sent: result.sent,
    failed: result.failed,
    invalidTokens: result.invalidTokens.length,
  };
}

/** Counts how many devices a campaign would reach, without sending anything. */
export async function previewPushCampaign(
  input: PushCampaignInput
): Promise<{ targeted: number }> {
  const where = buildWhere(input.audience, input);

  let count = await prisma.device.count({ where: where as never });

  if (input.audience === "program" && input.program) {
    const devices = await prisma.device.findMany({
      where: { fcmToken: { not: null }, subscriptions: { not: null } },
      select: { subscriptions: true },
    });
    count = devices.filter((device) =>
      parseSubscriptions(device.subscriptions).some(
        (title) => normalizeSearch(title) === normalizeSearch(input.program!)
      )
    ).length;
  }

  return { targeted: count };
}
