import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  clientIp,
  DEFAULT_WINDOW_SECONDS,
  isBlocked,
  loginRateLimitWindowSeconds,
  MAX_INTENTOS_EMAIL,
  MAX_INTENTOS_IP,
  rateLimitKeys,
} from "./rate-limit";

const KEY_PATTERN = /^(email|ip):[0-9a-f]{64}$/;

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("loginRateLimitWindowSeconds", () => {
  it("usa 900 s por defecto", () => {
    expect(DEFAULT_WINDOW_SECONDS).toBe(900);
    expect(loginRateLimitWindowSeconds({})).toBe(900);
  });

  it.each([
    ["60", 60],
    ["900", 900],
    [" 3600 ", 3600],
  ])("acepta %s", (raw, expected) => {
    expect(
      loginRateLimitWindowSeconds({ LOGIN_RATE_LIMIT_WINDOW_SECONDS: raw }),
    ).toBe(expected);
  });

  it.each(["", "59", "3601", "abc", "-60", "90.5", "1e3"])(
    "ignora el valor inválido %s",
    (raw) => {
      expect(
        loginRateLimitWindowSeconds({ LOGIN_RATE_LIMIT_WINDOW_SECONDS: raw }),
      ).toBe(900);
    },
  );
});

describe("clientIp", () => {
  it("prefiere x-real-ip", () => {
    const headers = new Headers({
      "x-real-ip": " 203.0.113.7 ",
      "x-forwarded-for": "198.51.100.1",
    });
    expect(clientIp(headers)).toBe("203.0.113.7");
  });

  it("usa el primer valor de x-forwarded-for", () => {
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.1, 10.0.0.1",
    });
    expect(clientIp(headers)).toBe("198.51.100.1");
  });

  it("devuelve null sin IP identificable", () => {
    expect(clientIp(new Headers())).toBeNull();
    expect(clientIp(new Headers({ "x-forwarded-for": " , " }))).toBeNull();
  });
});

describe("rateLimitKeys", () => {
  it("hashea el email normalizado y la IP sin guardarlos en claro", () => {
    const keys = rateLimitKeys(
      "  Admin@Demo.LOCAL ",
      new Headers({ "x-real-ip": "203.0.113.7" }),
    );

    expect(keys.email).toBe(`email:${sha("admin@demo.local")}`);
    expect(keys.ip).toBe(`ip:${sha("203.0.113.7")}`);
    expect(keys.email).toMatch(KEY_PATTERN);
    expect(keys.ip).toMatch(KEY_PATTERN);
    expect(keys.email).not.toContain("demo");
    expect(keys.ip).not.toContain("203");
  });

  it("variantes del mismo email comparten clave", () => {
    const headers = new Headers();
    expect(rateLimitKeys("a@b.es", headers).email).toBe(
      rateLimitKeys(" A@B.ES", headers).email,
    );
  });

  it("un email ausente cuenta como email vacío", () => {
    const headers = new Headers();
    expect(rateLimitKeys(null, headers).email).toBe(`email:${sha("")}`);
    expect(rateLimitKeys("", headers).email).toBe(`email:${sha("")}`);
  });

  it("sin IP solo hay clave de email", () => {
    expect(rateLimitKeys("a@b.es", new Headers()).ip).toBeNull();
  });
});

describe("isBlocked", () => {
  it("bloquea el 6.º intento por email", () => {
    expect(MAX_INTENTOS_EMAIL).toBe(5);
    expect(isBlocked({ email: 5, ip: 5 })).toBe(false);
    expect(isBlocked({ email: 6, ip: 6 })).toBe(true);
  });

  it("bloquea por IP a partir de 51 intentos", () => {
    expect(MAX_INTENTOS_IP).toBe(50);
    expect(isBlocked({ email: 1, ip: 50 })).toBe(false);
    expect(isBlocked({ email: 1, ip: 51 })).toBe(true);
  });

  it("sin IP solo cuenta el email", () => {
    expect(isBlocked({ email: 5, ip: null })).toBe(false);
    expect(isBlocked({ email: 6, ip: null })).toBe(true);
  });
});
