import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { createSession, type AuthDb } from "@/lib/auth/session";
import { hashInvitationToken } from "@/lib/superadmin/invitations";

/**
 * Activación del administrador invitado.
 *
 * La búsqueda por `token_hash` es una excepción de identidad acotada, igual que
 * la de sesión: no lleva `tenantFilter` porque el token identifica una única
 * fila y nunca se listan invitaciones. Nunca se registran token, email ni
 * contraseña.
 */

const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Los tokens se generan con 32 bytes en base64url (43 caracteres). */
export function isWellFormedInvitationToken(token: unknown): token is string {
  return typeof token === "string" && INVITATION_TOKEN_PATTERN.test(token);
}

export type InvitationRejection =
  | "NO_ENCONTRADA"
  | "ACEPTADA"
  | "CADUCADA"
  | "EMPRESA_INACTIVA";

export type ValidInvitation = {
  status: "VALIDA";
  invitacionId: string;
  expiraEn: Date;
  empresa: { id: string; nombre: string };
  usuario: { id: string; nombre: string; email: string };
};

export type InvitationLookup = ValidInvitation | { status: InvitationRejection };

type InvitationWithRelations = {
  id: string;
  tipo: string;
  expiraEn: Date;
  aceptadaEn: Date | null;
  empresa: { id: string; nombre: string; estado: string };
  usuario: {
    id: string;
    nombre: string;
    email: string;
    estado: string;
    passwordHash: string | null;
    esSuperadmin: boolean;
    empresaId: string | null;
  };
};

/**
 * Clasifica una invitación cargada. El orden importa: una invitación aceptada
 * se informa como usada aunque además haya caducado.
 */
export function classifyInvitation(
  invitation: InvitationWithRelations | null,
  now: Date = new Date(),
): InvitationLookup {
  if (!invitation || invitation.tipo !== "ADMINISTRADOR_EMPRESA") {
    return { status: "NO_ENCONTRADA" };
  }

  const usuario = invitation.usuario;

  // Coherencia defensiva: el invitado pertenece a la empresa de la invitación
  // y nunca es superadmin.
  if (usuario.esSuperadmin || usuario.empresaId !== invitation.empresa.id) {
    return { status: "NO_ENCONTRADA" };
  }

  if (
    invitation.aceptadaEn !== null ||
    usuario.passwordHash !== null ||
    usuario.estado !== "INACTIVO"
  ) {
    return { status: "ACEPTADA" };
  }

  if (invitation.expiraEn.getTime() <= now.getTime()) {
    return { status: "CADUCADA" };
  }

  if (invitation.empresa.estado !== "ACTIVA") {
    return { status: "EMPRESA_INACTIVA" };
  }

  return {
    status: "VALIDA",
    invitacionId: invitation.id,
    expiraEn: invitation.expiraEn,
    empresa: { id: invitation.empresa.id, nombre: invitation.empresa.nombre },
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
    },
  };
}

function loadInvitation(db: AuthDb, token: string) {
  return db.invitacion.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    include: { empresa: true, usuario: true },
  });
}

export async function findInvitationByToken(
  db: AuthDb,
  token: string,
  now: Date = new Date(),
): Promise<InvitationLookup> {
  if (!isWellFormedInvitationToken(token)) {
    return { status: "NO_ENCONTRADA" };
  }

  return classifyInvitation(await loadInvitation(db, token), now);
}

export type AcceptInvitationResult =
  | {
      ok: true;
      usuarioId: string;
      empresaId: string;
      sessionToken: string;
      sessionExpiraEn: Date;
    }
  | { ok: false; reason: InvitationRejection };

/** Señal interna para revertir la transacción si el usuario cambió entre medias. */
class InvitationConflictError extends Error {}

/**
 * Cuerpo transaccional de la aceptación. Se exporta para probarlo dentro de una
 * transacción con rollback. El hash de la contraseña llega ya calculado para
 * no mantener filas bloqueadas durante scrypt.
 *
 * La marca de aceptación es un `updateMany` condicionado: con dos peticiones
 * concurrentes, PostgreSQL serializa la actualización de la fila y la segunda
 * ve `aceptada_en` ya fijado, así que solo una gana.
 */
export async function acceptInvitationInTransaction(
  tx: Prisma.TransactionClient,
  {
    token,
    passwordHash,
    now = new Date(),
  }: { token: string; passwordHash: string; now?: Date },
): Promise<AcceptInvitationResult> {
  const lookup = await findInvitationByToken(tx, token, now);

  if (lookup.status !== "VALIDA") {
    return { ok: false, reason: lookup.status };
  }

  const marked = await tx.invitacion.updateMany({
    where: {
      id: lookup.invitacionId,
      aceptadaEn: null,
      expiraEn: { gt: now },
    },
    data: { aceptadaEn: now },
  });

  if (marked.count !== 1) {
    const current = await findInvitationByToken(tx, token, now);
    return {
      ok: false,
      reason: current.status === "VALIDA" ? "ACEPTADA" : current.status,
    };
  }

  const activated = await tx.usuario.updateMany({
    where: {
      id: lookup.usuario.id,
      empresaId: lookup.empresa.id,
      estado: "INACTIVO",
      passwordHash: null,
    },
    data: { passwordHash, estado: "ACTIVO" },
  });

  if (activated.count !== 1) {
    throw new InvitationConflictError();
  }

  const session = await createSession(tx, {
    usuarioId: lookup.usuario.id,
    now,
  });

  return {
    ok: true,
    usuarioId: lookup.usuario.id,
    empresaId: lookup.empresa.id,
    sessionToken: session.token,
    sessionExpiraEn: session.expiraEn,
  };
}

/**
 * Acepta la invitación: marca `aceptada_en`, guarda la contraseña, activa al
 * usuario y crea su sesión en una única transacción. La contraseña debe venir
 * ya validada con `validateNewPassword`.
 */
export async function acceptInvitation(
  db: PrismaClient,
  {
    token,
    password,
    now = new Date(),
  }: { token: string; password: string; now?: Date },
): Promise<AcceptInvitationResult> {
  // Comprobación previa barata: no se calcula scrypt para enlaces que no
  // pueden aceptarse. La transacción vuelve a validar todo.
  const precheck = await findInvitationByToken(db, token, now);

  if (precheck.status !== "VALIDA") {
    return { ok: false, reason: precheck.status };
  }

  const passwordHash = await hashPassword(password);

  try {
    return await db.$transaction((tx) =>
      acceptInvitationInTransaction(tx, { token, passwordHash, now }),
    );
  } catch (error) {
    if (error instanceof InvitationConflictError) {
      return { ok: false, reason: "ACEPTADA" };
    }

    throw error;
  }
}
