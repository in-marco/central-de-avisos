import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { tenantFilter } from "@/db/tenant";
import { isWellFormedInvitationToken } from "@/lib/onboarding/invitation-acceptance";
import {
  isUniqueViolation,
  uniqueViolationTarget,
} from "@/lib/superadmin/db-errors";
import {
  createInvitationToken,
  hashInvitationToken,
  INVITATION_DURATION_MS,
} from "@/lib/superadmin/invitations";
import { isUuid } from "@/lib/superadmin/validation";

/**
 * Invitaciones al portal de cliente (vista de oficina, `clientes.gestionar`).
 *
 * Toda consulta usa `tenantFilter(empresaId)` y el `clienteId` resuelto dentro
 * de esa empresa; el `empresaId` sale siempre de la sesión. Un contacto de
 * otra empresa, de otro cliente, inexistente o con id mal formado se trata
 * igual: `no-encontrado`.
 *
 * El usuario de cliente se crea `INACTIVO`, sin contraseña ni roles, ligado a
 * `cliente_id` y `contacto_id`. La invitación guarda solo el SHA-256 del
 * token; el token crudo se devuelve una vez para la cookie flash.
 *
 * Las invitaciones de contacto se leen aquí filtradas por empresa y cliente
 * (estado del acceso y enlace flash); no es un listado de proveedor.
 */

export const PORTAL_INVITATION_FLASH_COOKIE_NAME = "central_invitacion_portal";
export const PORTAL_INVITATION_FLASH_COOKIE_PATH = "/panel/clientes";

export type PortalDb = PrismaClient | Prisma.TransactionClient;

export type PortalInvitationError =
  | "no-encontrado"
  | "contacto-sin-email"
  | "email-en-uso"
  | "ya-activo";

export type InvitePortalContactResult =
  | {
      ok: true;
      /** `false` si el usuario ya existía y se ha generado un enlace nuevo. */
      nuevoUsuario: boolean;
      usuarioId: string;
      invitacionId: string;
      token: string;
      expiraEn: Date;
    }
  | { ok: false; error: PortalInvitationError };

export type InvitePortalContactInput = {
  empresaId: string;
  clienteId: string;
  contactoId: string;
  now?: Date;
  invitationDurationMs?: number;
};

function normalizeId(value: unknown): string | null {
  if (typeof value !== "string" || !isUuid(value)) {
    return null;
  }

  return value.trim().toLowerCase();
}

/**
 * Cuerpo transaccional de la invitación. Se exporta para probarlo con
 * `inRollback`.
 *
 * - Contacto sin acceso: crea el usuario de cliente y la invitación.
 * - Contacto con usuario `INACTIVO` (invitación pendiente o caducada): marca
 *   como caducadas las pendientes anteriores (`expira_en = now`) y crea una
 *   invitación nueva («Generar nuevo enlace»).
 * - Contacto con usuario `ACTIVO`: `ya-activo`.
 */
export async function invitePortalContactInTransaction(
  tx: Prisma.TransactionClient,
  {
    empresaId,
    clienteId,
    contactoId,
    now = new Date(),
    invitationDurationMs = INVITATION_DURATION_MS,
  }: InvitePortalContactInput,
): Promise<InvitePortalContactResult> {
  const filter = tenantFilter(empresaId);
  const cliente = normalizeId(clienteId);
  const contactoIdNormalizado = normalizeId(contactoId);

  if (!cliente || !contactoIdNormalizado) {
    return { ok: false, error: "no-encontrado" };
  }

  // El contacto debe ser de ese cliente y de la empresa de la sesión. El FK
  // compuesto de contactos garantiza que el cliente es de la misma empresa.
  const contacto = await tx.contacto.findFirst({
    where: { id: contactoIdNormalizado, clienteId: cliente, ...filter },
    select: {
      id: true,
      nombre: true,
      email: true,
      usuario: {
        select: { id: true, estado: true, empresaId: true, clienteId: true },
      },
    },
  });

  if (!contacto) {
    return { ok: false, error: "no-encontrado" };
  }

  if (!contacto.email) {
    return { ok: false, error: "contacto-sin-email" };
  }

  const token = createInvitationToken();
  const expiraEn = new Date(now.getTime() + invitationDurationMs);

  if (contacto.usuario) {
    const existente = contacto.usuario;

    // Defensa: el acceso del contacto pertenece a ese cliente y empresa.
    if (existente.empresaId !== filter.empresaId || existente.clienteId !== cliente) {
      return { ok: false, error: "no-encontrado" };
    }

    // Serializa los «nuevo enlace» concurrentes del mismo usuario.
    const bloqueado = await tx.$queryRaw<{ estado: string }[]>`
      SELECT estado::text AS estado FROM usuarios
      WHERE id = ${existente.id}::uuid AND empresa_id = ${filter.empresaId}::uuid
      FOR UPDATE`;

    if (bloqueado.length !== 1) {
      return { ok: false, error: "no-encontrado" };
    }

    if (bloqueado[0].estado !== "INACTIVO") {
      return { ok: false, error: "ya-activo" };
    }

    // `creado_en < now` respeta el CHECK invitaciones_expiracion_posterior.
    await tx.invitacion.updateMany({
      where: {
        ...filter,
        usuarioId: existente.id,
        tipo: "CONTACTO_CLIENTE",
        aceptadaEn: null,
        expiraEn: { gt: now },
        creadaEn: { lt: now },
      },
      data: { expiraEn: now },
    });

    const invitacion = await tx.invitacion.create({
      data: {
        ...filter,
        usuarioId: existente.id,
        tipo: "CONTACTO_CLIENTE",
        tokenHash: hashInvitationToken(token),
        creadaEn: now,
        expiraEn,
      },
      select: { id: true },
    });

    return {
      ok: true,
      nuevoUsuario: false,
      usuarioId: existente.id,
      invitacionId: invitacion.id,
      token,
      expiraEn,
    };
  }

  // El email es único global: puede estar en uso por cualquier usuario.
  const emailEnUso = await tx.usuario.findUnique({
    where: { email: contacto.email },
    select: { id: true },
  });

  if (emailEnUso) {
    return { ok: false, error: "email-en-uso" };
  }

  const usuario = await tx.usuario.create({
    data: {
      ...filter,
      clienteId: cliente,
      contactoId: contacto.id,
      email: contacto.email,
      nombre: contacto.nombre,
      passwordHash: null,
      estado: "INACTIVO",
      esSuperadmin: false,
      roles: [],
    },
    select: { id: true },
  });

  const invitacion = await tx.invitacion.create({
    data: {
      ...filter,
      usuarioId: usuario.id,
      tipo: "CONTACTO_CLIENTE",
      tokenHash: hashInvitationToken(token),
      creadaEn: now,
      expiraEn,
    },
    select: { id: true },
  });

  return {
    ok: true,
    nuevoUsuario: true,
    usuarioId: usuario.id,
    invitacionId: invitacion.id,
    token,
    expiraEn,
  };
}

