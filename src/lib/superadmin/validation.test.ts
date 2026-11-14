import { describe, expect, it } from "vitest";
import {
  isValidNif,
  isValidUserEmail,
  isUuid,
  normalizeNif,
  parseCompanyForm,
  parseImporteMensual,
  parsePlanForm,
} from "./validation";

describe("importe mensual", () => {
  it("acepta coma o punto y normaliza a dos decimales sin coma flotante", () => {
    expect(parseImporteMensual("49,90")).toEqual({ ok: true, value: "49.90" });
    expect(parseImporteMensual("49.9")).toEqual({ ok: true, value: "49.90" });
    expect(parseImporteMensual("0")).toEqual({ ok: true, value: "0.00" });
    expect(parseImporteMensual("00049,9")).toEqual({
      ok: true,
      value: "49.90",
    });
    expect(parseImporteMensual("9999999999.99")).toEqual({
      ok: true,
      value: "9999999999.99",
    });
  });

  it("rechaza importes negativos, vacíos, no numéricos o con más de dos decimales", () => {
    for (const value of [
      "",
      "-1",
      "-0.01",
      "49.999",
      "49,999",
      "abc",
      "1e3",
      "+49.90",
      ".50",
      "50.",
      "10000000000.00",
    ]) {
      expect(parseImporteMensual(value)).toEqual({ ok: false });
    }
  });
});

describe("NIF", () => {
  it("normaliza a mayúsculas y sin espacios", () => {
    expect(normalizeNif("  b12345678 ")).toBe("B12345678");
  });

  it("acepta estructuras de DNI, NIE y CIF y rechaza texto libre", () => {
    expect(isValidNif("12345678Z")).toBe(true);
    expect(isValidNif("X1234567L")).toBe(true);
    expect(isValidNif("b12345678")).toBe(true);
    expect(isValidNif("B1234567")).toBe(false);
    expect(isValidNif("1234")).toBe(false);
    expect(isValidNif("B12345678X")).toBe(false);
    expect(isValidNif("NIF inválido")).toBe(false);
  });
});

describe("email y UUID", () => {
  it("normaliza y valida emails de usuario", () => {
    expect(isValidUserEmail("  Ana@Norte.Local ")).toBe(true);
    expect(isValidUserEmail("sin-arroba")).toBe(false);
    expect(isValidUserEmail("ana@sin-dominio")).toBe(false);
    expect(isValidUserEmail("")).toBe(false);
  });

  it("reconoce UUIDs", () => {
    expect(isUuid("00000000-0000-4000-8000-000000000000")).toBe(true);
    expect(isUuid("no-es-un-uuid")).toBe(false);
  });
});

function formData(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    form.set(key, value);
  }
  return form;
}

describe("formularios", () => {
  it("parsea un plan válido y activo", () => {
    expect(
      parsePlanForm(
        formData({ nombre: "  Plan Plata ", importeMensual: "49,90", activo: "1" }),
      ),
    ).toEqual({
      ok: true,
      value: { nombre: "Plan Plata", importeMensual: "49.90", activo: true },
    });
  });

  it("rechaza un plan sin nombre o con importe inválido", () => {
    expect(
      parsePlanForm(formData({ nombre: " ", importeMensual: "10" })),
    ).toEqual({ ok: false, error: "campos" });
    expect(
      parsePlanForm(formData({ nombre: "Plan", importeMensual: "-1" })),
    ).toEqual({ ok: false, error: "importe" });
  });

  it("parsea un alta de empresa y normaliza NIF y emails", () => {
    const result = parseCompanyForm(
      formData({
        nombre: "  Empresa Norte ",
        nif: " b87654321 ",
        direccionFiscal: " Calle Mayor 1 ",
        emailFacturacion: " Facturacion@Norte.Local ",
        planId: "00000000-0000-4000-8000-000000000001",
        estado: "ACTIVA",
        adminNombre: " Ana ",
        adminEmail: " Ana@Norte.Local ",
      }),
    );

    expect(result).toEqual({
      ok: true,
      value: {
        nombre: "Empresa Norte",
        nif: "B87654321",
        direccionFiscal: "Calle Mayor 1",
        emailFacturacion: "facturacion@norte.local",
        planId: "00000000-0000-4000-8000-000000000001",
        estado: "ACTIVA",
        adminNombre: "Ana",
        adminEmail: "ana@norte.local",
      },
    });
  });

  it("rechaza campos obligatorios, NIF, email y plan no válidos", () => {
    const base = {
      nombre: "Empresa",
      nif: "B12345678",
      direccionFiscal: "Calle 1",
      emailFacturacion: "facturacion@empresa.local",
      planId: "00000000-0000-4000-8000-000000000001",
      estado: "ACTIVA",
      adminNombre: "Ana",
      adminEmail: "ana@empresa.local",
    };

    expect(
      parseCompanyForm(formData({ ...base, direccionFiscal: " " })),
    ).toEqual({ ok: false, error: "campos" });
    expect(parseCompanyForm(formData({ ...base, nif: "123" }))).toEqual({
      ok: false,
      error: "nif",
    });
    expect(
      parseCompanyForm(formData({ ...base, adminEmail: "sin-arroba" })),
    ).toEqual({ ok: false, error: "email" });
    expect(parseCompanyForm(formData({ ...base, planId: "plan" }))).toEqual({
      ok: false,
      error: "plan",
    });
  });
});
