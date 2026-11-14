import { createHash, randomBytes } from "node:crypto";

export const INVITATION_DURATION_DAYS = 7;
export const INVITATION_DURATION_MS =
  INVITATION_DURATION_DAYS * 24 * 60 * 60 * 1000;

export const INVITATION_FLASH_COOKIE_NAME = "central_invitacion";
export const INVITATION_FLASH_MAX_AGE_SECONDS = 60;
export const INVITATION_FLASH_COOKIE_PATH = "/superadmin/empresas";

export type InvitationStatus = "PENDIENTE" | "CADUCADA" | "ACEPTADA";

/**
 * Token opaco de 32 bytes. El valor crudo solo se muestra una vez desde una
 * cookie flash; en la base de datos se guarda únicamente su SHA-256.
 */
export function createInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function invitationPath(token: string): string {
  return `/invitacion/${token}`;
}

/**
 * Estado derivado: la aceptación manda; si no, la fecha de expiración.
 */
export function getInvitationStatus(
  invitation: { expiraEn: Date; aceptadaEn: Date | null },
  now: Date = new Date(),
): InvitationStatus {
  if (invitation.aceptadaEn !== null) {
    return "ACEPTADA";
  }

  if (invitation.expiraEn.getTime() <= now.getTime()) {
    return "CADUCADA";
  }

  return "PENDIENTE";
}