/**
 * Invita al portal a un contacto (o genera un enlace nuevo) en una única
 * transacción. Una carrera con el mismo email o el mismo contacto la resuelve
 * el índice único.
 */
export async function invitePortalContact(
  db: PrismaClient,
  input: InvitePortalContactInput,
): Promise<InvitePortalContactResult> {
  try {
    return await db.$transaction((tx) =>
      invitePortalContactInTransaction(tx, input),
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      const target = uniqueViolationTarget(error).join(",");

      if (target.includes("contacto")) {
        return { ok: false, error: "ya-activo" };
      }

      return { ok: false, error: "email-en-uso" };
    }

    throw error;
  }
}

export type PortalAccessStatus =
  | { estado: "sin-acceso" }
  | { estado: "pendiente"; expiraEn: Date }
  | { estado: "caducada" }
  | { estado: "activo" };

/**
 * Estado del acceso al portal de cada contacto del cliente, indexado por
 * `contactoId`. Los contactos sin entrada están «sin acceso».
 */
export async function listPortalAccess(
  db: PortalDb,
  empresaId: string,
  clienteId: string,
  now: Date = new Date(),
): Promise<Map<string, PortalAccessStatus>> {
  const filter = tenantFilter(empresaId);
  const cliente = normalizeId(clienteId);
  const accesos = new Map<string, PortalAccessStatus>();

  if (!cliente) {
    return accesos;
  }

  const usuarios = await db.usuario.findMany({
    where: { ...filter, clienteId: cliente, contactoId: { not: null } },
    select: {
      contactoId: true,
      estado: true,
      invitaciones: {
        where: {
          ...filter,
          tipo: "CONTACTO_CLIENTE",
          aceptadaEn: null,
          expiraEn: { gt: now },
        },
        select: { expiraEn: true },
        orderBy: { expiraEn: "desc" },
        take: 1,
      },
    },
  });

  for (const usuario of usuarios) {
    if (!usuario.contactoId) {
      continue;
    }

    if (usuario.estado === "ACTIVO") {
      accesos.set(usuario.contactoId, { estado: "activo" });
    } else if (usuario.invitaciones[0]) {
      accesos.set(usuario.contactoId, {
        estado: "pendiente",
        expiraEn: usuario.invitaciones[0].expiraEn,
      });
    } else {
      accesos.set(usuario.contactoId, { estado: "caducada" });
    }
  }

  return accesos;
}

/**
 * Comprueba el token de la cookie flash: solo se muestra si corresponde a una
 * invitación de contacto pendiente de un usuario de ese cliente y empresa.
 * Devuelve el nombre del contacto o `null`.
 */
export async function findFlashPortalInvitation(
  db: PortalDb,
  empresaId: string,
  clienteId: string,
  token: string | undefined,
  now: Date = new Date(),
): Promise<{ contactoNombre: string } | null> {
  const filter = tenantFilter(empresaId);
  const cliente = normalizeId(clienteId);

  if (!cliente || !isWellFormedInvitationToken(token)) {
    return null;
  }

  const invitacion = await db.invitacion.findFirst({
    where: {
      ...filter,
      tokenHash: hashInvitationToken(token),
      tipo: "CONTACTO_CLIENTE",
      aceptadaEn: null,
      expiraEn: { gt: now },
      usuario: { ...filter, clienteId: cliente, estado: "INACTIVO" },
    },
    select: { usuario: { select: { nombre: true } } },
  });

  return invitacion ? { contactoNombre: invitacion.usuario.nombre } : null;
}
