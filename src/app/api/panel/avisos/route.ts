import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { isSameOrigin } from "@/lib/auth/origin";
import { authorizeCompanyRequest } from "@/lib/authz/guards";
import { createAviso, findClienteIdParaAviso } from "@/lib/avisos/avisos";
import { parseNuevoAvisoForm } from "@/lib/avisos/validation";
import { formString } from "@/lib/superadmin/validation";

export const dynamic = "force-dynamic";

const NUEVO_PATH = "/panel/avisos/nuevo";

/*
 * `methodNotAllowed` y `redirectTo` son una copia acotada de
 * `src/app/api/panel/clientes/_shared/respond.ts`: los avisos no importan los
 * route handlers de clientes.
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
 * Alta de aviso de oficina. `empresaId` y el creador salen de la sesión;
 * `origen` (OFICINA) y `estado` (NUEVO) los fija el repositorio. Cliente,
 * sede y contacto se resuelven siempre con `tenantFilter`.
 *
 * - Éxito → 303 a `/panel/avisos/<id>?ok=creado`.
 * - Error con un cliente de la empresa → paso 2 con `clienteId` y `error`.
 * - Cliente vacío, no UUID, inexistente o ajeno → paso 1 con `no-encontrado`.
 * - Fallo inesperado → `?error=servicio` (sin registrar datos personales).
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return new NextResponse("Origen no permitido.", { status: 403 });
  }

  const authorization = await authorizeCompanyRequest(request, "avisos.crear", NUEVO_PATH);

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

  try {
    const db = getDb();
    const backToForm = async (error: string) => {
      const clienteId = await findClienteIdParaAviso(
        db,
        empresaId,
        formString(formData, "clienteId"),
      );

      if (!clienteId || error === "no-encontrado") {
        return redirectTo(request, NUEVO_PATH, { error: "no-encontrado" });
      }

      return redirectTo(request, NUEVO_PATH, { clienteId, error });
    };

    const parsed = parseNuevoAvisoForm(formData);

    if (!parsed.ok) {
      return await backToForm(parsed.error);
    }

    const result = await createAviso(db, empresaId, session.id, parsed.value);

    if (!result.ok) {
      return await backToForm(result.error);
    }

    return redirectTo(request, `/panel/avisos/${result.avisoId}`, { ok: "creado" });
  } catch {
    return redirectTo(request, NUEVO_PATH, { error: "servicio" });
  }
}
