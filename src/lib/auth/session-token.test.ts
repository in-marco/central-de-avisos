import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  hashSessionToken,
  SESSION_DURATION_SECONDS,
} from "./session-token";

describe("token de sesión", () => {
  it("genera 32 bytes en base64url sin padding", () => {
    const token = createSessionToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("genera tokens distintos", () => {
    expect(createSessionToken()).not.toBe(createSessionToken());
  });

  it("hashea el token con SHA-256 hexadecimal determinista", () => {
    const token = createSessionToken();
    const hash = hashSessionToken(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(token)).toBe(hash);
    expect(hash).not.toBe(token);
  });

  it("la sesión dura 12 horas", () => {
    expect(SESSION_DURATION_SECONDS).toBe(43_200);
  });
});
