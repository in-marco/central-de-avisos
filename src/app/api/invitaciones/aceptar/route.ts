import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { isSameOrigin, isSecureRequest } from "@/lib/auth/origin";
import { validateNewPassword } from "@/lib/auth/password";
import { revokeSessionByToken } from "@/lib/auth/session";
import {
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from "@/lib/auth/session-token";
import {
  acceptInvitation,
  isWellFormedInvitationToken,
} from "@/lib/onboarding/invitation-acceptance";
import { invitationPath } from "@/lib/superadmin/invitations";

export const dynamic = "force-dynamic";

export function GET() {
  return new NextResponse(null, {
    status: 405,
    headers: { Allow: "POST" },
  });
}

/**
 * Vuelve a la página de la invitación. Es la misma URL que el usuario ya tiene
 * abierta: el token no se añade a ninguna URL nueva.
 */
function backToInvitation(request: NextRequest, token: string, error?: string) {
  const url = new URL(invitationPath(token), request.url);
  if (error) {
    url.searchParams.set("error", error);
  }
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return new NextResponse("Origen no permitido.", { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new NextResponse("Solicitud inválida.", { status: 400 });
  }

  const token = formData.get("token");

  if (!isWellFormedInvitationToken(token)) {
    // No se refleja un valor no válido en ninguna URL.
    return NextResponse.redirect(
      new URL("/invitacion/invalida", request.url),
      303,
    );
  }

  const password = formData.get("password");
  const confirmation = formData.get("passwordConfirm");

  if (typeof password !== "string" || typeof confirmation !== "string") {
    return backToInvitation(request, token, "corta");
  }

  const policy = validateNewPassword(password, confirmation);

  if (!policy.ok) {
    return backToInvitation(request, token, policy.error);
  }

  const db = getDb();
  let result;
  try {
    result = await acceptInvitation(db, { token, password });
  } catch {
    return backToInvitation(request, token, "servicio");
  }

  if (!result.ok) {
    // La página de la invitación muestra el motivo (usada, caducada, empresa
    // no activa o enlace no válido).
    return backToInvitation(request, token);
  }

  // Si el navegador tenía otra sesión abierta, se revoca: la nueva cuenta la
  // sustituye. Un fallo aquí no impide completar la activación.
  const previousToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (previousToken) {
    try {
      await revokeSessionByToken(db, previousToken);
    } catch {
      // Se ignora: la cookie se sobrescribe igualmente.
    }
  }

  // Destino por tipo de invitación: `/panel` (administrador) o `/portal`
  // (contacto de cliente). Es un valor fijo del servidor, nunca de la petición.
  const response = NextResponse.redirect(
    new URL(result.destino, request.url),
    303,
  );
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: result.sessionToken,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
    secure: isSecureRequest(request),
  });

  return response;
}
