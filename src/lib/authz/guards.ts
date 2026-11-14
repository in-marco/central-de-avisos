import { NextResponse } from "next/server";
import { forbidden } from "next/navigation";
import {
  getCurrentSession,
  requireSession,
} from "@/lib/auth/current-session";
import { safeNextPath } from "@/lib/auth/redirect";
import type { CurrentSession } from "@/lib/auth/session";
import { can, type Permiso } from "./permissions";

/**
 * Guard de páginas de empresa. Anónimo → 307 a `/login?next=...`; sesión sin
 * el permiso → `forbidden()` (403 con la UI de `src/app/panel/forbidden.tsx`).
 *
 * Debe llamarse en la página (o en un layout situado por debajo del boundary
 * `forbidden.tsx`), nunca en `src/app/panel/layout.tsx`. Los roles se leen de
 * la base de datos en cada petición a través de `getCurrentSession`.
 */
export async function requirePermission(
  permiso: Permiso,
  nextPath: string,
): Promise<CurrentSession> {
  const session = await requireSession(nextPath);

  if (!can(session, permiso)) {
    forbidden();
  }

  return session;
}

export type CompanyRequestAuthorization =
  | { ok: true; session: CurrentSession }
  | { ok: false; response: NextResponse };

/**
 * Guard de route handlers de empresa. Anónimo → 307 al login con `next`;
 * sin permiso → 403 en texto. Ocultar en la interfaz nunca basta: toda acción
 * de empresa pasa por aquí.
 */
export async function authorizeCompanyRequest(
  request: Request,
  permiso: Permiso,
  nextPath: string,
): Promise<CompanyRequestAuthorization> {
  const session = await getCurrentSession();

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", safeNextPath(nextPath));

    return {
      ok: false,
      response: NextResponse.redirect(loginUrl, 307),
    };
  }

  if (!can(session, permiso)) {
    return {
      ok: false,
      response: new NextResponse("Tu rol no permite esta acción.", {
        status: 403,
      }),
    };
  }

  return { ok: true, session };
}
