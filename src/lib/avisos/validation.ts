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

/* -------------------------------------------------------------------------- */
/* Validación, cancelación y vistas del listado (aviso-validation-pool).       */
/* -------------------------------------------------------------------------- */

export const MOTIVO_CANCELACION_MAX_LENGTH = 500;

/** Estados desde los que la oficina puede cancelar un aviso. */
export const ESTADOS_CANCELABLES = ["NUEVO", "PENDIENTE"] as const satisfies readonly Estado[];

export function isEstadoCancelable(estado: Estado): boolean {
  return (ESTADOS_CANCELABLES as readonly Estado[]).includes(estado);
}

/**
 * Códigos de error de las acciones de validar y cancelar:
 * - `no-encontrado`: `avisoId` vacío, no UUID, inexistente o de otra empresa.
 * - `estado`: el aviso no está en un estado de origen permitido.
 * - `incompleto`: el aviso tiene problemas que impiden validarlo.
 * - `motivo`: motivo vacío, de solo espacios o de más de 500 caracteres.
 * - `confirmacion`: falta la casilla de confirmación de la cancelación.
 */
export type AvisoAccionError =
  | "no-encontrado"
  | "estado"
  | "incompleto"
  | "motivo"
  | "confirmacion";

export type AccionParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AvisoAccionError };

/** `avisoId` del formulario de validación. */
export function parseAvisoIdForm(formData: FormData): AccionParseResult<{ avisoId: string }> {
  const avisoId = normalizeUuid(formString(formData, "avisoId"));
  return avisoId ? { ok: true, value: { avisoId } } : { ok: false, error: "no-encontrado" };
}

/**
 * Motivo recortado en los extremos y con saltos de línea normalizados a `\n`.
 * `null` si queda vacío o supera `MOTIVO_CANCELACION_MAX_LENGTH`.
 */
export function normalizeMotivo(value: string): string | null {
  const normalized = value.replace(/\r\n?/g, "\n").trim();

  if (normalized.length === 0 || normalized.length > MOTIVO_CANCELACION_MAX_LENGTH) {
    return null;
  }

  return normalized;
}

export type CancelacionValues = { avisoId: string; motivo: string };

export function parseCancelacionFields(input: {
  avisoId: string;
  motivo: string;
  confirmar: string;
}): AccionParseResult<CancelacionValues> {
  const avisoId = normalizeUuid(input.avisoId);

  if (!avisoId) {
    return { ok: false, error: "no-encontrado" };
  }

  const motivo = normalizeMotivo(input.motivo);

  if (motivo === null) {
    return { ok: false, error: "motivo" };
  }

  if (input.confirmar !== "si") {
    return { ok: false, error: "confirmacion" };
  }

  return { ok: true, value: { avisoId, motivo } };
}

/** Formulario de cancelación: `avisoId`, `motivo` y `confirmar=si`. */
export function parseCancelacionForm(formData: FormData): AccionParseResult<CancelacionValues> {
  return parseCancelacionFields({
    avisoId: formString(formData, "avisoId"),
    motivo: formString(formData, "motivo"),
    confirmar: formString(formData, "confirmar"),
  });
}

/**
 * Problemas que impiden validar un aviso. Hoy todos los campos del aviso son
 * obligatorios en la base de datos, así que el único caso alcanzable es:
 * - `contacto-sede`: el contacto se vinculó después a otra sede, así que ya
 *   no es de todo el cliente ni de la sede del aviso.
 * Pensada para ampliarse (p. ej. avisos de cliente con contacto opcional).
 */
export type ProblemaValidacion = "contacto-sede";

export function problemasParaValidar(aviso: {
  sedeId: string;
  contacto: { sedeId: string | null };
}): ProblemaValidacion[] {
  const problemas: ProblemaValidacion[] = [];

  if (aviso.contacto.sedeId !== null && aviso.contacto.sedeId !== aviso.sedeId) {
    problemas.push("contacto-sede");
  }

  return problemas;
}

export const PROBLEMA_VALIDACION_LABELS: Record<ProblemaValidacion, string> = {
  "contacto-sede": "el contacto ya no es de todo el cliente ni de la sede del aviso",
};

/** Vistas del listado `/panel/avisos`. */
export const VISTAS = ["todos", "por-validar", "bolsa", "cancelados"] as const;
export type Vista = (typeof VISTAS)[number];

export const VISTA_LABELS: Record<Vista, string> = {
  todos: "Todos",
  "por-validar": "Por validar",
  bolsa: "En bolsa",
  cancelados: "Cancelados",
};

const VISTAS_SET: ReadonlySet<string> = new Set(VISTAS);

/** Vista del parámetro `?vista=`; cualquier valor desconocido es `todos`. */
export function parseVista(value: string | undefined): Vista {
  return value !== undefined && VISTAS_SET.has(value) ? (value as Vista) : "todos";
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
