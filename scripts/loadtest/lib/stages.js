// @ts-check

export const GRACEFUL_RAMP_DOWN = "10s";

/** @type {ReadonlyArray<{ duration: string, target: number }>} */
const STANDARD_LADDER = Object.freeze([
  { duration: "30s", target: 10 },
  { duration: "2m", target: 25 },
  { duration: "2m", target: 50 },
  { duration: "2m", target: 100 },
  { duration: "2m", target: 200 },
  { duration: "2m", target: 400 },
  { duration: "2m", target: 800 },
  { duration: "30s", target: 0 },
]);

/**
 * @param {number} vusMax
 * @returns {"standard" | "max"}
 */
export function stageKindFor(vusMax) {
  return vusMax > 800 ? "max" : "standard";
}

/**
 * Builds the ladder for one k6 process. Targets are divided by the number of
 * instances so the orchestrator stays the only source of VU budget.
 *
 * @param {"standard" | "max"} kind
 * @param {number} [instances]
 * @returns {Array<{ duration: string, target: number }>}
 */
export function buildStages(kind, instances = 1) {
  const multiplier = (kind === "max" ? 2 : 1) / instances;
  return STANDARD_LADDER.map((stage) => ({
    duration: stage.duration,
    target: Math.round(stage.target * multiplier),
  }));
}
