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
  validado: "Aviso validado y publicado en la bolsa.",
  cancelado: "Aviso cancelado.",
};

export function avisoError(code: string | undefined): AvisoErrorInfo | undefined {
  return code !== undefined && Object.hasOwn(AVISO_ERRORS, code) ? AVISO_ERRORS[code] : undefined;
}

/** Campo del formulario de cancelación marcado con `aria-invalid`. */
export type AvisoAccionErrorField = "motivo" | "confirmacion";

export type AvisoAccionErrorInfo = {
  summary: string;
  field?: AvisoAccionErrorField;
  fieldMessage?: string;
};

/** Errores de validar y cancelar en el detalle `/panel/avisos/<id>`. */
const AVISO_ACCION_ERRORS: Record<string, AvisoAccionErrorInfo> = {
  incompleto: {
    summary:
      "No se puede validar: el contacto ya no es de todo el cliente ni de la sede del aviso. Corrige el contacto en la ficha del cliente y vuelve a validar.",
  },
  estado: {
    summary: "El aviso ya no está en un estado que permita esta acción. Revisa su estado actual.",
  },
  motivo: {
    summary: "Revisa el motivo de la cancelación.",
    field: "motivo",
    fieldMessage: "Escribe el motivo de la cancelación (entre 1 y 500 caracteres).",
  },
  confirmacion: {
    summary: "Confirma que este aviso no se ejecutará para poder cancelarlo.",
    field: "confirmacion",
    fieldMessage: "Marca la casilla de confirmación.",
  },
  servicio: {
    summary: "No se pudo completar la acción. Inténtalo de nuevo en unos minutos.",
  },
};

export function avisoAccionError(code: string | undefined): AvisoAccionErrorInfo | undefined {
  return code !== undefined && Object.hasOwn(AVISO_ACCION_ERRORS, code)
    ? AVISO_ACCION_ERRORS[code]
    : undefined;
}

/** Errores del listado `/panel/avisos`. */
const AVISO_LISTADO_ERRORS: Record<string, string> = {
  "no-encontrado": "No se encontró ese aviso en tu empresa. Elige uno del listado.",
  servicio: "No se pudo completar la acción. Inténtalo de nuevo en unos minutos.",
};

export function avisoListadoError(code: string | undefined): string | undefined {
  return code !== undefined && Object.hasOwn(AVISO_LISTADO_ERRORS, code)
    ? AVISO_LISTADO_ERRORS[code]
    : undefined;
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
