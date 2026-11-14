import {
  ADDRESS_MAX_LENGTH,
  COMPANY_NAME_MAX_LENGTH,
  formString,
  isValidNif,
  isValidUserEmail,
  normalizeNif,
  normalizeUserEmail,
} from "@/lib/superadmin/validation";

/**
 * Validación pura del formulario de configuración fiscal y de facturación de
 * la empresa (`/panel/empresa`). No toca la base de datos. Los campos
 * `empresaId` o `id` que lleguen en el formulario se ignoran: la empresa sale
 * siempre de la sesión.
 */

export const SERIE_FACTURA_MAX_LENGTH = 10;
export const TARIFA_HORARIA_MAX = "9999.99";
export const MODOS_FISCALES = ["NO_VERIFACTU"] as const;

export type ModoFiscal = (typeof MODOS_FISCALES)[number];

export type BillingSettingsErrorCode =
  | "campos"
  | "nif"
  | "email"
  | "serie"
  | "tarifa"
  | "modo";

export type BillingSettingsValues = {
  nombre: string;
  nif: string;
  direccionFiscal: string;
  emailFacturacion: string;
  serieFactura: string;
  /** Cadena decimal normalizada con dos decimales, p. ej. "42.50". */
  tarifaHoraria: string;
  modoFiscal: ModoFiscal;
};

export type BillingSettingsParseResult =
  | { ok: true; value: BillingSettingsValues }
  | { ok: false; error: BillingSettingsErrorCode };

/** Misma expresión que el CHECK `empresas_serie_factura_formato`. */
const SERIE_PATTERN = /^[A-Z0-9][A-Z0-9-]{0,9}$/;
const TARIFA_PATTERN = /^([0-9]{1,4})(?:[.,]([0-9]{1,2}))?$/;
const TARIFA_MAX_CENTS = 999_999n;

function isFilled(value: string, maxLength: number): boolean {
  return value.length > 0 && value.length <= maxLength;
}

export function normalizeSerie(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidSerie(value: string): boolean {
  return SERIE_PATTERN.test(normalizeSerie(value));
}

/**
 * Convierte una tarifa horaria escrita por una persona («42,5», «42.50») en
 * una cadena decimal con dos decimales. Exige > 0 y ≤ 9999,99; no admite
 * negativos, notación científica ni más de dos decimales. Sin `float`.
 */
export function parseTarifaHoraria(
  value: string,
): { ok: true; value: string } | { ok: false } {
  const match = value.trim().match(TARIFA_PATTERN);

  if (!match) {
    return { ok: false };
  }

  const integerPart = match[1]!;
  const decimalPart = (match[2] ?? "").padEnd(2, "0");
  const cents = BigInt(integerPart) * 100n + BigInt(decimalPart);

  if (cents <= 0n || cents > TARIFA_MAX_CENTS) {
    return { ok: false };
  }

  return {
    ok: true,
    value: `${(cents / 100n).toString()}.${(cents % 100n)
      .toString()
      .padStart(2, "0")}`,
  };
}

/** Muestra una tarifa normalizada («42.50») con coma decimal («42,50»). */
export function formatTarifaInput(value: string | null): string {
  return value ? value.replace(".", ",") : "";
}

function isModoFiscal(value: string): value is ModoFiscal {
  return (MODOS_FISCALES as readonly string[]).includes(value);
}

/**
 * Valida el formulario en el orden visual de los campos y devuelve el primer
 * error encontrado.
 */
export function parseBillingSettingsForm(
  formData: FormData,
): BillingSettingsParseResult {
  const nombre = formString(formData, "nombre").trim();
  // «b 87654321» → «B87654321»: se quitan también los espacios interiores
  // antes de validar con el patrón compartido del alta de empresa.
  const nifRaw = formString(formData, "nif").replace(/\s+/g, "");
  const direccionFiscal = formString(formData, "direccionFiscal").trim();
  const emailRaw = formString(formData, "emailFacturacion");
  const serieRaw = formString(formData, "serieFactura");
  const tarifaRaw = formString(formData, "tarifaHoraria");
  const modoRaw = formString(formData, "modoFiscal").trim();

  if (!isFilled(nombre, COMPANY_NAME_MAX_LENGTH)) {
    return { ok: false, error: "campos" };
  }

  if (!isValidNif(nifRaw)) {
    return { ok: false, error: "nif" };
  }

  if (!isFilled(direccionFiscal, ADDRESS_MAX_LENGTH)) {
    return { ok: false, error: "campos" };
  }

  if (!isValidUserEmail(emailRaw)) {
    return { ok: false, error: "email" };
  }

  if (!isValidSerie(serieRaw)) {
    return { ok: false, error: "serie" };
  }

  const tarifa = parseTarifaHoraria(tarifaRaw);

  if (!tarifa.ok) {
    return { ok: false, error: "tarifa" };
  }

  if (!isModoFiscal(modoRaw)) {
    return { ok: false, error: "modo" };
  }

  return {
    ok: true,
    value: {
      nombre,
      nif: normalizeNif(nifRaw),
      direccionFiscal,
      emailFacturacion: normalizeUserEmail(emailRaw),
      serieFactura: normalizeSerie(serieRaw),
      tarifaHoraria: tarifa.value,
      modoFiscal: modoRaw,
    },
  };
}
