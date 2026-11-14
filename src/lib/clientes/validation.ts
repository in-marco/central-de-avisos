import {
  ADDRESS_MAX_LENGTH,
  COMPANY_NAME_MAX_LENGTH,
  formString,
  isUuid,
  isValidNif,
  isValidUserEmail,
  normalizeNif,
  normalizeUserEmail,
  parseImporteMensual,
  PERSON_NAME_MAX_LENGTH,
} from "@/lib/superadmin/validation";

/**
 * Validación pura de los formularios de clientes, sedes y contactos. No toca
 * la base de datos: la pertenencia de ids (cliente, sede, contacto) a la
 * empresa se comprueba en `clientes.ts` con `tenantFilter`.
 */

export const RAZON_SOCIAL_MAX_LENGTH = COMPANY_NAME_MAX_LENGTH; // 160
export const DIRECCION_MAX_LENGTH = ADDRESS_MAX_LENGTH; // 240
export const NOMBRE_MAX_LENGTH = PERSON_NAME_MAX_LENGTH; // 120
export const NIF_INPUT_MAX_LENGTH = 20;
export const TELEFONO_MAX_LENGTH = 20;
export const TELEFONO_MIN_DIGITOS = 6;
export const EMAIL_INPUT_MAX_LENGTH = 254;

export type ClienteFieldError =
  | "campos"
  | "nif"
  | "tarifa"
  | "email"
  | "telefono"
  | "contacto"
  | "sede";

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ClienteFieldError };

export type ClienteValues = {
  razonSocial: string;
  nif: string;
  direccionFacturacion: string;
  /** Decimal normalizado con dos decimales («45.00») o `null`. */
  tarifaHoraria: string | null;
};

export type SedeValues = {
  nombre: string;
  direccion: string;
};

export type ContactoValues = {
  nombre: string;
  telefono: string | null;
  email: string | null;
  /** Sede del mismo cliente (sin comprobar aún) o `null` = todo el cliente. */
  sedeId: string | null;
};

export type NuevoClienteValues = {
  cliente: ClienteValues;
  sede: SedeValues;
  contacto: Omit<ContactoValues, "sedeId">;
  /** Vincula el primer contacto a la primera sede. */
  contactoEnSede: boolean;
};

const TELEFONO_PATTERN = /^\+?[0-9 ()-]{6,20}$/;

function isFilled(value: string, maxLength: number): boolean {
  return value.length > 0 && value.length <= maxLength;
}

/** Cadena recortada o `null` si queda vacía. */
export function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function isValidTelefono(value: string): boolean {
  const trimmed = value.trim();

  if (!TELEFONO_PATTERN.test(trimmed)) {
    return false;
  }

  return (trimmed.match(/[0-9]/g) ?? []).length >= TELEFONO_MIN_DIGITOS;
}

function isChecked(value: string): boolean {
  return value === "1" || value === "on" || value === "true";
}

export type ClienteInput = {
  razonSocial: string;
  nif: string;
  direccionFacturacion: string;
  tarifaHoraria: string;
};

export function parseClienteFields(input: ClienteInput): ParseResult<ClienteValues> {
  const razonSocial = input.razonSocial.trim();
  const direccionFacturacion = input.direccionFacturacion.trim();
  const nifRaw = input.nif;

  if (
    !isFilled(razonSocial, RAZON_SOCIAL_MAX_LENGTH) ||
    !isFilled(direccionFacturacion, DIRECCION_MAX_LENGTH) ||
    nifRaw.trim() === "" ||
    nifRaw.trim().length > NIF_INPUT_MAX_LENGTH
  ) {
    return { ok: false, error: "campos" };
  }

  if (!isValidNif(nifRaw)) {
    return { ok: false, error: "nif" };
  }

  let tarifaHoraria: string | null = null;
  const tarifaRaw = input.tarifaHoraria.trim();

  if (tarifaRaw !== "") {
    const tarifa = parseImporteMensual(tarifaRaw);

    if (!tarifa.ok) {
      return { ok: false, error: "tarifa" };
    }

    tarifaHoraria = tarifa.value;
  }

  return {
    ok: true,
    value: {
      razonSocial,
      nif: normalizeNif(nifRaw),
      direccionFacturacion,
      tarifaHoraria,
    },
  };
}

