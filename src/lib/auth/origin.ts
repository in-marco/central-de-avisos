/**
 * Comprueba que una petición mutadora viene del mismo origen que la app.
 *
 * Si no hay cabecera `Origin` se acepta la petición: los navegadores la envían
 * en los POST de formulario cross-site, y la cookie `SameSite=Lax` actúa como
 * segunda capa. Si hay `Origin`, debe coincidir con el host y protocolo de la
 * petición (teniendo en cuenta proxies que añaden `x-forwarded-*`).
 */
export function isSameOrigin(request: Request): boolean {
  const originHeader = request.headers.get("origin");

  if (!originHeader) {
    return true;
  }

  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    return false;
  }

  if (origin.origin === "null") {
    return false;
  }

  let requestUrl: URL;
  try {
    requestUrl = new URL(request.url);
  } catch {
    return false;
  }

  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();

  const expectedHost = forwardedHost || requestUrl.host;
  const expectedProtocol =
    (forwardedProto || requestUrl.protocol).replace(/:$/, "") + ":";

  return origin.host === expectedHost && origin.protocol === expectedProtocol;
}

/** Indica si la petición llega por HTTPS, para decidir el flag `Secure`. */
export function isSecureRequest(request: Request): boolean {
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();

  if (forwardedProto) {
    return forwardedProto === "https";
  }

  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}
