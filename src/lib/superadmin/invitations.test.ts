import { describe, expect, it } from "vitest";
import {
  createInvitationToken,
  getInvitationStatus,
  hashInvitationToken,
  INVITATION_DURATION_DAYS,
  INVITATION_DURATION_MS,
  invitationPath,
} from "./invitations";

describe("token de invitación", () => {
  it("genera un token opaco de 32 bytes en base64url y solo expone su hash", () => {
    const first = createInvitationToken();
    const second = createInvitationToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(hashInvitationToken(first)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInvitationToken(first)).not.toBe(first);
    expect(hashInvitationToken(first)).toBe(hashInvitationToken(first));
  });

  it("construye la ruta del enlace local sin codificar el token", () => {
    expect(invitationPath("abc_DEF-123")).toBe("/invitacion/abc_DEF-123");
  });
});

describe("estado derivado de la invitación", () => {
  const now = new Date("2026-11-14T10:00:00.000Z");

  it("marca una invitación no aceptada y vigente como Pendiente", () => {
    expect(
      getInvitationStatus(
        {
          expiraEn: new Date(now.getTime() + INVITATION_DURATION_MS),
          aceptadaEn: null,
        },
        now,
      ),
    ).toBe("PENDIENTE");
  });

  it("marca como Caducada cuando la expiración ya pasó o es igual a ahora", () => {
    expect(
      getInvitationStatus(
        { expiraEn: new Date(now.getTime() - 1), aceptadaEn: null },
        now,
      ),
    ).toBe("CADUCADA");
    expect(
      getInvitationStatus({ expiraEn: now, aceptadaEn: null }, now),
    ).toBe("CADUCADA");
  });

  it("prioriza Aceptada aunque haya pasado la fecha de expiración", () => {
    expect(
      getInvitationStatus(
        {
          expiraEn: new Date(now.getTime() - 1),
          aceptadaEn: new Date(now.getTime() - 2),
        },
        now,
      ),
    ).toBe("ACEPTADA");
  });

  it("declara una duración de 7 días", () => {
    expect(INVITATION_DURATION_DAYS).toBe(7);
    expect(INVITATION_DURATION_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
