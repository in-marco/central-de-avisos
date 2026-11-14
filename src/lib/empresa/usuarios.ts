import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { tenantFilter } from "@/db/tenant";
import { normalizeRoles, type Rol } from "@/lib/authz/permissions";
import { isUuid } from "@/lib/superadmin/validation";

/**
 * Gestión de usuarios de una empresa (vista del administrador). Toda consulta
 * usa `tenantFilter(empresaId)` y excluye al superadmin. El `empresaId` sale
 * siempre de la sesión, nunca de la petición.
 */

export type EmpresaDb = PrismaClient | Prisma.TransactionClient;

export type CompanyUser = {
  id: string;
  nombre: string;
  email: string;
  estado: "ACTIVO" | "INACTIVO";
  roles: Rol[];
};

export function listCompanyUsers(
  db: EmpresaDb,
  empresaId: string,
): Promise<CompanyUser[]> {
  return db.usuario.findMany({
    where: { ...tenantFilter(empresaId), esSuperadmin: false },
    select: { id: true, nombre: true, email: true, estado: true, roles: true },
    orderBy: [{ nombre: "asc" }, { email: "asc" }],
  });
}

export type UpdateRolesErrorCode =
  | "sin-roles"
  | "rol-invalido"
  | "propio-admin"
  | "no-encontrado"
  | "ultimo-admin";

export type UpdateRolesResult =
  | { ok: true; roles: Rol[] }
  | { ok: false; error: UpdateRolesErrorCode };

export type UpdateRolesInput = {
  empresaId: string;
  actorId: string;
  usuarioId: string;
  roles: readonly unknown[];
};

/** Se lanza dentro de la transacción para revertir el cambio de roles. */
export class LastAdminError extends Error {
  constructor() {
    super("La empresa se quedaría sin administradores activos.");
    this.name = "LastAdminError";
  }
}

/**
 * Cuerpo transaccional del cambio de roles. Se exporta para probarlo con
 * `inRollback`. Si el cambio dejaría a la empresa sin ningún administrador
 * `ACTIVO`, lanza `LastAdminError` para que la transacción se revierta.
 *
 * La fila de la empresa se bloquea con `FOR UPDATE` para serializar los
 * cambios de roles concurrentes de una misma empresa: así el recuento final de
 * administradores ve los cambios ya confirmados por la otra transacción.
 */
export async function updateUserRolesInTransaction(
  tx: Prisma.TransactionClient,
  { empresaId, actorId, usuarioId, roles }: UpdateRolesInput,
): Promise<UpdateRolesResult> {
  const filter = tenantFilter(empresaId);

  if (roles.length === 0) {
    return { ok: false, error: "sin-roles" };
  }

  const normalized = normalizeRoles(roles);

  if (!normalized.ok) {
    return { ok: false, error: normalized.error };
  }

  if (normalized.roles.length === 0) {
    return { ok: false, error: "sin-roles" };
  }

  if (!isUuid(usuarioId)) {
    return { ok: false, error: "no-encontrado" };
  }

  await tx.$queryRaw`SELECT id FROM empresas WHERE id = ${filter.empresaId}::uuid FOR UPDATE`;

  const usuario = await tx.usuario.findFirst({
    where: { id: usuarioId.toLowerCase(), ...filter, esSuperadmin: false },
    select: { id: true },
  });

  if (!usuario) {
    return { ok: false, error: "no-encontrado" };
  }

  if (usuario.id === actorId && !normalized.roles.includes("ADMINISTRADOR")) {
    return { ok: false, error: "propio-admin" };
  }

  await tx.usuario.update({
    where: { id: usuario.id },
    data: { roles: normalized.roles },
  });

  const activeAdmins = await tx.usuario.count({
    where: {
      ...filter,
      esSuperadmin: false,
      estado: "ACTIVO",
      roles: { has: "ADMINISTRADOR" },
    },
  });

  if (activeAdmins === 0) {
    throw new LastAdminError();
  }

  return { ok: true, roles: normalized.roles };
}

/** Cambia los roles de un usuario de la empresa en una transacción. */
export async function updateUserRoles(
  db: PrismaClient,
  input: UpdateRolesInput,
): Promise<UpdateRolesResult> {
  try {
    return await db.$transaction((tx) => updateUserRolesInTransaction(tx, input));
  } catch (error) {
    if (error instanceof LastAdminError) {
      return { ok: false, error: "ultimo-admin" };
    }

    throw error;
  }
}
