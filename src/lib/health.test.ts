import { describe, expect, it } from "vitest";
import { buildHealthPayload, SERVICE_NAME } from "./health";

describe("buildHealthPayload", () => {
  it("devuelve estado ok, nombre del servicio y timestamp ISO-8601", () => {
    const now = new Date("2026-11-13T10:00:00.000Z");

    const payload = buildHealthPayload(now);

    expect(payload).toEqual({
      status: "ok",
      service: SERVICE_NAME,
      timestamp: "2026-11-13T10:00:00.000Z",
    });
    expect(new Date(payload.timestamp).toISOString()).toBe(payload.timestamp);
  });

  it("usa la hora actual cuando no se le pasa fecha", () => {
    const before = Date.now();
    const payload = buildHealthPayload();
    const after = Date.now();

    const timestamp = new Date(payload.timestamp).getTime();

    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
    expect(Number.isNaN(timestamp)).toBe(false);
  });
});
