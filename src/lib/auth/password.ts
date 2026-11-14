import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";

/**
 * Hash de contraseña con scrypt nativo versionado.
 *
 * Formato:
 *   scrypt$v=1$N=131072,r=8,p=1$<salt_b64url>$<hash_b64url>
 *
 * El prefijo de versión y los parámetros permiten migrar a Argon2id en el
 * futuro sin romper hashes existentes.
 */

export const PASSWORD_MAX_LENGTH = 128;
export const EMAIL_MAX_LENGTH = 254;

const SCRYPT_VERSION = "v=1";
const SCRYPT_N = 131_072;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAXMEM = 256 * 1024 * 1024;

const MAX_ACCEPTED_N = 262_144;
const MAX_ACCEPTED_R = 16;
const MAX_ACCEPTED_P = 4;

/**
 * Hash válido de una contraseña que nadie conoce. Se usa para que un email
 * inexistente o un usuario sin contraseña consuma el mismo trabajo de scrypt
 * que una credencial incorrecta y no se pueda enumerar por tiempo.
 */
export const DUMMY_PASSWORD_HASH =
  "scrypt$v=1$N=131072,r=8,p=1$8y3V-YQkMTw3QOPc293kXA$84CmLCxWwX_NDo8i_y7H1b-DQPYFNmNwL0xsx-uI2XjL2SJgXEhqBC9wNBMR_cYT3twMzp_FlgykW5tVWn1_hg";

function scrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      keyLength,
      { ...options, maxmem: SCRYPT_MAXMEM },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isPasswordLengthValid(password: string): boolean {
  return password.length > 0 && password.length <= PASSWORD_MAX_LENGTH;
}

export function isEmailLengthValid(email: string): boolean {
  return email.length > 0 && email.length <= EMAIL_MAX_LENGTH;
}

/** Longitud mínima de una contraseña nueva (alta por invitación). */
export const NEW_PASSWORD_MIN_LENGTH = 12;

export type NewPasswordError = "corta" | "larga" | "distinta";

/**
 * Política de contraseña nueva: entre 12 y 128 caracteres y confirmación
 * idéntica. No se exigen clases de caracteres. El login no aplica esta
 * política para no bloquear cuentas existentes.
 */
export function validateNewPassword(
  password: string,
  confirmation: string,
): { ok: true } | { ok: false; error: NewPasswordError } {
  if (password.length < NEW_PASSWORD_MIN_LENGTH) {
    return { ok: false, error: "corta" };
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, error: "larga" };
  }

  if (password !== confirmation) {
    return { ok: false, error: "distinta" };
  }

  return { ok: true };
}

export async function hashPassword(password: string): Promise<string> {
  if (!isPasswordLengthValid(password)) {
    throw new Error(
      `La contraseña debe tener entre 1 y ${PASSWORD_MAX_LENGTH} caracteres.`,
    );
  }

  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  return [
    "scrypt",
    SCRYPT_VERSION,
    `N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}`,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

function parseHash(storedHash: string) {
  const parts = storedHash.split("$");

  if (parts.length !== 5) {
    return null;
  }

  const [algorithm, version, paramsRaw, saltB64, hashB64] = parts;

  if (algorithm !== "scrypt" || version !== SCRYPT_VERSION) {
    return null;
  }

  const params = new Map<string, number>();
  for (const entry of paramsRaw.split(",")) {
    const [key, value] = entry.split("=");
    if (!key || !value) {
      return null;
    }
    params.set(key, Number(value));
  }

  const n = params.get("N");
  const r = params.get("r");
  const p = params.get("p");

  if (
    n === undefined ||
    r === undefined ||
    p === undefined ||
    !Number.isInteger(n) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    n < 2 ||
    n > MAX_ACCEPTED_N ||
    r < 1 ||
    r > MAX_ACCEPTED_R ||
    p < 1 ||
    p > MAX_ACCEPTED_P
  ) {
    return null;
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64, "base64url");
    expected = Buffer.from(hashB64, "base64url");
  } catch {
    return null;
  }

  if (salt.length === 0 || expected.length === 0) {
    return null;
  }

  return { n, r, p, salt, expected };
}

/**
 * Verifica una contraseña contra un hash versionado. Nunca lanza por un hash
 * corrupto o con formato desconocido: devuelve `false`.
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  if (!isPasswordLengthValid(password)) {
    return false;
  }

  const parsed = parseHash(storedHash);
  if (!parsed) {
    return false;
  }

  const derivedKey = await scrypt(password, parsed.salt, parsed.expected.length, {
    N: parsed.n,
    r: parsed.r,
    p: parsed.p,
  });

  if (derivedKey.length !== parsed.expected.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, parsed.expected);
}
