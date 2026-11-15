/** Mensajes de `?error=` y `?ok=` de las páginas de clientes. */

export const CLIENTE_ERROR_MESSAGES: Record<string, string> = {
  campos:
    "Revisa los campos obligatorios: no pueden quedar vacíos ni superar la longitud máxima.",
  nif: "El NIF no tiene un formato válido (por ejemplo, B12345678 o 12345678Z).",
  "nif-duplicado": "Ya existe otro cliente de tu empresa con ese NIF.",
  tarifa:
    "La tarifa debe ser un importe no negativo con dos decimales como máximo (por ejemplo, 42,50).",
  email: "El email del contacto no es válido.",
  telefono:
    "El teléfono del contacto no es válido: usa entre 6 y 20 caracteres con números, espacios, paréntesis, guiones y un + inicial opcional.",
  contacto: "Indica al menos un teléfono o un email para el contacto.",
  sede: "La sede elegida no pertenece a este cliente.",
  "no-encontrado": "No se encontró ese registro en tu empresa.",
  servicio: "No se pudieron guardar los cambios. Inténtalo de nuevo en unos minutos.",
  "contacto-sin-email":
    "El contacto no tiene email: añade uno antes de invitarlo al portal.",
  "email-en-uso":
    "Ese email ya lo usa otra cuenta de la plataforma. Usa otro email para el contacto.",
  "ya-activo": "Este contacto ya tiene acceso activo al portal.",
};

export const CLIENTE_OK_MESSAGES: Record<string, string> = {
  creado: "Cliente creado con su primera sede y su primer contacto.",
  datos: "Datos de facturación actualizados.",
  "sede-creada": "Sede añadida.",
  sede: "Sede actualizada.",
  "contacto-creado": "Contacto añadido.",
  contacto: "Contacto actualizado.",
  invitado: "Invitación al portal creada. Copia el enlace y envíaselo al contacto.",
  "nuevo-enlace":
    "Enlace nuevo generado. El enlace anterior ya no sirve; copia este y envíaselo al contacto.",
};

/** Busca un mensaje por código sin caer en propiedades heredadas (`__proto__`). */
export function messageFor(
  messages: Record<string, string>,
  code: string | undefined,
): string | undefined {
  return code && Object.hasOwn(messages, code) ? messages[code] : undefined;
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
