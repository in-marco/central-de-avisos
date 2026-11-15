import type { NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { isSecureRequest } from "@/lib/auth/origin";
import {
  invitePortalContact,
  PORTAL_INVITATION_FLASH_COOKIE_NAME,
  PORTAL_INVITATION_FLASH_COOKIE_PATH,
} from "@/lib/portal/invitaciones";
import { INVITATION_FLASH_MAX_AGE_SECONDS } from "@/lib/superadmin/invitations";
import { formString } from "@/lib/superadmin/validation";
import {
  CLIENTES_PATH,
  clientePath,
  methodNotAllowed,
  openClientesRequest,
  redirectTo,
  resolveClienteId,
} from "../_shared/respond";

export const dynamic = "force-dynamic";

export function GET() {
  return methodNotAllowed();
}

/**
 * Invita al portal a un contacto con email del cliente (o genera un enlace
 * nuevo si su acceso sigue pendiente). El token crudo solo viaja en la cookie
 * flash `central_invitacion_portal` (HttpOnly, SameSite=Strict, 60 s, Path
 * `/panel/clientes`); nunca en la URL ni en logs.
 */
export async function POST(request: NextRequest) {
  const context = await openClientesRequest(request, CLIENTES_PATH);

  if (!context.ok) {
    return context.response;
  }

  try {
    const clienteId = await resolveClienteId(context.empresaId, context.formData);

    if (!clienteId) {
      return redirectTo(request, CLIENTES_PATH, "error", "no-encontrado");
    }

    const result = await invitePortalContact(getDb(), {
      empresaId: context.empresaId,
      clienteId,
      contactoId: formString(context.formData, "contactoId"),
    });

    if (!result.ok) {
      return redirectTo(request, clientePath(clienteId), "error", result.error);
    }

    const response = redirectTo(
      request,
      clientePath(clienteId),
      "ok",
      result.nuevoUsuario ? "invitado" : "nuevo-enlace",
    );

    response.cookies.set({
      name: PORTAL_INVITATION_FLASH_COOKIE_NAME,
      value: result.token,
      httpOnly: true,
      sameSite: "strict",
      path: PORTAL_INVITATION_FLASH_COOKIE_PATH,
      maxAge: INVITATION_FLASH_MAX_AGE_SECONDS,
      secure: isSecureRequest(request),
    });

    return response;
  } catch {
    return redirectTo(request, CLIENTES_PATH, "error", "servicio");
  }
}
