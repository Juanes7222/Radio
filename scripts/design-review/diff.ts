import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export interface AddedLine {
  readonly line: number;
  readonly text: string;
}

export interface ChangedFile {
  readonly path: string;
  readonly addedLines: readonly AddedLine[];
}

/**
 * Reads the added lines of a unified diff, with the line number they occupy in
 * the new file. Only added lines matter: the review judges what the change
 * introduces, not the debt the file already carried.
 */
export function parseUnifiedDiff(patch: string): ChangedFile[] {
  const files = new Map<string, { path: string; addedLines: AddedLine[] }>();
  let current: { path: string; addedLines: AddedLine[] } | null = null;
  let nextLine = 0;

  for (const raw of patch.split("\n")) {
    if (raw.startsWith("+++ ")) {
      const target = raw.slice(4).trim();
      if (target === "/dev/null") {
        current = null;
        continue;
      }
      const path = target.replace(/^b\//, "");
      const existing = files.get(path);
      current = existing ?? { path, addedLines: [] };
      files.set(path, current);
      continue;
    }

    if (raw.startsWith("@@")) {
      const hunk = /\+(\d+)(?:,\d+)?/.exec(raw);
      nextLine = hunk ? Number(hunk[1]) : 0;
      continue;
    }

    if (current === null) continue;

    if (raw.startsWith("+")) {
      current.addedLines.push({ line: nextLine, text: raw.slice(1) });
      nextLine += 1;
    } else if (raw.startsWith(" ")) {
      nextLine += 1;
    }
  }

  return [...files.values()].filter((file) => file.addedLines.length > 0);
}

function runGit(args: readonly string[]): string {
  return execFileSync("git", [...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function untrackedFiles(): string[] {
  return runGit(["ls-files", "--others", "--exclude-standard"])
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function allLines(path: string): AddedLine[] {
  const content = readFileSync(path, "utf8");
  if (content.includes("\u0000")) return [];
  return content
    .split("\n")
    .map((text, index) => ({ line: index + 1, text }));
}

export function changedFilesFromGit(base: string): ChangedFile[] {
  const patch = runGit([
    "diff",
    "--unified=0",
    "--no-color",
    "--no-ext-diff",
    base,
    "--",
  ]);
  const files = parseUnifiedDiff(patch);
  for (const path of untrackedFiles()) {
    if (files.some((file) => file.path === path)) continue;
    const addedLines = allLines(path);
    if (addedLines.length > 0) files.push({ path, addedLines });
  }
  return files;
}
