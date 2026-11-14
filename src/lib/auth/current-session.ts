import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getSessionByToken, type CurrentSession } from "./session";
import { SESSION_COOKIE_NAME } from "./session-token";
import { safeNextPath } from "./redirect";

/**
 * Lee la cookie de sesión y la valida contra la base de datos. Se memoiza por
 * petición con `cache()` de React para no repetir la consulta en layout y page.
 *
 * Un fallo de base de datos se trata como no autenticado: nunca se concede
 * acceso por error.
 */
export const getCurrentSession = cache(
  async (): Promise<CurrentSession | null> => {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!token) {
      return null;
    }

    try {
      return await getSessionByToken(getDb(), token);
    } catch {
      return null;
    }
  },
);

/**
 * Frontera de seguridad de las rutas privadas. Debe llamarse en el layout o en
 * la página de cada segmento privado; no se usa middleware/proxy como
 * autorización.
 */
export async function requireSession(
  nextPath: string = "/panel",
): Promise<CurrentSession> {
  const session = await getCurrentSession();

  if (!session) {
    const safeNext = safeNextPath(nextPath);
    redirect(`/login?next=${encodeURIComponent(safeNext)}`);
  }

  return session;
}
