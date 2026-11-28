// @ts-check

/**
 * Adds the throttle classification to a set of k6 metric tags.
 *
 * @param {Record<string, string>} tags
 * @param {number} status
 * @returns {Record<string, string>}
 */
export function withThrottleTag(tags, status) {
  return { ...tags, throttled: status === 429 ? "yes" : "no" };
}
