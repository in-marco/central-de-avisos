import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { isSameOrigin } from "@/lib/auth/origin";
import { authorizeCompanyRequest } from "@/lib/authz/guards";
import { updateCompanyBillingSettings } from "@/lib/empresa/configuracion";
import { parseBillingSettingsForm } from "@/lib/empresa/configuracion-validation";

export const dynamic = "force-dynamic";

const EMPRESA_PATH = "/panel/empresa";

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
  const url = new URL(EMPRESA_PATH, request.url);
  url.searchParams.set(param, value);
  return NextResponse.redirect(url, 303);
}

/**
 * Guarda la configuración fiscal y de facturación de la empresa del
 * administrador. El `empresaId` sale solo de la sesión: cualquier `empresaId`
 * o `id` del formulario se ignora. No se registra ningún dato del formulario.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return new NextResponse("Origen no permitido.", { status: 403 });
  }

  const authorization = await authorizeCompanyRequest(
    request,
    "empresa.configurar",
    EMPRESA_PATH,
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

  const parsed = parseBillingSettingsForm(formData);

  if (!parsed.ok) {
    return redirectWith(request, "error", parsed.error);
  }

  try {
    // `can()` garantiza que la sesión tiene empresa.
    const result = await updateCompanyBillingSettings(
      getDb(),
      session.empresa!.id,
      parsed.value,
    );

    if (!result.ok) {
      return redirectWith(request, "error", result.error);
    }
  } catch {
    return redirectWith(request, "error", "servicio");
  }

  return redirectWith(request, "ok", "guardado");
}
