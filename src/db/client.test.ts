import { describe, expect, it } from "vitest";
import { connectionTimeoutMs, DEFAULT_CONNECTION_TIMEOUT_MS } from "./client";

describe("connectionTimeoutMs", () => {
  it("usa 2000 ms por defecto", () => {
    expect(DEFAULT_CONNECTION_TIMEOUT_MS).toBe(2000);
    expect(connectionTimeoutMs({})).toBe(2000);
  });

  it.each([
    ["500", 500],
    ["10000", 10000],
    [" 30000 ", 30000],
  ])("acepta %s", (raw, expected) => {
    expect(connectionTimeoutMs({ DATABASE_CONNECTION_TIMEOUT_MS: raw })).toBe(
      expected,
    );
  });

  it.each(["", "abc", "499", "30001", "-1", "1.5", "1e4"])(
    "ignora el valor inválido %s",
    (raw) => {
      expect(
        connectionTimeoutMs({ DATABASE_CONNECTION_TIMEOUT_MS: raw }),
      ).toBe(2000);
    },
  );
});
