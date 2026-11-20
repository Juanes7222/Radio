import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function read(relativePath: string): string {
  return readFileSync(join(webRoot, relativePath), "utf8").replace(/\r\n/g, "\n");
}

/** Every admin page and every component under pages/admin, recursively. */
export function adminPages(relativeDir = "src/pages/admin"): string[] {
  return readdirSync(join(webRoot, relativeDir), { withFileTypes: true }).flatMap(
    (entry): string[] => {
      const relative = `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) return adminPages(relative);
      return extname(entry.name) === ".tsx" ? [relative] : [];
    },
  );
}
