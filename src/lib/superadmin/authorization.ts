import { NextResponse } from "next/server";
import { forbidden } from "next/navigation";
import {
  requireSession,
  getCurrentSession,
} from "@/lib/auth/current-session";
import type { CurrentSession } from "@/lib/auth/session";

/**
 * Única regla de autorización de proveedor: superadmin con `empresa_id` nulo.
 * Es independiente de los roles de empresa (`src/lib/authz/`): el superadmin
 * no tiene roles y los roles de empresa nunca dan acceso a `/superadmin`.
 */
export function isSuperadmin(
  session: Pick<CurrentSession, "esSuperadmin" | "empresa"> | null,
): boolean {
  return session !== null && session.esSuperadmin && session.empresa === null;
}

export async function requireSuperadmin(
  nextPath: string = "/superadmin",
): Promise<CurrentSession> {
  const session = await requireSession(nextPath);

  if (!isSuperadmin(session)) {
    forbidden();
  }

  return session;
}

export type SuperadminRequestAuthorization =
  | { ok: true; session: CurrentSession }
  | { ok: false; response: NextResponse };

/**
 * Guard para route handlers: anónimo → 307 al login; autenticado sin
 * `es_superadmin` → 403. No se usa como única frontera en páginas.
 */
export async function authorizeSuperadminRequest(
  request: Request,
): Promise<SuperadminRequestAuthorization> {
  const session = await getCurrentSession();

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", "/superadmin");

    return {
      ok: false,
      response: NextResponse.redirect(loginUrl, 307),
    };
  }

  if (!isSuperadmin(session)) {
    return {
      ok: false,
      response: new NextResponse("Acceso reservado al superadmin.", {
        status: 403,
      }),
    };
  }

  return { ok: true, session };
}
