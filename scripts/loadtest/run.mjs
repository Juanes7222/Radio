import { spawn } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { parseRunArgs, reportFilename } from "./lib/cli.js";

const harnessDir = dirname(fileURLToPath(import.meta.url));
const stopFile = join(harnessDir, ".stop");
const k6Binary = process.platform === "win32" ? "k6.exe" : "k6";

function fail(message, code) {
  console.error(message);
  process.exit(code);
}

function timestampNow() {
  return new Date().toISOString().replace(/[-:.]/g, "");
}

async function main() {
  const args = parseRunArgs(process.argv.slice(2));
  if (args.path) {
    process.env.K6_PATH = args.path;
  }
  if (args.duration) {
    process.env.K6_DURATION = args.duration;
  }
  if (args.profile.startsWith("capacity")) {
    if (args.vusMax !== undefined) {
      process.env.K6_VUS_MAX = String(args.vusMax);
    }
    delete process.env.K6_VUS;
  } else if (args.vus !== undefined) {
    process.env.K6_VUS = String(args.vus);
  }

  const config = loadConfig();
  const scenario = join(harnessDir, "scenarios", `${args.profile}.js`);
  if (!existsSync(scenario)) {
    fail(`Missing scenario: ${scenario}`, 2);
  }

  const marker = String(Date.now());
  process.env.K6_MARKER = marker;
  console.log(`K6_MARKER=${marker}`);

  mkdirSync("reports", { recursive: true });

  const instances = args.instances ?? 1;
  const timestamp = timestampNow();
  const children = [];
  let stopped = false;

  const stopWatcher = setInterval(() => {
    if (!existsSync(stopFile)) {
      return;
    }
    stopped = true;
    unlinkSync(stopFile);
    console.log(".stop detected: terminating k6. The run is truncated; the JSON output is partial evidence.");
    for (const child of children) {
      child.kill();
    }
  }, 500);

  const runInstance = (instanceId) =>
    new Promise((resolve) => {
      const report = reportFilename(args.profile, config.path, instanceId, timestamp);
      const child = spawn(
        k6Binary,
        ["run", scenario, "--out", `json=${report}`],
        {
          stdio: "inherit",
          env: { ...process.env, K6_INSTANCE_ID: String(instanceId) },
        }
      );
      children.push(child);
      child.on("error", (error) => {
        console.error(`Failed to start k6: ${error.message}`);
        resolve(1);
      });
      child.on("exit", (code) => resolve(stopped ? 0 : (code ?? 1)));
    });

  try {
    const exitCodes = await Promise.all(
      Array.from({ length: instances }, (_, index) => runInstance(index + 1))
    );
    if (exitCodes.some((code) => code !== 0)) {
      process.exitCode = 1;
    }
  } finally {
    clearInterval(stopWatcher);
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error), 2));
