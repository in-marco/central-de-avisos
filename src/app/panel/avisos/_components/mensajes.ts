/**
 * Mensajes de `?error=` y `?ok=` de las páginas de avisos. Se buscan siempre
 * con `Object.hasOwn`: un código como `__proto__` o `constructor` no debe
 * resolver a una propiedad heredada del objeto literal.
 */

export type AvisoErrorField = "sede" | "contacto" | "descripcion" | "prioridad";

export type AvisoErrorInfo = {
  summary: string;
  /** Campo marcado con `aria-invalid` y su mensaje inline. */
  field?: AvisoErrorField;
  fieldMessage?: string;
};

const AVISO_ERRORS: Record<string, AvisoErrorInfo> = {
  "no-encontrado": {
    summary: "No se encontró ese cliente en tu empresa. Elige uno del listado.",
  },
  sede: {
    summary: "Revisa la sede del aviso.",
    field: "sede",
    fieldMessage: "Elige una sede de este cliente.",
  },
  contacto: {
    summary: "Revisa el contacto del aviso.",
    field: "contacto",
    fieldMessage: "Elige un contacto de todo el cliente o de la sede elegida.",
  },
  descripcion: {
    summary: "Revisa la descripción de la avería.",
    field: "descripcion",
    fieldMessage: "Describe la avería (entre 1 y 2000 caracteres).",
  },
  prioridad: {
    summary: "Revisa la prioridad del aviso.",
    field: "prioridad",
    fieldMessage: "Elige Normal, Alta o Urgente.",
  },
  servicio: {
    summary: "No se pudo crear el aviso. Inténtalo de nuevo en unos minutos.",
  },
};

const AVISO_OK_MESSAGES: Record<string, string> = {
  creado: "Aviso creado.",
};

export function avisoError(code: string | undefined): AvisoErrorInfo | undefined {
  return code !== undefined && Object.hasOwn(AVISO_ERRORS, code) ? AVISO_ERRORS[code] : undefined;
}

export function avisoOkMessage(code: string | undefined): string | undefined {
  return code !== undefined && Object.hasOwn(AVISO_OK_MESSAGES, code)
    ? AVISO_OK_MESSAGES[code]
    : undefined;
}

const fechaFormatter = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  dateStyle: "short",
  timeStyle: "short",
});

/** Fecha y hora en Europe/Madrid, p. ej. «15/11/26, 10:05». */
export function formatFecha(date: Date): string {
  return fechaFormatter.format(date);
}

/** Inicio de la descripción en una sola línea para el listado. */
export function resumenDescripcion(texto: string, max = 90): string {
  const linea = texto.replace(/\s+/g, " ").trim();
  return linea.length > max ? `${linea.slice(0, max - 1).trimEnd()}…` : linea;
}