export type SedeInput = { nombre: string; direccion: string };

export function parseSedeFields(input: SedeInput): ParseResult<SedeValues> {
  const nombre = input.nombre.trim();
  const direccion = input.direccion.trim();

  if (!isFilled(nombre, NOMBRE_MAX_LENGTH) || !isFilled(direccion, DIRECCION_MAX_LENGTH)) {
    return { ok: false, error: "campos" };
  }

  return { ok: true, value: { nombre, direccion } };
}

export type ContactoInput = {
  nombre: string;
  telefono: string;
  email: string;
  sedeId: string;
};

export function parseContactoFields(
  input: ContactoInput,
): ParseResult<ContactoValues> {
  const nombre = input.nombre.trim();

  if (!isFilled(nombre, NOMBRE_MAX_LENGTH)) {
    return { ok: false, error: "campos" };
  }

  const telefono = emptyToNull(input.telefono);
  const emailRaw = emptyToNull(input.email);

  if (telefono !== null && !isValidTelefono(telefono)) {
    return { ok: false, error: "telefono" };
  }

  if (emailRaw !== null && !isValidUserEmail(emailRaw)) {
    return { ok: false, error: "email" };
  }

  if (telefono === null && emailRaw === null) {
    return { ok: false, error: "contacto" };
  }

  const sedeIdRaw = emptyToNull(input.sedeId);

  if (sedeIdRaw !== null && !isUuid(sedeIdRaw)) {
    return { ok: false, error: "sede" };
  }

  return {
    ok: true,
    value: {
      nombre,
      telefono,
      email: emailRaw === null ? null : normalizeUserEmail(emailRaw),
      sedeId: sedeIdRaw === null ? null : sedeIdRaw.toLowerCase(),
    },
  };
}

export function parseClienteForm(formData: FormData): ParseResult<ClienteValues> {
  return parseClienteFields({
    razonSocial: formString(formData, "razonSocial"),
    nif: formString(formData, "nif"),
    direccionFacturacion: formString(formData, "direccionFacturacion"),
    tarifaHoraria: formString(formData, "tarifaHoraria"),
  });
}

export function parseSedeForm(formData: FormData): ParseResult<SedeValues> {
  return parseSedeFields({
    nombre: formString(formData, "nombre"),
    direccion: formString(formData, "direccion"),
  });
}

export function parseContactoForm(formData: FormData): ParseResult<ContactoValues> {
  return parseContactoFields({
    nombre: formString(formData, "nombre"),
    telefono: formString(formData, "telefono"),
    email: formString(formData, "email"),
    sedeId: formString(formData, "sedeId"),
  });
}

/**
 * Alta completa: datos de facturación, primera sede (`sedeNombre`,
 * `sedeDireccion`) y primer contacto (`contactoNombre`, `contactoTelefono`,
 * `contactoEmail`, `contactoEnSede`).
 */
export function parseNuevoClienteForm(
  formData: FormData,
): ParseResult<NuevoClienteValues> {
  const cliente = parseClienteForm(formData);

  if (!cliente.ok) {
    return cliente;
  }

  const sede = parseSedeFields({
    nombre: formString(formData, "sedeNombre"),
    direccion: formString(formData, "sedeDireccion"),
  });

  if (!sede.ok) {
    return sede;
  }

  const contacto = parseContactoFields({
    nombre: formString(formData, "contactoNombre"),
    telefono: formString(formData, "contactoTelefono"),
    email: formString(formData, "contactoEmail"),
    sedeId: "",
  });

  if (!contacto.ok) {
    return contacto;
  }

  return {
    ok: true,
    value: {
      cliente: cliente.value,
      sede: sede.value,
      contacto: {
        nombre: contacto.value.nombre,
        telefono: contacto.value.telefono,
        email: contacto.value.email,
      },
      contactoEnSede: isChecked(formString(formData, "contactoEnSede")),
    },
  };
}
