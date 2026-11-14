import type { NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { createCliente } from "@/lib/clientes/clientes";
import { parseNuevoClienteForm } from "@/lib/clientes/validation";
import {
  clientePath,
  methodNotAllowed,
  openClientesRequest,
  redirectTo,
} from "./_shared/respond";

export const dynamic = "force-dynamic";

const NUEVO_PATH = "/panel/clientes/nuevo";

export function GET() {
  return methodNotAllowed();
}

/**
 * Alta de cliente con su primera sede y su primer contacto, en una sola
 * transacción. El `empresaId` sale de la sesión.
 */
export async function POST(request: NextRequest) {
  const context = await openClientesRequest(request, NUEVO_PATH);

  if (!context.ok) {
    return context.response;
  }

  const parsed = parseNuevoClienteForm(context.formData);

  if (!parsed.ok) {
    return redirectTo(request, NUEVO_PATH, "error", parsed.error);
  }

  try {
    const result = await createCliente(getDb(), context.empresaId, parsed.value);

    if (!result.ok) {
      return redirectTo(request, NUEVO_PATH, "error", result.error);
    }

    return redirectTo(request, clientePath(result.clienteId), "ok", "creado");
  } catch {
    return redirectTo(request, NUEVO_PATH, "error", "servicio");
  }
}
