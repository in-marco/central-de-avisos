import { describe, expect, it } from "vitest";
import { createInvitationToken } from "@/lib/superadmin/invitations";
import {
  classifyInvitation,
  isWellFormedInvitationToken,
} from "./invitation-acceptance";

const now = new Date("2026-11-14T10:00:00.000Z");

function invitation(
  overrides: {
    tipo?: string;
    expiraEn?: Date;
    aceptadaEn?: Date | null;
    empresaEstado?: string;
    usuario?: Partial<{
      estado: string;
      passwordHash: string | null;
      esSuperadmin: boolean;
      empresaId: string | null;
    }>;
  } = {},
) {
  return {
    id: "inv-1",
    tipo: overrides.tipo ?? "ADMINISTRADOR_EMPRESA",
    expiraEn: overrides.expiraEn ?? new Date("2026-11-20T10:00:00.000Z"),
    aceptadaEn: overrides.aceptadaEn ?? null,
    empresa: {
      id: "emp-1",
      nombre: "Empresa Norte",
      estado: overrides.empresaEstado ?? "ACTIVA",
    },
    usuario: {
      id: "usr-1",
      nombre: "Ana",
      email: "ana@norte.local",
      estado: "INACTIVO",
      passwordHash: null,
      esSuperadmin: false,
      empresaId: "emp-1",
      ...overrides.usuario,
    },
  };
}

describe("formato del token de invitación", () => {
  it("acepta tokens generados y rechaza el resto sin consultar la base", () => {
    expect(isWellFormedInvitationToken(createInvitationToken())).toBe(true);
    expect(isWellFormedInvitationToken("")).toBe(false);
    expect(isWellFormedInvitationToken("corto")).toBe(false);
    expect(isWellFormedInvitationToken("a".repeat(44))).toBe(false);
    expect(isWellFormedInvitationToken(`${"a".repeat(42)}/`)).toBe(false);
    expect(isWellFormedInvitationToken(`${"a".repeat(42)}=`)).toBe(false);
    expect(isWellFormedInvitationToken(null)).toBe(false);
  });
});

describe("clasificación de la invitación", () => {
  it("devuelve VALIDA con datos de empresa e invitado si está pendiente", () => {
    const result = classifyInvitation(invitation(), now);

    expect(result).toEqual({
      status: "VALIDA",
      invitacionId: "inv-1",
      expiraEn: new Date("2026-11-20T10:00:00.000Z"),
      empresa: { id: "emp-1", nombre: "Empresa Norte" },
      usuario: { id: "usr-1", nombre: "Ana", email: "ana@norte.local" },
    });
  });

  it("trata una invitación inexistente o incoherente como no encontrada", () => {
    expect(classifyInvitation(null, now)).toEqual({ status: "NO_ENCONTRADA" });
    expect(
      classifyInvitation(invitation({ tipo: "OTRO" }), now),
    ).toEqual({ status: "NO_ENCONTRADA" });
    expect(
      classifyInvitation(invitation({ usuario: { esSuperadmin: true } }), now),
    ).toEqual({ status: "NO_ENCONTRADA" });
    expect(
      classifyInvitation(invitation({ usuario: { empresaId: "otra" } }), now),
    ).toEqual({ status: "NO_ENCONTRADA" });
  });

  it("informa como usada una invitación aceptada aunque haya caducado", () => {
    expect(
      classifyInvitation(
        invitation({
          aceptadaEn: new Date("2026-11-15T10:00:00.000Z"),
          expiraEn: new Date("2026-11-01T10:00:00.000Z"),
        }),
        now,
      ),
    ).toEqual({ status: "ACEPTADA" });
  });

  it("informa como usada si el usuario ya tiene contraseña o está activo", () => {
    expect(
      classifyInvitation(
        invitation({ usuario: { passwordHash: "scrypt$v=1$..." } }),
        now,
      ),
    ).toEqual({ status: "ACEPTADA" });
    expect(
      classifyInvitation(invitation({ usuario: { estado: "ACTIVO" } }), now),
    ).toEqual({ status: "ACEPTADA" });
  });

  it("rechaza una invitación caducada en el instante exacto de expiración", () => {
    expect(classifyInvitation(invitation({ expiraEn: now }), now)).toEqual({
      status: "CADUCADA",
    });
  });

  it("rechaza una invitación pendiente de una empresa suspendida", () => {
    expect(
      classifyInvitation(invitation({ empresaEstado: "SUSPENDIDA" }), now),
    ).toEqual({ status: "EMPRESA_INACTIVA" });
  });
});
