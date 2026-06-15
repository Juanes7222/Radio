import dotenv from "dotenv";
import { initializeInfisicalSecrets } from "../src/infisical";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

dotenv.config();

type DispatchMode =
  | "eligible"
  | "pending"
  | "retrying"
  | "assigned"
  | "error"
  | "abandoned"
  | "any";

type JobSummary = {
  id: string;
  videoId: string;
  status: string;
  attempts: number;
  workerId: string | null;
  nextRetryAt: string | null;
  deadlineAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
};

function getBaseUrl(): string {
  const port = process.env.PORT ?? "3000";
  return (process.env.JOB_TEST_BASE_URL ?? `http://127.0.0.1:${port}`).replace(/\/$/, "");
}

function parseMode(value: string | undefined): DispatchMode {
  const mode = (value ?? "eligible").toLowerCase();
  if (
    mode === "eligible" ||
    mode === "pending" ||
    mode === "retrying" ||
    mode === "assigned" ||
    mode === "error" ||
    mode === "abandoned" ||
    mode === "any"
  ) {
    return mode;
  }
  return "eligible";
}

async function requestJson<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const text = await response.text();
  let data: any = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message =
      typeof data === "object" && data && "error" in data
        ? String(data.error)
        : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

function printJobs(jobs: JobSummary[]): void {
  if (jobs.length === 0) {
    console.log("No hay jobs en ese filtro.");
    return;
  }

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    console.log(
      `${String(i + 1).padStart(2, "0")}. [${job.status.padEnd(9)}] ${job.videoId}  ` +
        `attempts=${job.attempts}  worker=${job.workerId ?? "-"}  id=${job.id}`
    );
  }
}

async function chooseFromList(
  rl: readline.Interface,
  title: string,
  jobs: JobSummary[]
): Promise<JobSummary | null> {
  console.log("");
  console.log(title);
  printJobs(jobs);

  if (jobs.length === 0) {
    return null;
  }

  const answer = (await rl.question("Selecciona un número (Enter para cancelar): ")).trim();
  if (!answer) return null;

  const index = Number(answer) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= jobs.length) {
    console.log("Selección inválida.");
    return null;
  }

  return jobs[index];
}

async function getJobs(
  baseUrl: string,
  mode: DispatchMode,
  videoId?: string,
  limit = 25
): Promise<JobSummary[]> {
  const params = new URLSearchParams({
    mode,
    limit: String(limit),
  });

  if (videoId) {
    params.set("videoId", videoId);
  }

  const data = await requestJson<{ ok: true; jobs: JobSummary[] }>(
    baseUrl,
    `/internal/test-dispatch/jobs?${params.toString()}`
  );

  return data.jobs;
}

async function dispatchById(baseUrl: string, jobId: string): Promise<void> {
  const data = await requestJson<{
    ok: true;
    before: JobSummary;
    after: JobSummary;
  }>(baseUrl, "/internal/test-dispatch/dispatch", {
    method: "POST",
    body: JSON.stringify({ jobId }),
  });

  console.log("");
  console.log("Disparo realizado.");
  console.log(`ID      : ${data.after.id}`);
  console.log(`Video   : ${data.after.videoId}`);
  console.log(`Status  : ${data.before.status} -> ${data.after.status}`);
  console.log(`Worker  : ${data.before.workerId ?? "-"} -> ${data.after.workerId ?? "-"}`);
  console.log("");
}

async function randomDispatch(baseUrl: string, mode: DispatchMode): Promise<void> {
  const data = await requestJson<{
    ok: true;
    selectedJob: JobSummary;
    updatedJob: JobSummary | null;
  }>(baseUrl, "/internal/test-dispatch/random", {
    method: "POST",
    body: JSON.stringify({ mode }),
  });

  console.log("");
  console.log("Job seleccionado:");
  console.log(`ID     : ${data.selectedJob.id}`);
  console.log(`Video  : ${data.selectedJob.videoId}`);
  console.log(`Status : ${data.selectedJob.status}`);
  console.log("");

  if (data.updatedJob) {
    console.log("Estado después del dispatch:");
    console.log(`ID     : ${data.updatedJob.id}`);
    console.log(`Status : ${data.updatedJob.status}`);
    console.log(`Worker : ${data.updatedJob.workerId ?? "-"}`);
    console.log("");
  }
}

