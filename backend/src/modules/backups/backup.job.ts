import cron from "node-cron";
import { config } from "../../config";
import { logger } from "../../shared/logger/logger";
import { runScheduledBackup } from "./backups.service";

export function registerBackupJob(): void {
  // 05:05 station time, after the nightly generation (02:30) and the rotations
  // (03:30), so the snapshot captures the database with the day already planned.
  //
  // This schedule lives in the backend on purpose: the systemd timer only gets
  // installed by setup.sh, which runs once, so a server provisioned before the
  // units existed never got one. The two share the duplicate window in
  // backups.service.ts, so whichever fires second does not create a second bundle.
  cron.schedule(
    "5 5 * * *",
    async () => {
      try {
        await runScheduledBackup();
      } catch (err) {
        logger.error("BackupJob", "Scheduled backup failed", { error: String(err) });
      }
    },
    { timezone: config.locutor.timezone }
  );
}
