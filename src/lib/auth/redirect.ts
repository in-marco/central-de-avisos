export const DEFAULT_AUTH_REDIRECT = "/panel";

/**
 * Devuelve una ruta interna segura para el parámetro `next`.
 *
 * Solo se aceptan rutas relativas que empiezan por `/` y no por `//` o `/\`.
 * Cualquier URL absoluta, protocol-relative, con backslashes o caracteres de
 * control se descarta y se vuelve a `/panel`.
 */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_AUTH_REDIRECT;
  }

  const next = value.trim();

  if (
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/\\") ||
    next.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(next)
  ) {
    return DEFAULT_AUTH_REDIRECT;
  }

  return next;
}
