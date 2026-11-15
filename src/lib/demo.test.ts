import { describe, expect, it } from "vitest";
import { DEMO_BANNER_TEXT, isDemoMode } from "./demo";

describe("isDemoMode", () => {
  it("solo se activa con DEMO_MODE=true exacto", () => {
    expect(isDemoMode({ DEMO_MODE: "true" })).toBe(true);
  });

  it.each([undefined, "", "TRUE", "1", "yes", " true", "false"])(
    "no se activa con %s",
    (value) => {
      expect(isDemoMode({ DEMO_MODE: value })).toBe(false);
    },
  );

  it("usa el texto acordado", () => {
    expect(DEMO_BANNER_TEXT).toBe("Entorno de demostración · datos ficticios");
  });
});
