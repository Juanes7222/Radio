// @ts-check

export const PROFILES = [
  "smoke",
  "public-reads",
  "public-writes",
  "admin-reads",
  "worker-reads",
  "capacity",
  "capacity-mixed",
  "search-isolated",
];

/** @type {Record<string, "path" | "vus" | "duration" | "instances" | "vusMax">} */
const FLAGS = {
  "--path": "path",
  "--vus": "vus",
  "--duration": "duration",
  "--instances": "instances",
  "--vus-max": "vusMax",
};

/**
 * @typedef {object} RunArgs
 * @property {string} profile
 * @property {"edge" | "origin" | undefined} path
 * @property {number | undefined} vus
 * @property {string | undefined} duration
 * @property {number | undefined} instances
 * @property {number | undefined} vusMax
 */

/**
 * Parses the orchestrator's command line without touching the environment.
 *
 * @param {string[]} argv
 * @returns {RunArgs}
 */
export function parseRunArgs(argv) {
  const profile = argv[0];
  if (!profile || !PROFILES.includes(profile)) {
    throw new Error(`Unknown profile: ${profile ?? "(none)"}. Expected one of ${PROFILES.join(", ")}`);
  }

  /** @type {RunArgs} */
  const args = {
    profile,
    path: undefined,
    vus: undefined,
    duration: undefined,
    instances: undefined,
    vusMax: undefined,
  };

  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    const key = FLAGS[flag];
    if (!key) {
      throw new Error(`Unknown flag: ${flag}`);
    }
    if (value === undefined) {
      throw new Error(`${flag} requires a value`);
    }
    if (key === "path") {
      if (value !== "edge" && value !== "origin") {
        throw new Error("--path must be edge or origin");
      }
      args.path = value;
    } else if (key === "duration") {
      if (!/^\d+[smh]$/.test(value)) {
        throw new Error("--duration must look like 30s, 2m or 1h");
      }
      args.duration = value;
    } else {
      const number = Number(value);
      if (!Number.isInteger(number) || number <= 0) {
        throw new Error(`${flag} must be a positive integer`);
      }
      args[key] = number;
    }
  }

  return args;
}

/**
 * @param {string} profile
 * @param {"edge" | "origin"} path
 * @param {number} instanceId
 * @param {string} timestamp
 * @returns {string}
 */
export function reportFilename(profile, path, instanceId, timestamp) {
  return `reports/${profile}-${path}-i${instanceId}-${timestamp}.json`;
}
