import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { isUuid } from "@/lib/superadmin/validation";
import { clienteFilter, type ClienteScope } from "./scope";

/**
 * Lecturas del portal de cliente (solo lectura). Toda consulta se filtra con
 * `clienteFilter(scope)`: empresa y cliente de la sesión, nunca ids de la
 * petición. No se exponen tarifas ni datos de otros clientes.
 */

export type PortalDb = PrismaClient | Prisma.TransactionClient;

export async function getPortalCliente(db: PortalDb, scope: ClienteScope) {
  const filter = clienteFilter(scope);

  const cliente = await db.cliente.findFirst({
    where: { id: filter.clienteId, empresaId: filter.empresaId },
    select: {
      id: true,
      razonSocial: true,
      nif: true,
      direccionFacturacion: true,
    },
  });

  if (!cliente) {
    return null;
  }

  const sedes = await db.sede.findMany({
    where: filter,
    select: { id: true, nombre: true, direccion: true },
    orderBy: [{ nombre: "asc" }, { creadoEn: "asc" }],
  });

  return { ...cliente, sedes };
}

export type PortalCliente = NonNullable<Awaited<ReturnType<typeof getPortalCliente>>>;

/**
 * Sede del cliente de la sesión. `null` si el id no es un UUID, no existe, es
 * de otro cliente de la misma empresa o de otra empresa: la página responde
 * con el mismo 403 genérico en todos los casos.
 */
export async function getPortalSede(
  db: PortalDb,
  scope: ClienteScope,
  sedeId: string,
) {
  const filter = clienteFilter(scope);

  if (typeof sedeId !== "string" || !isUuid(sedeId)) {
    return null;
  }

  return db.sede.findFirst({
    where: { id: sedeId.trim().toLowerCase(), ...filter },
    select: { id: true, nombre: true, direccion: true },
  });
}
