import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { normalizeEmail } from "./password";

/**
 * Límite durable de intentos de login en PostgreSQL (tabla `limites_login`).
 *
 * - Sin estado en memoria: funciona igual en serverless con varias instancias.
 * - Cada intento es un upsert atómico por clave y todo el cálculo de tiempo se
 *   hace en SQL con `now()` (evita depender del reloj del proceso).
 * - Las claves son hashes SHA-256 del email normalizado y de la IP: la tabla
 *   nunca guarda datos personales en claro (CHECK `limites_login_clave_hash`).
 * - El límite por email se aplica exista o no el email, así que bloquear no
 *   revela si la cuenta existe.
 */

export const MAX_INTENTOS_EMAIL = 5;
export const MAX_INTENTOS_IP = 50;
export const DEFAULT_WINDOW_SECONDS = 900;
export const MIN_WINDOW_SECONDS = 60;
export const MAX_WINDOW_SECONDS = 3600;

/** Las filas cuya ventana empezó hace más de un día se borran al registrar. */
const STALE_ROWS_INTERVAL_SECONDS = 86_400;

type EnvLike = Record<string, string | undefined>;

/**
 * Lee `LOGIN_RATE_LIMIT_WINDOW_SECONDS` (entero entre 60 y 3600). Si falta o no
 * es válido, usa 900 s (15 min).
 */
export function loginRateLimitWindowSeconds(env: EnvLike = process.env): number {
  const raw = env.LOGIN_RATE_LIMIT_WINDOW_SECONDS?.trim();

  if (!raw || !/^\d+$/.test(raw)) {
    return DEFAULT_WINDOW_SECONDS;
  }

  const value = Number(raw);

  if (value < MIN_WINDOW_SECONDS || value > MAX_WINDOW_SECONDS) {
    return DEFAULT_WINDOW_SECONDS;
  }

  return value;
}

export type RateLimitKeys = {
  email: string;
  ip: string | null;
};

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * IP del cliente. En Vercel la plataforma fija `x-real-ip` y
 * `x-forwarded-for`; en local son falsificables (solo protege el límite por
 * email). Sin IP identificable devuelve `null`.
 */
export function clientIp(headers: Headers): string | null {
  const realIp = headers.get("x-real-ip")?.trim();

  if (realIp) {
    return realIp;
  }

  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  return forwardedFor ? forwardedFor : null;
}

/**
 * Claves del limitador. Un email no string (campo ausente) cuenta como email
 * vacío normalizado, para que no haya forma de eludir el contador.
 */
export function rateLimitKeys(email: unknown, headers: Headers): RateLimitKeys {
  const normalized = normalizeEmail(typeof email === "string" ? email : "");
  const ip = clientIp(headers);

  return {
    email: `email:${sha256Hex(normalized)}`,
    ip: ip ? `ip:${sha256Hex(ip)}` : null,
  };
}

/** Decide el bloqueo a partir de los contadores devueltos por la base. */
export function isBlocked(counts: {
  email: number;
  ip: number | null;
}): boolean {
  return (
    counts.email > MAX_INTENTOS_EMAIL ||
    (counts.ip !== null && counts.ip > MAX_INTENTOS_IP)
  );
}

type RateLimitDb = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;

async function incrementKey(
  db: RateLimitDb,
  clave: string,
  windowSeconds: number,
): Promise<number> {
  const rows = await db.$queryRaw<Array<{ intentos: number }>>`
    INSERT INTO "limites_login" ("clave", "intentos", "ventana_inicio")
    VALUES (${clave}, 1, now())
    ON CONFLICT ("clave") DO UPDATE SET
      "intentos" = CASE
        WHEN "limites_login"."ventana_inicio" <= now() - make_interval(secs => ${windowSeconds}::int)
          THEN 1
        ELSE "limites_login"."intentos" + 1
      END,
      "ventana_inicio" = CASE
        WHEN "limites_login"."ventana_inicio" <= now() - make_interval(secs => ${windowSeconds}::int)
          THEN now()
        ELSE "limites_login"."ventana_inicio"
      END
    RETURNING "intentos"
  `;

  const intentos = rows[0]?.intentos;

  if (typeof intentos !== "number") {
    throw new Error("El limitador de login no devolvió el contador.");
  }

  return intentos;
}

export type LoginAttemptResult = {
  bloqueado: boolean;
  intentosEmail: number;
  intentosIp: number | null;
};

/**
 * Registra un intento de login para el email y, si la hay, la IP. Devuelve
 * `bloqueado` si el email supera 5 intentos o la IP 50 en la ventana. Cualquier
 * error se propaga: el login debe fallar cerrado.
 */
export async function registerLoginAttempt(
  db: RateLimitDb,
  keys: RateLimitKeys,
  windowSeconds: number,
): Promise<LoginAttemptResult> {
  const intentosEmail = await incrementKey(db, keys.email, windowSeconds);
  const intentosIp = keys.ip
    ? await incrementKey(db, keys.ip, windowSeconds)
    : null;

  await db.$executeRaw`
    DELETE FROM "limites_login"
    WHERE "ventana_inicio" < now() - make_interval(secs => ${STALE_ROWS_INTERVAL_SECONDS}::int)
  `;

  return {
    bloqueado: isBlocked({ email: intentosEmail, ip: intentosIp }),
    intentosEmail,
    intentosIp,
  };
}

/**
 * Tras un login correcto: borra el contador del email y descuenta este intento
 * del contador de la IP (los logins correctos no agotan el cupo compartido).
 */
export async function clearLoginAttemptsOnSuccess(
  db: RateLimitDb,
  keys: RateLimitKeys,
): Promise<void> {
  await db.$executeRaw`
    DELETE FROM "limites_login" WHERE "clave" = ${keys.email}
  `;

  if (keys.ip) {
    await db.$executeRaw`
      UPDATE "limites_login"
      SET "intentos" = GREATEST("intentos" - 1, 0)
      WHERE "clave" = ${keys.ip}
    `;
  }
}
