import { formString, isUuid } from "@/lib/superadmin/validation";

/**
 * Validación pura del formulario de alta de aviso de oficina. No toca la base
 * de datos: la pertenencia de cliente, sede y contacto a la empresa (y entre
 * sí) se comprueba en `avisos.ts` con `tenantFilter`.
 *
 * Los campos `empresaId`, `estado`, `origen` o `creadoPorId` que lleguen en el
 * formulario se ignoran: los fija el servidor.
 */

export const DESCRIPCION_MAX_LENGTH = 2000;

export const PRIORIDADES = ["NORMAL", "ALTA", "URGENTE"] as const;
export type Prioridad = (typeof PRIORIDADES)[number];

export const ESTADOS = [
  "NUEVO",
  "PENDIENTE",
  "ASIGNADO",
  "EN_CURSO",
  "RESUELTO",
  "FACTURADO",
  "CANCELADO",
] as const;
export type Estado = (typeof ESTADOS)[number];

export const ORIGENES = ["OFICINA", "CLIENTE"] as const;
export type Origen = (typeof ORIGENES)[number];

export const PRIORIDAD_LABELS: Record<Prioridad, string> = {
  NORMAL: "Normal",
  ALTA: "Alta",
  URGENTE: "Urgente",
};

export const ESTADO_LABELS: Record<Estado, string> = {
  NUEVO: "Nuevo",
  PENDIENTE: "Pendiente",
  ASIGNADO: "Asignado",
  EN_CURSO: "En curso",
  RESUELTO: "Resuelto",
  FACTURADO: "Facturado",
  CANCELADO: "Cancelado",
};

export const ORIGEN_LABELS: Record<Origen, string> = {
  OFICINA: "Oficina",
  CLIENTE: "Cliente",
};

/**
 * Códigos de error del alta. `no-encontrado` se refiere siempre al cliente
 * (vacío, no UUID, inexistente o de otra empresa).
 */
export type AvisoFieldError =
  | "no-encontrado"
  | "sede"
  | "contacto"
  | "descripcion"
  | "prioridad";

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AvisoFieldError };

export type NuevoAvisoValues = {
  clienteId: string;
  sedeId: string;
  contactoId: string;
  descripcion: string;
  prioridad: Prioridad;
};

export type NuevoAvisoInput = {
  clienteId: string;
  sedeId: string;
  contactoId: string;
  descripcion: string;
  prioridad: string;
};

export function isPrioridad(value: string): value is Prioridad {
  return (PRIORIDADES as readonly string[]).includes(value);
}

/** Id normalizado (minúsculas, sin espacios) o `null` si no es un UUID. */
export function normalizeUuid(value: string): string | null {
  return isUuid(value) ? value.trim().toLowerCase() : null;
}

/**
 * Descripción recortada en los extremos, con saltos de línea normalizados a
 * `\n` (los navegadores envían `\r\n`) y conservados. `null` si queda vacía o
 * supera `DESCRIPCION_MAX_LENGTH`.
 */
export function normalizeDescripcion(value: string): string | null {
  const normalized = value.replace(/\r\n?/g, "\n").trim();

  if (normalized.length === 0 || normalized.length > DESCRIPCION_MAX_LENGTH) {
    return null;
  }

  return normalized;
}

export function parseNuevoAvisoFields(
  input: NuevoAvisoInput,
): ParseResult<NuevoAvisoValues> {
  const clienteId = normalizeUuid(input.clienteId);

  if (!clienteId) {
    return { ok: false, error: "no-encontrado" };
  }

  const sedeId = normalizeUuid(input.sedeId);

  if (!sedeId) {
    return { ok: false, error: "sede" };
  }

  const contactoId = normalizeUuid(input.contactoId);

  if (!contactoId) {
    return { ok: false, error: "contacto" };
  }

  const descripcion = normalizeDescripcion(input.descripcion);

  if (descripcion === null) {
    return { ok: false, error: "descripcion" };
  }

  if (!isPrioridad(input.prioridad)) {
    return { ok: false, error: "prioridad" };
  }

  return {
    ok: true,
    value: { clienteId, sedeId, contactoId, descripcion, prioridad: input.prioridad },
  };
}

export function parseNuevoAvisoForm(formData: FormData): ParseResult<NuevoAvisoValues> {
  return parseNuevoAvisoFields({
    clienteId: formString(formData, "clienteId"),
    sedeId: formString(formData, "sedeId"),
    contactoId: formString(formData, "contactoId"),
    descripcion: formString(formData, "descripcion"),
    prioridad: formString(formData, "prioridad"),
  });
}
