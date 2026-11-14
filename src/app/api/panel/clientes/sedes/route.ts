import type { NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { upsertSede } from "@/lib/clientes/clientes";
import { parseSedeForm } from "@/lib/clientes/validation";
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

/** Crea una sede (sin `sedeId`) o edita una del mismo cliente (con `sedeId`). */
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

    const parsed = parseSedeForm(context.formData);

    if (!parsed.ok) {
      return redirectTo(request, clientePath(clienteId), "error", parsed.error);
    }

    const result = await upsertSede(getDb(), context.empresaId, {
      clienteId,
      sedeId: formString(context.formData, "sedeId"),
      values: parsed.value,
    });

    if (!result.ok) {
      return redirectForWriteError(request, clienteId, result.error);
    }

    return redirectTo(
      request,
      clientePath(clienteId),
      "ok",
      result.creada ? "sede-creada" : "sede",
    );
  } catch {
    return redirectTo(request, CLIENTES_PATH, "error", "servicio");
  }
}
