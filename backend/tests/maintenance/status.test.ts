import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readMaintenanceStatus } from "../../src/modules/maintenance/maintenance.service";
import { hydrateFromRows, resetCache } from "../../src/modules/settings/settings.cache";
import type { SettingRow } from "../../src/modules/settings/settings.types";

const ORIGINAL_MAINTENANCE_MODE = process.env.MAINTENANCE_MODE;

function row(key: string, value: string): SettingRow {
  return { key, value, updatedAt: new Date("2026-11-26T12:00:00Z"), updatedBy: "admin@radio" };
}

beforeEach(() => {
  delete process.env.MAINTENANCE_MODE;
  resetCache();
});

afterEach(() => {
  if (ORIGINAL_MAINTENANCE_MODE === undefined) {
    delete process.env.MAINTENANCE_MODE;
  } else {
    process.env.MAINTENANCE_MODE = ORIGINAL_MAINTENANCE_MODE;
  }
  resetCache();
});

describe("readMaintenanceStatus", () => {
  it("answers the catalog copy with the screen turned off on a fresh install", () => {
    const status = readMaintenanceStatus();

    expect(status.enabled).toBe(false);
    expect(status.title).toBe("Estamos afinando la señal");
    expect(status.message).toContain("Volveremos pronto");
    expect(status.footerNote).not.toBe("");
  });

  it("reflects a row saved from the panel, copy included", () => {
    hydrateFromRows([
      row("maintenance.enabled", "true"),
      row("maintenance.title", "Volvemos a las 8"),
      row("maintenance.message", "Estamos cambiando el transmisor."),
      row("maintenance.footerNote", ""),
    ]);

    expect(readMaintenanceStatus()).toEqual({
      enabled: true,
      title: "Volvemos a las 8",
      message: "Estamos cambiando el transmisor.",
      footerNote: "",
    });
  });

  it("seeds the switch from the environment when nothing was saved", () => {
    process.env.MAINTENANCE_MODE = "true";

    expect(readMaintenanceStatus().enabled).toBe(true);
  });

  it("ignores an empty title and keeps the fallback instead of a blank screen", () => {
    hydrateFromRows([
      row("maintenance.enabled", "true"),
      row("maintenance.title", "   "),
    ]);

    expect(readMaintenanceStatus().title).toBe("Estamos afinando la señal");
  });
});
