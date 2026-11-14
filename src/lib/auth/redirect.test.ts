import { describe, expect, it } from "vitest";
import { safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it("acepta rutas internas", () => {
    expect(safeNextPath("/panel")).toBe("/panel");
    expect(safeNextPath("/avisos/123?tab=partes")).toBe(
      "/avisos/123?tab=partes",
    );
  });

  it("rechaza URLs absolutas y protocol-relative", () => {
    expect(safeNextPath("//evil.example")).toBe("/panel");
    expect(safeNextPath("//evil.example/panel")).toBe("/panel");
    expect(safeNextPath("https://evil.example")).toBe("/panel");
    expect(safeNextPath("http://evil.example")).toBe("/panel");
    expect(safeNextPath("javascript:alert(1)")).toBe("/panel");
  });

  it("rechaza backslashes y caracteres de control", () => {
    expect(safeNextPath("/\\evil.example")).toBe("/panel");
    expect(safeNextPath("\\\\evil.example")).toBe("/panel");
    expect(safeNextPath("/panel\r\nLocation: https://evil.example")).toBe(
      "/panel",
    );
  });

  it("rechaza rutas relativas sin barra inicial y valores no string", () => {
    expect(safeNextPath("panel")).toBe("/panel");
    expect(safeNextPath(undefined)).toBe("/panel");
    expect(safeNextPath(null)).toBe("/panel");
    expect(safeNextPath(123)).toBe("/panel");
  });
});
