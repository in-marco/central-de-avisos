import { forbidden } from "next/navigation";
import { requireSession } from "@/lib/auth/current-session";
import type { CurrentSession } from "@/lib/auth/session";
import { clienteScope, isPortalSession, type ClienteScope } from "./scope";

/**
 * Guard de las páginas de `/portal`. Anónimo → 307 a `/login?next=...`;
 * sesión de empresa o de superadmin → `forbidden()` (403 con la UI de
 * `src/app/portal/forbidden.tsx`).
 *
 * Cada `page.tsx` de `/portal` lo llama (lo comprueba
 * `src/lib/portal/portal-guards.test.ts`); el layout no redirige ni deniega.
 * Devuelve la sesión y su `scope`, que es lo único con lo que se filtran las
 * consultas del portal.
 */
export async function requirePortalSession(
  nextPath: string = "/portal",
): Promise<{ session: CurrentSession; scope: ClienteScope }> {
  const session = await requireSession(nextPath);

  if (!isPortalSession(session)) {
    forbidden();
  }

  return { session, scope: clienteScope(session) };
}
