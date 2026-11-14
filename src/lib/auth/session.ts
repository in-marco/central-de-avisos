import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { normalizeRoles, type Rol } from "@/lib/authz/permissions";
import {
  DUMMY_PASSWORD_HASH,
  isEmailLengthValid,
  isPasswordLengthValid,
  normalizeEmail,
  verifyPassword,
} from "./password";
import {
  createSessionToken,
  hashSessionToken,
  SESSION_DURATION_MS,
} from "./session-token";

/**
 * El cliente Prisma se recibe explícitamente para que la autenticación se pueda
 * probar dentro de una transacción con rollback. No se importa `getDb()` aquí.
 */
export type AuthDb = PrismaClient | Prisma.TransactionClient;

export type AuthenticatedUser = {
  id: string;
  nombre: string;
  email: string;
  esSuperadmin: boolean;
  empresa: { id: string; nombre: string } | null;
  /**
   * Roles de empresa leídos de la base de datos en cada petición. El
   * superadmin siempre tiene `[]`.
   */
  roles: Rol[];
};

export type CurrentSession = AuthenticatedUser & {
  sesionId: string;
  expiraEn: Date;
};

export type AuthenticateResult =
  | {
      ok: true;
      token: string;
      expiraEn: Date;
      user: AuthenticatedUser;
    }
  | {
      ok: false;
      reason: "invalid";
    };

type CreateSessionInput = {
  usuarioId: string;
  now?: Date;
};

/**
 * Crea una sesión opaca. En la base de datos solo se persiste el SHA-256 del
 * token; el token crudo se devuelve para la cookie.
 */
export async function createSession(
  db: AuthDb,
  { usuarioId, now = new Date() }: CreateSessionInput,
): Promise<{ token: string; expiraEn: Date }> {
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiraEn = new Date(now.getTime() + SESSION_DURATION_MS);

  await db.sesion.create({
    data: {
      usuarioId,
      tokenHash,
      expiraEn,
    },
  });

  return { token, expiraEn };
}

function toAuthenticatedUser(usuario: {
  id: string;
  nombre: string;
  email: string;
  esSuperadmin: boolean;
  roles: readonly string[];
  empresa: { id: string; nombre: string } | null;
}): AuthenticatedUser {
  // Se revalida contra el enum de la aplicación y se fuerza `[]` al
  // superadmin: nunca se conceden permisos de empresa por un valor inesperado.
  const normalized = normalizeRoles(usuario.roles);

  return {
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    esSuperadmin: usuario.esSuperadmin,
    empresa: usuario.empresa
      ? { id: usuario.empresa.id, nombre: usuario.empresa.nombre }
      : null,
    roles: usuario.esSuperadmin || !normalized.ok ? [] : normalized.roles,
  };
}

/**
 * Valida credenciales y, si procede, crea la sesión.
 *
 * El email es una excepción acotada de identidad: se busca por el email único
 * global, no es una consulta de datos de tenant. Nunca se registran email,
 * contraseña ni token.
 */
export async function authenticateCredentials({
  db,
  email,
  password,
  now = new Date(),
}: {
  db: AuthDb;
  email: string;
  password: string;
  now?: Date;
}): Promise<AuthenticateResult> {
  const normalizedEmail = normalizeEmail(email);
  const emailIsValid = isEmailLengthValid(normalizedEmail);
  const passwordIsValid = isPasswordLengthValid(password);

  const usuario = emailIsValid
    ? await db.usuario.findUnique({
        where: { email: normalizedEmail },
        include: { empresa: true },
      })
    : null;

  // Siempre se ejecuta scrypt, incluso con email inexistente o usuario sin
  // contraseña, para no filtrar la existencia de la cuenta por tiempo.
  const storedHash =
    usuario?.passwordHash && passwordIsValid
      ? usuario.passwordHash
      : DUMMY_PASSWORD_HASH;

  const passwordMatches = await verifyPassword(password, storedHash);

  if (!usuario || !usuario.passwordHash || !passwordMatches) {
    return { ok: false, reason: "invalid" };
  }

  if (usuario.estado !== "ACTIVO") {
    return { ok: false, reason: "invalid" };
  }

  if (usuario.esSuperadmin) {
    if (usuario.empresaId !== null) {
      return { ok: false, reason: "invalid" };
    }
  } else if (!usuario.empresa || usuario.empresa.estado !== "ACTIVA") {
    return { ok: false, reason: "invalid" };
  }

  const { token, expiraEn } = await createSession(db, {
    usuarioId: usuario.id,
    now,
  });

  return {
    ok: true,
    token,
    expiraEn,
    user: toAuthenticatedUser(usuario),
  };
}

/**
 * Carga una sesión por token crudo. La base de datos manda: una sesión
 * revocada, caducada, con usuario inactivo o con empresa suspendida no
 * autentica.
 */
export async function getSessionByToken(
  db: AuthDb,
  token: string,
  now: Date = new Date(),
): Promise<CurrentSession | null> {
  if (!token) {
    return null;
  }

  const sesion = await db.sesion.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      usuario: {
        include: { empresa: true },
      },
    },
  });

  if (!sesion || sesion.revocadaEn !== null) {
    return null;
  }

  if (sesion.expiraEn.getTime() <= now.getTime()) {
    return null;
  }

  const usuario = sesion.usuario;

  if (usuario.estado !== "ACTIVO") {
    return null;
  }

  if (usuario.esSuperadmin) {
    if (usuario.empresaId !== null) {
      return null;
    }
  } else if (!usuario.empresa || usuario.empresa.estado !== "ACTIVA") {
    return null;
  }

  return {
    ...toAuthenticatedUser(usuario),
    sesionId: sesion.id,
    expiraEn: sesion.expiraEn,
  };
}

/** Revoca una sesión concreta. Devuelve si había una sesión activa que marcar. */
export async function revokeSessionByToken(
  db: AuthDb,
  token: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (!token) {
    return false;
  }

  const result = await db.sesion.updateMany({
    where: {
      tokenHash: hashSessionToken(token),
      revocadaEn: null,
    },
    data: { revocadaEn: now },
  });

  return result.count > 0;
}