async function interactive(baseUrl: string): Promise<void> {
  const rl = readline.createInterface({ input, output });

  try {
    console.log("");
    console.log("Modo interactivo");
    console.log("1) Elegible aleatorio");
    console.log("2) Listar elegibles y escoger");
    console.log("3) Listar por estado y escoger");
    console.log("4) Disparar por ID");
    console.log("5) Listar por videoId y escoger");
    console.log("6) Salir");
    console.log("");

    const selection = (await rl.question("Opción: ")).trim();

    if (selection === "6") return;

    if (selection === "1") {
      await randomDispatch(baseUrl, "eligible");
      return;
    }

    if (selection === "2") {
      const jobs = await getJobs(baseUrl, "eligible", undefined, 50);
      const chosen = await chooseFromList(rl, "Jobs elegibles", jobs);
      if (chosen) await dispatchById(baseUrl, chosen.id);
      return;
    }

    if (selection === "3") {
      const mode = parseMode((await rl.question("Estado [pending|retrying|assigned|error|abandoned|any]: ")).trim());
      const jobs = await getJobs(baseUrl, mode, undefined, 50);
      const chosen = await chooseFromList(rl, `Jobs en modo ${mode}`, jobs);
      if (chosen) await dispatchById(baseUrl, chosen.id);
      return;
    }

    if (selection === "4") {
      const jobId = (await rl.question("Job ID: ")).trim();
      if (jobId) {
        await dispatchById(baseUrl, jobId);
      }
      return;
    }

    if (selection === "5") {
      const videoId = (await rl.question("videoId: ")).trim();
      if (!videoId) return;

      const jobs = await getJobs(baseUrl, "any", videoId, 50);
      const chosen = await chooseFromList(rl, `Jobs para ${videoId}`, jobs);
      if (chosen) await dispatchById(baseUrl, chosen.id);
      return;
    }

    console.log("Opción inválida.");
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const loaded = await initializeInfisicalSecrets();
  console.log(
    loaded
      ? "[Infisical] Secrets loaded successfully"
      : "[Infisical] Not configured or failed."
  );

  const baseUrl = getBaseUrl();
  const [command, arg] = process.argv.slice(2);

  switch (command) {
    case "random":
      await randomDispatch(baseUrl, parseMode(arg));
      break;

    case "list": {
      const mode = parseMode(arg);
      const jobs = await getJobs(baseUrl, mode, undefined, 50);
      printJobs(jobs);
      break;
    }

    case "dispatch":
      if (!arg) {
        throw new Error("Missing jobId");
      }
      await dispatchById(baseUrl, arg);
      break;

    case "video": {
      if (!arg) {
        throw new Error("Missing videoId");
      }
      const jobs = await getJobs(baseUrl, "any", arg, 50);
      const rl = readline.createInterface({ input, output });
      try {
        const chosen = await chooseFromList(rl, `Jobs para videoId=${arg}`, jobs);
        if (chosen) await dispatchById(baseUrl, chosen.id);
      } finally {
        rl.close();
      }
      break;
    }

    case "interactive":
      await interactive(baseUrl);
      break;

    default:
      console.log(`
Uso:

  pnpm ts-node scripts/job-test.ts random [eligible|pending|retrying|assigned|error|abandoned|any]
  pnpm ts-node scripts/job-test.ts list [mode]
  pnpm ts-node scripts/job-test.ts dispatch <jobId>
  pnpm ts-node scripts/job-test.ts video <videoId>
  pnpm ts-node scripts/job-test.ts interactive

Ejemplos:

  pnpm ts-node scripts/job-test.ts random
  pnpm ts-node scripts/job-test.ts random eligible
  pnpm ts-node scripts/job-test.ts list retrying
  pnpm ts-node scripts/job-test.ts dispatch 123
  pnpm ts-node scripts/job-test.ts video dQw4w9WgXcQ
  pnpm ts-node scripts/job-test.ts interactive
`);
      break;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});