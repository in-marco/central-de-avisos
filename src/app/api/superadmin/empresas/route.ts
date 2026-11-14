import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { isSameOrigin, isSecureRequest } from "@/lib/auth/origin";
import { authorizeSuperadminRequest } from "@/lib/superadmin/authorization";
import { createCompanyWithInvitation } from "@/lib/superadmin/companies";
import {
  INVITATION_FLASH_COOKIE_NAME,
  INVITATION_FLASH_COOKIE_PATH,
  INVITATION_FLASH_MAX_AGE_SECONDS,
} from "@/lib/superadmin/invitations";
import {
  parseCompanyForm,
  type SuperadminErrorCode,
} from "@/lib/superadmin/validation";

export const dynamic = "force-dynamic";

export function GET() {
  return new NextResponse(null, {
    status: 405,
    headers: { Allow: "POST" },
  });
}

function errorRedirect(request: NextRequest, error: string) {
  const url = new URL("/superadmin/empresas/nueva", request.url);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return new NextResponse("Origen no permitido.", { status: 403 });
  }

  const authorization = await authorizeSuperadminRequest(request);

  if (!authorization.ok) {
    return authorization.response;
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new NextResponse("Solicitud inválida.", { status: 400 });
  }

  const parsed = parseCompanyForm(formData);

  if (!parsed.ok) {
    return errorRedirect(request, parsed.error);
  }

  try {
    const result = await createCompanyWithInvitation(getDb(), parsed.value);

    if (!result.ok) {
      return errorRedirect(request, result.error);
    }

    const response = NextResponse.redirect(
      new URL(`/superadmin/empresas/${result.empresaId}`, request.url),
      303,
    );

    response.cookies.set({
      name: INVITATION_FLASH_COOKIE_NAME,
      value: result.token,
      httpOnly: true,
      sameSite: "strict",
      path: INVITATION_FLASH_COOKIE_PATH,
      maxAge: INVITATION_FLASH_MAX_AGE_SECONDS,
      secure: isSecureRequest(request),
    });

    return response;
  } catch {
    return errorRedirect(
      request,
      "servicio" satisfies SuperadminErrorCode,
    );
  }
}
