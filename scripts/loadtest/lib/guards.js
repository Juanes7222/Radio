// @ts-check

/**
 * Decides whether the guarded write profile may start.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ code: number, message: string } | null}
 */
export function writeGuardFailure(env) {
  if (env.K6_ALLOW_WRITES !== "1") {
    return {
      code: 2,
      message:
        "public-writes requires K6_ALLOW_WRITES=1. No k6 process was started and no report was written.",
    };
  }
  if (!env.K6_EMAIL_CHECK_COMMAND) {
    return {
      code: 3,
      message:
        "K6_EMAIL_CHECK_COMMAND is required. Empty PRAYER_EMAIL_RECIPIENTS in the effective radio-backend environment first, then run pm2 restart radio-backend before the maintenance window.",
    };
  }
  return null;
}

/**
 * The check command prints the effective recipient list to stdout.
 *
 * @param {string} commandOutput
 * @returns {boolean}
 */
export function isEmailRecipientsEmpty(commandOutput) {
  return commandOutput.trim().length === 0;
}
