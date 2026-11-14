import { describe, expect, it } from "vitest";
import { isSuperadmin } from "./authorization";

describe("isSuperadmin", () => {
  it("solo acepta es_superadmin con empresa nula", () => {
    expect(
      isSuperadmin({ esSuperadmin: true, empresa: null }),
    ).toBe(true);
    expect(
      isSuperadmin({ esSuperadmin: false, empresa: null }),
    ).toBe(false);
    expect(
      isSuperadmin({
        esSuperadmin: true,
        empresa: { id: "empresa", nombre: "Empresa" },
      }),
    ).toBe(false);
    expect(
      isSuperadmin({
        esSuperadmin: false,
        empresa: { id: "empresa", nombre: "Empresa" },
      }),
    ).toBe(false);
    expect(isSuperadmin(null)).toBe(false);
  });
});
