import type { NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { updateCliente } from "@/lib/clientes/clientes";
import { parseClienteForm } from "@/lib/clientes/validation";
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

/** Edita los datos de facturación (razón social, NIF, dirección y tarifa). */
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

    const parsed = parseClienteForm(context.formData);

    if (!parsed.ok) {
      return redirectTo(request, clientePath(clienteId), "error", parsed.error);
    }

    const result = await updateCliente(getDb(), context.empresaId, clienteId, parsed.value);

    if (!result.ok) {
      return redirectForWriteError(request, clienteId, result.error);
    }

    return redirectTo(request, clientePath(clienteId), "ok", "datos");
  } catch {
    return redirectTo(request, CLIENTES_PATH, "error", "servicio");
  }
}
