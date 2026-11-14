import {
  EMAIL_MAX_LENGTH,
  isEmailLengthValid,
  normalizeEmail,
} from "@/lib/auth/password";

export const PLAN_NAME_MAX_LENGTH = 120;
export const COMPANY_NAME_MAX_LENGTH = 160;
export const ADDRESS_MAX_LENGTH = 240;
export const PERSON_NAME_MAX_LENGTH = 120;
export const IMPORTE_MENSUAL_MAX = "9999999999.99";

export type SuperadminErrorCode =
  | "campos"
  | "nif"
  | "email"
  | "plan"
  | "importe"
  | "servicio";

export type PlanFormValues = {
  nombre: string;
  importeMensual: string;
  activo: boolean;
};

export type CompanyFormValues = {
  nombre: string;
  nif: string;
  direccionFiscal: string;
  emailFacturacion: string;
  planId: string;
  estado: "ACTIVA" | "SUSPENDIDA";
  adminNombre: string;
  adminEmail: string;
};

export type FormParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SuperadminErrorCode };

const NIF_PATTERN =
  /^(?:[0-9]{8}[A-Z]|[XYZ][0-9]{7}[A-Z]|[ABCDEFGHJKLMNPQRSUVW][0-9]{7}[0-9A-J])$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IMPORTE_PATTERN = /^(\d{1,10})(?:[.,](\d{1,2}))?$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function normalizeNif(nif: string): string {
  return nif.trim().toUpperCase();
}

export function isValidNif(nif: string): boolean {
  return NIF_PATTERN.test(normalizeNif(nif));
}

export function normalizeUserEmail(email: string): string {
  return normalizeEmail(email);
}

export function isValidUserEmail(email: string): boolean {
  const normalized = normalizeUserEmail(email);
  return (
    isEmailLengthValid(normalized) &&
    normalized.length <= EMAIL_MAX_LENGTH &&
    EMAIL_PATTERN.test(normalized)
  );
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

function isFilled(value: string, maxLength: number): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength;
}

/**
 * Convierte un importe escrito por una persona a una cadena decimal
 * normalizada con dos decimales. Admite coma o punto, no admite negativos,
 * notación científica ni más de dos decimales.
 */
export function parseImporteMensual(
  value: string,
): { ok: true; value: string } | { ok: false } {
  const match = value.trim().match(IMPORTE_PATTERN);

  if (!match) {
    return { ok: false };
  }

  const integerPart = match[1];
  const decimalPart = (match[2] ?? "").padEnd(2, "0");
  const cents = BigInt(integerPart) * 100n + BigInt(decimalPart);

  if (cents > 999_999_999_999n) {
    return { ok: false };
  }

  return {
    ok: true,
    value: `${(cents / 100n).toString()}.${(cents % 100n)
      .toString()
      .padStart(2, "0")}`,
  };
}

export function parsePlanForm(formData: FormData): FormParseResult<PlanFormValues> {
  const nombre = formString(formData, "nombre").trim();
  const importeRaw = formString(formData, "importeMensual");
  const activoRaw = formString(formData, "activo");

  if (!isFilled(nombre, PLAN_NAME_MAX_LENGTH)) {
    return { ok: false, error: "campos" };
  }

  const importe = parseImporteMensual(importeRaw);

  if (!importe.ok) {
    return { ok: false, error: "importe" };
  }

  return {
    ok: true,
    value: {
      nombre,
      importeMensual: importe.value,
      activo: activoRaw === "1" || activoRaw === "on" || activoRaw === "true",
    },
  };
}

export function parseCompanyForm(
  formData: FormData,
): FormParseResult<CompanyFormValues> {
  const nombre = formString(formData, "nombre").trim();
  const nifRaw = formString(formData, "nif");
  const direccionFiscal = formString(formData, "direccionFiscal").trim();
  const emailFacturacionRaw = formString(formData, "emailFacturacion");
  const planId = formString(formData, "planId").trim();
  const estadoRaw = formString(formData, "estado").trim().toUpperCase();
  const adminNombre = formString(formData, "adminNombre").trim();
  const adminEmailRaw = formString(formData, "adminEmail");

  if (
    !isFilled(nombre, COMPANY_NAME_MAX_LENGTH) ||
    !isFilled(direccionFiscal, ADDRESS_MAX_LENGTH) ||
    !isFilled(adminNombre, PERSON_NAME_MAX_LENGTH)
  ) {
    return { ok: false, error: "campos" };
  }

  if (!isUuid(planId)) {
    return { ok: false, error: "plan" };
  }

  const estado = estadoRaw === "" ? "ACTIVA" : estadoRaw;

  if (estado !== "ACTIVA" && estado !== "SUSPENDIDA") {
    return { ok: false, error: "campos" };
  }

  if (!isValidNif(nifRaw)) {
    return { ok: false, error: "nif" };
  }

  if (
    !isValidUserEmail(emailFacturacionRaw) ||
    !isValidUserEmail(adminEmailRaw)
  ) {
    return { ok: false, error: "email" };
  }

  return {
    ok: true,
    value: {
      nombre,
      nif: normalizeNif(nifRaw),
      direccionFiscal,
      emailFacturacion: normalizeUserEmail(emailFacturacionRaw),
      planId: planId.toLowerCase(),
      estado,
      adminNombre,
      adminEmail: normalizeUserEmail(adminEmailRaw),
    },
  };
}
