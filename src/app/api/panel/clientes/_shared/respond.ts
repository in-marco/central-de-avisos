import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { isSameOrigin } from "@/lib/auth/origin";
import type { CurrentSession } from "@/lib/auth/session";
import { authorizeCompanyRequest } from "@/lib/authz/guards";
import { findClienteId, type ClienteWriteError } from "@/lib/clientes/clientes";
import { formString } from "@/lib/superadmin/validation";

/**
 * Utilidades comunes de los route handlers de clientes: 405 en `GET`, mismo
 * origen, `authorizeCompanyRequest("clientes.gestionar")`, lectura del
 * formulario y redirecciones 303 con `?ok=`/`?error=`. Nunca se registran
 * datos personales.
 */

export const CLIENTES_PATH = "/panel/clientes";

export function methodNotAllowed() {
  return new NextResponse(null, {
    status: 405,
    headers: { Allow: "POST" },
  });
}

export function redirectTo(
  request: NextRequest,
  path: string,
  param?: "ok" | "error",
  value?: string,
) {
  const url = new URL(path, request.url);

  if (param && value) {
    url.searchParams.set(param, value);
  }

  return NextResponse.redirect(url, 303);
}

export function clientePath(clienteId: string): string {
  return `${CLIENTES_PATH}/${clienteId}`;
}

export type ClientesRequestContext =
  | { ok: true; session: CurrentSession; empresaId: string; formData: FormData }
  | { ok: false; response: NextResponse };

/** Mismo origen + permiso + formulario. `nextPath` es el destino del login. */
export async function openClientesRequest(
  request: NextRequest,
  nextPath: string,
): Promise<ClientesRequestContext> {
  if (!isSameOrigin(request)) {
    return {
      ok: false,
      response: new NextResponse("Origen no permitido.", { status: 403 }),
    };
  }

  const authorization = await authorizeCompanyRequest(
    request,
    "clientes.gestionar",
    nextPath,
  );

  if (!authorization.ok) {
    return authorization;
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return {
      ok: false,
      response: new NextResponse("Solicitud inválida.", { status: 400 }),
    };
  }

  return {
    ok: true,
    session: authorization.session,
    // `can()` garantiza que la sesión tiene empresa.
    empresaId: authorization.session.empresa!.id,
    formData,
  };
}

/**
 * Resuelve `clienteId` del formulario dentro de la empresa. `null` si no es un
 * UUID, no existe o es de otra empresa: la ruta vuelve al listado con
 * `?error=no-encontrado`, sin distinguir los casos.
 */
export async function resolveClienteId(
  empresaId: string,
  formData: FormData,
): Promise<string | null> {
  return findClienteId(getDb(), empresaId, formString(formData, "clienteId"));
}

/** Traduce un error del repositorio a la redirección correspondiente. */
export function redirectForWriteError(
  request: NextRequest,
  clienteId: string,
  error: ClienteWriteError,
) {
  if (error === "cliente-no-encontrado") {
    return redirectTo(request, CLIENTES_PATH, "error", "no-encontrado");
  }

  return redirectTo(request, clientePath(clienteId), "error", error);
}
