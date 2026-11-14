import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { isSameOrigin } from "@/lib/auth/origin";
import { authorizeCompanyRequest } from "@/lib/authz/guards";
import { updateUserRoles } from "@/lib/empresa/usuarios";

export const dynamic = "force-dynamic";

const USUARIOS_PATH = "/panel/usuarios";

export function GET() {
  return new NextResponse(null, {
    status: 405,
    headers: { Allow: "POST" },
  });
}

function redirectWith(
  request: NextRequest,
  param: "ok" | "error",
  value: string,
) {
  const url = new URL(USUARIOS_PATH, request.url);
  url.searchParams.set(param, value);
  return NextResponse.redirect(url, 303);
}

/**
 * Cambia los roles de un usuario de la empresa del administrador. El
 * `empresaId` y el actor salen de la sesión; del formulario solo se leen
 * `usuarioId` y `roles`. No se registra ningún dato personal.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return new NextResponse("Origen no permitido.", { status: 403 });
  }

  const authorization = await authorizeCompanyRequest(
    request,
    "usuarios.gestionar",
    USUARIOS_PATH,
  );

  if (!authorization.ok) {
    return authorization.response;
  }

  const { session } = authorization;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new NextResponse("Solicitud inválida.", { status: 400 });
  }

  const usuarioIdValue = formData.get("usuarioId");
  const usuarioId = typeof usuarioIdValue === "string" ? usuarioIdValue.trim() : "";
  const roles = formData.getAll("roles");

  try {
    const result = await updateUserRoles(getDb(), {
      // `can()` garantiza que la sesión tiene empresa.
      empresaId: session.empresa!.id,
      actorId: session.id,
      usuarioId,
      roles,
    });

    if (!result.ok) {
      return redirectWith(request, "error", result.error);
    }
  } catch {
    return redirectWith(request, "error", "servicio");
  }

  return redirectWith(request, "ok", "roles");
}
