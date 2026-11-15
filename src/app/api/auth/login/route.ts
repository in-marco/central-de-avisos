import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { isSameOrigin, isSecureRequest } from "@/lib/auth/origin";
import { safeNextPath } from "@/lib/auth/redirect";
import {
  clearLoginAttemptsOnSuccess,
  loginRateLimitWindowSeconds,
  rateLimitKeys,
  registerLoginAttempt,
} from "@/lib/auth/rate-limit";
import { authenticateCredentials } from "@/lib/auth/session";
import {
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from "@/lib/auth/session-token";

export const dynamic = "force-dynamic";

export function GET() {
  return new NextResponse(null, {
    status: 405,
    headers: { Allow: "POST" },
  });
}

function loginErrorRedirect(
  request: NextRequest,
  error: "credenciales" | "servicio" | "bloqueado",
  next: string,
) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", error);
  url.searchParams.set("next", safeNextPath(next));
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

  const email = formData.get("email");
  const password = formData.get("password");
  const next = safeNextPath(formData.get("next"));

  // Límite durable de intentos antes de verificar la contraseña (también con
  // email ausente o vacío). Si el limitador falla, el login falla cerrado.
  const keys = rateLimitKeys(email, request.headers);
  try {
    const attempt = await registerLoginAttempt(
      getDb(),
      keys,
      loginRateLimitWindowSeconds(),
    );

    if (attempt.bloqueado) {
      // Sin scrypt ni cookie; mismo mensaje exista o no el email.
      return loginErrorRedirect(request, "bloqueado", next);
    }
  } catch {
    return loginErrorRedirect(request, "servicio", next);
  }

  if (typeof email !== "string" || typeof password !== "string") {
    return loginErrorRedirect(request, "credenciales", next);
  }

  let result;
  try {
    result = await authenticateCredentials({
      db: getDb(),
      email,
      password,
    });
  } catch {
    return loginErrorRedirect(request, "servicio", next);
  }

  if (!result.ok) {
    // Mensaje genérico: no revela si el email existe, si falta contraseña o si
    // el usuario/empresa está bloqueado.
    return loginErrorRedirect(request, "credenciales", next);
  }

  try {
    await clearLoginAttemptsOnSuccess(getDb(), keys);
  } catch {
    // La sesión ya es válida: un fallo al limpiar el contador no la invalida.
  }

  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: result.token,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
    secure: isSecureRequest(request),
  });

  return response;
}
