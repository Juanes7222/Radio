import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  settings: { timezone: "America/Bogota", enabled: true, perHour: 1, minGapMinutes: 20,
    windowEdgeMarginMinutes: 0, minWindowMinutes: 1 },
  table: { findMany: vi.fn(), count: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
}));

vi.mock("../../src/config", () => ({ config: { locutor: { timezone: "America/Bogota", stationName: "La Voz de la Verdad" } } }));
vi.mock("../../src/shared/logger/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock("../../src/modules/azuracast/azuracast.client", () => ({ azuracastApi: { get: mocks.get }, STATION_ID: 1 }));
vi.mock("../../src/modules/locutor/settings.service", () => ({ getSettings: () => mocks.settings }));
vi.mock("../../src/infrastructure/database/prisma", () => ({
  prisma: {
    announcementSlot: mocks.table,
    $transaction: (callback: (transaction: { announcementSlot: typeof mocks.table }) => unknown) =>
      callback({ announcementSlot: mocks.table }),
  },
}));

import { buildPlan, replanAnnouncements } from "../../src/modules/locutor/announcementPlan.service";
import { evaluateLiveState } from "../../src/modules/locutor/liveState.service";
import { renderAnnouncementTemplate } from "../../src/modules/locutor/template.service";

const epoch = (instant: string): number => Date.parse(instant) / 1000;

describe("time announcements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-19T18:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("plans across free hours, excludes programs and keeps the minimum gap", async () => {
    mocks.get.mockResolvedValue({ data: [
      { start_timestamp: epoch("2026-11-19T19:00:00Z"), end_timestamp: epoch("2026-11-19T20:00:00Z"), title: "Lectura" },
    ] });
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const plan = await buildPlan();
    const minutes = plan.slots.map((slot) => slot.minuteOfDay);
    expect(minutes.filter((minute) => minute >= 13 * 60 && minute < 16 * 60)).toEqual([811, 930]);
    expect(minutes.every((minute, index) => index === 0 || minute - minutes[index - 1] >= 20)).toBe(true);
    expect(plan.slots[0].plannedFor.toISOString()).toBe("2026-11-19T18:31:00.000Z");
  });

  it("keeps an eligible pending minute when the plan refreshes", async () => {
    mocks.get.mockResolvedValue({ data: [] });
    mocks.table.findMany.mockResolvedValue([{
      id: "keep",
      status: "pending",
      minuteOfDay: 14 * 60 + 5,
      plannedFor: new Date("2026-11-19T19:05:00Z"),
      retryAt: null,
      playedAt: null,
    }]);

    await replanAnnouncements();
    expect(mocks.table.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { in: [] } }),
    }));
    expect(mocks.table.createMany.mock.calls[0][0].data).not.toContainEqual(
      expect.objectContaining({ minuteOfDay: 14 * 60 + 5 })
    );
  });

  it("retains the pending plan if AzuraCast is unavailable", async () => {
    mocks.get.mockRejectedValue(new Error("offline"));
    mocks.table.count.mockResolvedValue(4);

    expect(await replanAnnouncements()).toBe(4);
    expect(mocks.table.deleteMany).not.toHaveBeenCalled();
    expect(mocks.table.createMany).not.toHaveBeenCalled();
  });

  it("blocks a protected playlist and an unidentified live source", async () => {
    const options = { respectScheduledPrograms: true, respectLiveStreamer: true };
    mocks.get.mockResolvedValueOnce({ data: [{ name: "Lectura bíblica", schedule_items: [{}] }] });
    mocks.get.mockResolvedValueOnce({ data: { live: { is_live: false }, now_playing: { playlist: "Lectura biblica" } } });
    await expect(evaluateLiveState(options)).resolves.toMatchObject({ allowed: false, reason: "scheduled_program" });

    mocks.get.mockResolvedValueOnce({ data: [] });
    mocks.get.mockResolvedValueOnce({ data: { live: { is_live: true, streamer_name: "" } } });
    await expect(evaluateLiveState(options)).resolves.toMatchObject({ allowed: false, reason: "live_streamer" });
  });

  it("renders a legacy template with the real minutes and singular agreement", () => {
    const template = { type: "hourly", textTemplate: "Son las {{hour_text}} en punto. Seguimos en {{station_name}}." };
    expect(renderAnnouncementTemplate(template, { hour24: 13, minutes: 42 }))
      .toBe("Es la una y cuarenta y dos de la tarde. Seguimos en La Voz de la Verdad.");
  });
});
