import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { buildWritePayload, invalidPrayerPayload } = await import("../lib/writes.js");
const { cleanupStatements, escapeSqlLiteral } = await import("../lib/cleanup.mjs");
const { writeGuardFailure, isEmailRecipientsEmpty } = await import("../lib/guards.js");

describe("buildWritePayload", () => {
  it("uses the real prayer and feedback contracts with the run marker", () => {
    assert.deepEqual(buildWritePayload("1795740799515", "SUGERENCIA"), {
      prayer: {
        name: "K6 1795740799515",
        request: "Prueba de carga 1795740799515 para medir capacidad",
        deviceId: "k6-1795740799515",
      },
      feedback: {
        categoria: "SUGERENCIA",
        mensaje: "Prueba de carga 1795740799515",
        consent: true,
      },
    });
  });

  it("keeps the prayer request long enough to satisfy the validator", () => {
    const { prayer } = buildWritePayload("m", "SUGERENCIA");
    assert.ok(prayer.request.length >= 10);
  });

  it("omits request in the negative case", () => {
    assert.deepEqual(invalidPrayerPayload("m"), { name: "K6 m", deviceId: "k6-m" });
  });
});

describe("cleanup statements", () => {
  it("deletes only rows carrying the marker inside one transaction", () => {
    const statements = cleanupStatements("1795740799515");
    assert.equal(statements.length, 5);
    assert.equal(statements[0], "BEGIN TRANSACTION;");
    assert.match(statements[1], /DELETE FROM prayer_requests WHERE request LIKE '%1795740799515%';/);
    assert.match(statements[2], /DELETE FROM feedback_messages WHERE mensaje LIKE '%1795740799515%';/);
    assert.match(statements[3], /DELETE FROM devices WHERE deviceId LIKE 'k6-1795740799515%';/);
    assert.equal(statements[4], "COMMIT;");
  });

  it("escapes a quote and rejects LIKE wildcards in the marker", () => {
    assert.equal(escapeSqlLiteral("o'brien"), "o''brien");
    assert.throws(() => cleanupStatements("100%"), /marker/);
    assert.throws(() => cleanupStatements("100_1"), /marker/);
  });
});

describe("write guards", () => {
  it("requires the explicit allow flag before anything runs", () => {
    assert.equal(writeGuardFailure({}).code, 2);
    assert.equal(writeGuardFailure({ K6_ALLOW_WRITES: "0" }).code, 2);
  });

  it("requires a configured email check command", () => {
    const failure = writeGuardFailure({ K6_ALLOW_WRITES: "1" });
    assert.equal(failure.code, 3);
    assert.match(failure.message, /PRAYER_EMAIL_RECIPIENTS/);
  });

  it("passes when both guards are satisfied", () => {
    assert.equal(
      writeGuardFailure({ K6_ALLOW_WRITES: "1", K6_EMAIL_CHECK_COMMAND: "echo -n" }),
      null
    );
  });

  it("treats only empty command output as an empty recipient list", () => {
    assert.equal(isEmailRecipientsEmpty("  \n"), true);
    assert.equal(isEmailRecipientsEmpty("team@example.com"), false);
  });
});
