import { existsSync, readFileSync } from "node:fs";
import {
  changedFilesFromGit,
  type ChangedFile,
} from "./diff.ts";
import {
  RULE_TITLES,
  evaluateAddedLines,
  evaluateImages,
  type Finding,
} from "./rules.ts";

interface CliOptions {
  readonly base: string;
  readonly json: boolean;
  readonly strict: boolean;
}

interface ReviewReport {
  readonly base: string;
  readonly files: readonly string[];
  readonly findings: readonly Finding[];
  readonly errors: number;
  readonly warnings: number;
}

const USAGE = `Revisión de diseño del diff actual.

Uso:
  pnpm design:review [opciones]

Opciones:
  --base <ref>   Referencia contra la que se compara el árbol de trabajo (por defecto HEAD).
  --json         Imprime el informe como JSON, para otras herramientas.
  --strict       Trata los avisos como errores (código de salida 1).
  --help         Muestra esta ayuda.

Códigos de salida:
  0  sin errores (puede haber avisos)
  1  al menos un error de diseño, o un aviso con --strict
  2  error de uso o de git`;

const CHECKLIST: readonly string[] = [
  "Jerarquía: ¿el ojo llega primero a lo que el operador vino a ver, o todo pesa igual?",
  "Estados: ¿loading, vacío, error y éxito tienen una forma visible y distinta?",
  "Responsive: ¿se sostiene a 360 px, a 768 px y en la columna estrecha del panel?",
  "Copy: tuteo, sin emojis, sin regionalismos; los errores dicen qué pasó y qué hacer.",
  "Movimiento: la animación explica un cambio, dura menos de ~300 ms y respeta prefers-reduced-motion.",
  "Accesibilidad: foco visible, teclado completo, contraste AA y controles con nombre accesible.",
  "Tokens: ningún color, radio o sombra nuevo fuera de index.css, tailwind.config.js y constants/theme.ts.",
  "Consistencia: ¿se parece al patrón que ya existe en docs/frontend-context.md o inventa uno nuevo?",
  "Riesgo: si esto falla en producción, ¿qué ve el oyente y cómo se entera el equipo?",
];

function parseArgs(argv: readonly string[]): CliOptions | null {
  const options: { base: string; json: boolean; strict: boolean } = {
    base: "HEAD",
    json: false,
    strict: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) return null;
      options.base = value;
      index += 1;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--strict") {
      options.strict = true;
    } else {
      return null;
    }
  }

  return options;
}

function review(base: string, files: readonly ChangedFile[]): ReviewReport {
  const findings: Finding[] = [];

  for (const file of files) {
    findings.push(...evaluateAddedLines(file.path, file.addedLines));
    if (!existsSync(file.path)) continue;
    const content = readFileSync(file.path, "utf8");
    const addedLines = new Set(file.addedLines.map((line) => line.line));
    findings.push(...evaluateImages(file.path, content, addedLines));
  }

  findings.sort((left, right) =>
    left.file === right.file
      ? left.line - right.line
      : left.file.localeCompare(right.file),
  );

  return {
    base,
    files: files.map((file) => file.path),
    findings,
    errors: findings.filter((finding) => finding.severity === "error").length,
    warnings: findings.filter((finding) => finding.severity === "warning").length,
  };
}

function printText(report: ReviewReport): void {
  const lines: string[] = [];
  lines.push(`Revisión de diseño — base ${report.base}`);
  lines.push(
    `${report.files.length} archivo(s) cambiado(s), ${report.findings.length} hallazgo(s): ${report.errors} error(es), ${report.warnings} aviso(s).`,
  );
  lines.push("");

  if (report.findings.length === 0) {
    lines.push("Sin hallazgos automáticos. Queda el checklist de abajo.");
    lines.push("");
  }

  let currentFile = "";
  for (const finding of report.findings) {
    if (finding.file !== currentFile) {
      currentFile = finding.file;
      lines.push(currentFile);
    }
    const label = finding.severity.padEnd(7);
    lines.push(
      `  ${String(finding.line).padStart(4)}  ${label}  ${finding.rule}  ${finding.message}`,
    );
    lines.push(`        > ${finding.excerpt}`);
    lines.push(`        ${finding.fix}`);
  }

  if (report.findings.length > 0) lines.push("");
  lines.push("Checklist manual (lo que ningún test automático puede juzgar):");
  for (const item of CHECKLIST) {
    lines.push(`  [ ] ${item}`);
  }
  lines.push("");
  lines.push(
    "Guía completa: docs/testing.md. Reglas y deuda conocida: docs/frontend-context.md.",
  );

  process.stdout.write(`${lines.join("\n")}\n`);
}

function printJson(report: ReviewReport): void {
  const payload = {
    base: report.base,
    files: report.files,
    summary: {
      files: report.files.length,
      findings: report.findings.length,
      errors: report.errors,
      warnings: report.warnings,
    },
    rules: RULE_TITLES,
    findings: report.findings,
    checklist: CHECKLIST,
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (options === null) {
    process.stderr.write(`${USAGE}\n`);
    process.exitCode = 2;
    return;
  }

  let files: ChangedFile[];
  try {
    files = changedFilesFromGit(options.base);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `No se pudo leer el diff contra "${options.base}".\n${message}\n`,
    );
    process.exitCode = 2;
    return;
  }

  const report = review(options.base, files);

  if (options.json) {
    printJson(report);
  } else {
    printText(report);
  }

  const failed =
    report.errors > 0 || (options.strict && report.warnings > 0);
  process.exitCode = failed ? 1 : 0;
}

main();
