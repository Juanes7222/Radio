import type { MaintenanceStatus } from "@radio/types";
import { getBooleanSetting, getTextSetting } from "../settings/settings.cache";

/**
 * The whole screen in one read, resolved through the settings cache: a value
 * saved from the panel is visible on the next request, without a restart.
 */
export function readMaintenanceStatus(): MaintenanceStatus {
  return {
    enabled: getBooleanSetting("maintenance.enabled"),
    title: getTextSetting("maintenance.title"),
    message: getTextSetting("maintenance.message"),
    footerNote: getTextSetting("maintenance.footerNote"),
  };
}
