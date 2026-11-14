import type { NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { upsertContacto } from "@/lib/clientes/clientes";
import { parseContactoForm } from "@/lib/clientes/validation";
import { formString } from "@/lib/superadmin/validation";
import {
  CLIENTES_PATH,
  clientePath,
  methodNotAllowed,
  openClientesRequest,
  redirectForWriteError,
  redirectTo,
  resolveClienteId,
} from "../_shared/respond";

export const dynamic = "force-dynamic";

export function GET() {
  return methodNotAllowed();
}

/**
 * Crea un contacto (sin `contactoId`) o edita uno del mismo cliente (con
 * `contactoId`). `sedeId` vacío = todo el cliente; si llega, debe ser una
 * sede de ese cliente.
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

    const parsed = parseContactoForm(context.formData);

    if (!parsed.ok) {
      return redirectTo(request, clientePath(clienteId), "error", parsed.error);
    }

    const result = await upsertContacto(getDb(), context.empresaId, {
      clienteId,
      contactoId: formString(context.formData, "contactoId"),
      values: parsed.value,
    });

    if (!result.ok) {
      return redirectForWriteError(request, clienteId, result.error);
    }

    return redirectTo(
      request,
      clientePath(clienteId),
      "ok",
      result.creado ? "contacto-creado" : "contacto",
    );
  } catch {
    return redirectTo(request, CLIENTES_PATH, "error", "servicio");
  }
}
