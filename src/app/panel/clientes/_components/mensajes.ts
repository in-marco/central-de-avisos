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
};

export const CLIENTE_OK_MESSAGES: Record<string, string> = {
  creado: "Cliente creado con su primera sede y su primer contacto.",
  datos: "Datos de facturación actualizados.",
  "sede-creada": "Sede añadida.",
  sede: "Sede actualizada.",
  "contacto-creado": "Contacto añadido.",
  contacto: "Contacto actualizado.",
};

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
