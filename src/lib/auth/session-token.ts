import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE_NAME = "central_sesion";
export const SESSION_DURATION_SECONDS = 12 * 60 * 60;
export const SESSION_DURATION_MS = SESSION_DURATION_SECONDS * 1000;

/**
 * Token opaco de 32 bytes. El valor crudo solo viaja en la cookie; en la base
 * de datos se guarda únicamente su SHA-256.
 */
export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
