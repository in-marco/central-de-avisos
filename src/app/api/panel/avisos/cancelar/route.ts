import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { isSameOrigin } from "@/lib/auth/origin";
import { authorizeCompanyRequest } from "@/lib/authz/guards";
import { cancelarAviso, findAvisoId } from "@/lib/avisos/avisos";
import { parseCancelacionForm } from "@/lib/avisos/validation";
import { formString } from "@/lib/superadmin/validation";

export const dynamic = "force-dynamic";

const LISTADO_PATH = "/panel/avisos";

/*
 * `methodNotAllowed` y `redirectTo` son una copia acotada de
 * `src/app/api/panel/avisos/route.ts` (patrón de avisos: cada ruta lleva la
 * suya).
 */
function methodNotAllowed() {
  return new NextResponse(null, {
    status: 405,
    headers: { Allow: "POST" },
  });
}

function redirectTo(request: NextRequest, path: string, params: Record<string, string>) {
  const url = new URL(path, request.url);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url, 303);
}

export function GET() {
  return methodNotAllowed();
}

/**
 * Cancela un aviso `NUEVO` o `PENDIENTE` con motivo obligatorio y casilla de
 * confirmación. Usa el permiso `avisos.validar` (la matriz no tiene uno
 * propio para cancelar). `empresaId` y el autor salen de la sesión.
 *
 * - Éxito → 303 a `/panel/avisos/<id>?ok=cancelado`.
 * - `motivo`, `confirmacion` o `estado` con un aviso de la empresa → detalle
 *   con `?error=<código>`.
 * - Aviso vacío, no UUID, inexistente o ajeno → `/panel/avisos?error=no-encontrado`
 *   (aunque además falten el motivo o la confirmación).
 * - Fallo inesperado → `?error=servicio` en el detalle si el aviso es de la
 *   empresa; si no, en el listado.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return new NextResponse("Origen no permitido.", { status: 403 });
  }

  const authorization = await authorizeCompanyRequest(request, "avisos.validar", LISTADO_PATH);

  if (!authorization.ok) {
    return authorization.response;
  }

  const session = authorization.session;
  // `can()` garantiza que la sesión tiene empresa.
  const empresaId = session.empresa!.id;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new NextResponse("Solicitud inválida.", { status: 400 });
  }

  const db = getDb();

  try {
    const parsed = parseCancelacionForm(formData);

    if (!parsed.ok) {
      // Un error de formulario solo vuelve al detalle si el aviso es de la
      // empresa; si no, el listado responde lo mismo que un aviso ajeno.
      const avisoId =
        parsed.error === "no-encontrado"
          ? null
          : await findAvisoId(db, empresaId, formString(formData, "avisoId"));

      if (!avisoId) {
        return redirectTo(request, LISTADO_PATH, { error: "no-encontrado" });
      }

      return redirectTo(request, `${LISTADO_PATH}/${avisoId}`, { error: parsed.error });
    }

    const result = await cancelarAviso(db, empresaId, session.id, parsed.value);

    if (!result.ok) {
      if (result.error === "no-encontrado") {
        return redirectTo(request, LISTADO_PATH, { error: "no-encontrado" });
      }

      return redirectTo(request, `${LISTADO_PATH}/${result.avisoId}`, { error: result.error });
    }

    return redirectTo(request, `${LISTADO_PATH}/${result.avisoId}`, { ok: "cancelado" });
  } catch {
    try {
      const avisoId = await findAvisoId(db, empresaId, formString(formData, "avisoId"));

      if (avisoId) {
        return redirectTo(request, `${LISTADO_PATH}/${avisoId}`, { error: "servicio" });
      }
    } catch {
      // Sin base de datos: se vuelve al listado.
    }

    return redirectTo(request, LISTADO_PATH, { error: "servicio" });
  }
}
