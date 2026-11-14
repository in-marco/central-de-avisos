import { describe, expect, it } from "vitest";
import {
  formatTarifaInput,
  normalizeSerie,
  parseBillingSettingsForm,
  parseTarifaHoraria,
} from "./configuracion-validation";

const VALID: Record<string, string> = {
  nombre: "  Instalaciones Norte SL  ",
  nif: "b 87654321",
  direccionFiscal: " Calle Mayor 2, 28013 Madrid ",
  emailFacturacion: "  Facturas@Empresa.ES ",
  serieFactura: " f- ",
  tarifaHoraria: "42,5",
  modoFiscal: "NO_VERIFACTU",
};

function form(overrides: Record<string, string | undefined> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries({ ...VALID, ...overrides })) {
    if (value !== undefined) {
      data.set(key, value);
    }
  }
  return data;
}

describe("parseBillingSettingsForm", () => {
  it("normaliza todos los campos válidos", () => {
    expect(parseBillingSettingsForm(form())).toEqual({
      ok: true,
      value: {
        nombre: "Instalaciones Norte SL",
        nif: "B87654321",
        direccionFiscal: "Calle Mayor 2, 28013 Madrid",
        emailFacturacion: "facturas@empresa.es",
        serieFactura: "F-",
        tarifaHoraria: "42.50",
        modoFiscal: "NO_VERIFACTU",
      },
    });
  });

  it("ignora empresaId e id enviados en el formulario", () => {
    const result = parseBillingSettingsForm(
      form({ empresaId: "00000000-0000-4000-8000-000000000000", id: "otro" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.value).sort()).toEqual([
        "direccionFiscal",
        "emailFacturacion",
        "modoFiscal",
        "nif",
        "nombre",
        "serieFactura",
        "tarifaHoraria",
      ]);
    }
  });

  it.each([
    ["nombre vacío", { nombre: "   " }, "campos"],
    ["nombre demasiado largo", { nombre: "x".repeat(161) }, "campos"],
    ["nombre ausente", { nombre: undefined }, "campos"],
    ["dirección vacía", { direccionFiscal: "" }, "campos"],
    ["dirección demasiado larga", { direccionFiscal: "x".repeat(241) }, "campos"],
    ["NIF corto", { nif: "1234" }, "nif"],
    ["NIF vacío", { nif: "" }, "nif"],
    ["NIF con letras de más", { nif: "B1234567890" }, "nif"],
    ["email inválido", { emailFacturacion: "facturas@" }, "email"],
    ["email vacío", { emailFacturacion: "" }, "email"],
    ["serie vacía", { serieFactura: "  " }, "serie"],
    ["serie larga", { serieFactura: "ABCDEFGHIJK" }, "serie"],
    ["serie con espacio", { serieFactura: "F A" }, "serie"],
    ["serie con barra", { serieFactura: "F/2026" }, "serie"],
    ["serie que empieza por guion", { serieFactura: "-F" }, "serie"],
    ["serie con tilde", { serieFactura: "FÑ" }, "serie"],
    ["tarifa 0", { tarifaHoraria: "0" }, "tarifa"],
    ["tarifa 0,00", { tarifaHoraria: "0,00" }, "tarifa"],
    ["tarifa negativa", { tarifaHoraria: "-5" }, "tarifa"],
    ["tarifa no numérica", { tarifaHoraria: "abc" }, "tarifa"],
    ["tarifa con tres decimales", { tarifaHoraria: "12,345" }, "tarifa"],
    ["tarifa por encima del máximo", { tarifaHoraria: "10000" }, "tarifa"],
    ["tarifa vacía", { tarifaHoraria: "" }, "tarifa"],
    ["tarifa en notación científica", { tarifaHoraria: "1e3" }, "tarifa"],
    ["modo VERIFACTU", { modoFiscal: "VERIFACTU" }, "modo"],
    ["modo en minúsculas", { modoFiscal: "no_verifactu" }, "modo"],
    ["modo ausente", { modoFiscal: undefined }, "modo"],
  ])("rechaza %s", (_label, overrides, error) => {
    expect(parseBillingSettingsForm(form(overrides))).toEqual({
      ok: false,
      error,
    });
  });

  it("devuelve el primer error en el orden del formulario", () => {
    expect(
      parseBillingSettingsForm(
        form({ nif: "1234", tarifaHoraria: "0", modoFiscal: "VERIFACTU" }),
      ),
    ).toEqual({ ok: false, error: "nif" });
    expect(
      parseBillingSettingsForm(form({ serieFactura: "", tarifaHoraria: "0" })),
    ).toEqual({ ok: false, error: "serie" });
  });

  it("admite NIE y CIF válidos", () => {
    expect(parseBillingSettingsForm(form({ nif: "x1234567l" })).ok).toBe(true);
    expect(parseBillingSettingsForm(form({ nif: "12345678Z" })).ok).toBe(true);
  });
});

describe("parseTarifaHoraria", () => {
  it.each([
    ["42,5", "42.50"],
    ["42.5", "42.50"],
    ["45", "45.00"],
    ["0,01", "0.01"],
    ["9999,99", "9999.99"],
    [" 7,05 ", "7.05"],
  ])("%s → %s", (input, expected) => {
    expect(parseTarifaHoraria(input)).toEqual({ ok: true, value: expected });
  });

  it("rechaza 10000 y 0", () => {
    expect(parseTarifaHoraria("10000")).toEqual({ ok: false });
    expect(parseTarifaHoraria("0")).toEqual({ ok: false });
  });
});

describe("helpers de presentación", () => {
  it("normaliza la serie a mayúsculas", () => {
    expect(normalizeSerie(" f-2026 ")).toBe("F-2026");
  });

  it("muestra la tarifa con coma decimal", () => {
    expect(formatTarifaInput("42.50")).toBe("42,50");
    expect(formatTarifaInput(null)).toBe("");
  });
});
