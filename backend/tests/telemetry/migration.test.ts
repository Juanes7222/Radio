import { readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

const MIGRATION = join(
  process.cwd(),
  "prisma",
  "schema",
  "migrations",
  "20261119000000_add_app_telemetry",
  "migration.sql"
);

/**
 * Applies the real migration to an in-memory database. The suite never opens
 * the development database, so it can prove the SQL and its constraints
 * without touching local data.
 */
function migratedDatabase(): Database.Database {
  const db = new Database(":memory:");
  db.exec(readFileSync(MIGRATION, "utf8"));
  return db;
}

describe("telemetry migration", () => {
  it("creates the two tables", () => {
    const db = migratedDatabase();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;

    expect(tables.map((table) => table.name)).toEqual(["app_errors", "device_activity"]);
    db.close();
  });

  it("stores one row per device and day", () => {
    const db = migratedDatabase();
    const insert = db.prepare(
      'INSERT INTO "device_activity" ("id", "device_id", "day") VALUES (?, ?, ?)'
    );

    insert.run("one", "device-a", "2026-11-19");

    expect(() => insert.run("two", "device-a", "2026-11-19")).toThrow(/UNIQUE/);
    expect(() => insert.run("three", "device-a", "2026-11-20")).not.toThrow();
    db.close();
  });

  it("groups an error by fingerprint", () => {
    const db = migratedDatabase();
    const insert = db.prepare(
      'INSERT INTO "app_errors" ("id", "fingerprint", "message") VALUES (?, ?, ?)'
    );

    insert.run("one", "abc", "boom");

    expect(() => insert.run("two", "abc", "boom")).toThrow(/UNIQUE/);
    db.close();
  });

  it("defaults the counters the service relies on", () => {
    const db = migratedDatabase();
    db.prepare('INSERT INTO "app_errors" ("id", "fingerprint", "message") VALUES (?, ?, ?)').run(
      "one",
      "abc",
      "boom"
    );

    const row = db
      .prepare('SELECT "occurrences", "first_seen_at", "last_seen_at" FROM "app_errors"')
      .get() as { occurrences: number; first_seen_at: string; last_seen_at: string };

    expect(row.occurrences).toBe(1);
    expect(row.first_seen_at).toBeTruthy();
    expect(row.last_seen_at).toBeTruthy();
    db.close();
  });
});
