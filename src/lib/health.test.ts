import { describe, expect, it } from "vitest";
import { buildHealthPayload, SERVICE_NAME } from "./health";

describe("buildHealthPayload", () => {
  it("devuelve estado ok y database up cuando la base responde", () => {
    const now = new Date("2026-11-13T10:00:00.000Z");

    const payload = buildHealthPayload(true, now);

    expect(payload).toEqual({
      status: "ok",
      service: SERVICE_NAME,
      timestamp: "2026-11-13T10:00:00.000Z",
      database: { status: "up" },
    });
    expect(new Date(payload.timestamp).toISOString()).toBe(payload.timestamp);
  });

  it("devuelve estado degraded y database down cuando la base no responde", () => {
    const now = new Date("2026-11-13T10:00:00.000Z");

    const payload = buildHealthPayload(false, now);

    expect(payload.status).toBe("degraded");
    expect(payload.database.status).toBe("down");
  });

  it("no incluye credenciales ni la cadena de conexión", () => {
    const payload = buildHealthPayload(false, new Date("2026-11-13T10:00:00.000Z"));
    const serialized = JSON.stringify(payload);

    expect(serialized).not.toMatch(/postgres(ql)?:\/\//i);
    expect(serialized).not.toMatch(/password|contraseña|DATABASE_URL/i);
  });

  it("usa la hora actual cuando no se le pasa fecha", () => {
    const before = Date.now();
    const payload = buildHealthPayload(true);
    const after = Date.now();

    const timestamp = new Date(payload.timestamp).getTime();

    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
    expect(Number.isNaN(timestamp)).toBe(false);
  });
});
