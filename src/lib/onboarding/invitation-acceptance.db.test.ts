import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { disconnectDb, getDb } from "@/db/client";
import { inRollback, uniqueSuffix } from "@/db/db-test-utils";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { authenticateCredentials, getSessionByToken } from "@/lib/auth/session";
import { hashSessionToken } from "@/lib/auth/session-token";
import {
  createCompanyWithInvitation,
  createCompanyWithInvitationInTransaction,
} from "@/lib/superadmin/companies";
import { createInvitationToken } from "@/lib/superadmin/invitations";
import type { CompanyFormValues } from "@/lib/superadmin/validation";
import { createPortalScenario } from "@/lib/portal/db-test-fixtures";
import { invitePortalContactInTransaction } from "@/lib/portal/invitaciones";
import {
  acceptInvitation,
  acceptInvitationInTransaction,
  findInvitationByToken,
} from "./invitation-acceptance";

const PASSWORD = "contraseña-de-alta-segura";
const createdAt = new Date("2026-11-14T10:00:00.000Z");
const later = new Date("2026-11-15T10:00:00.000Z");
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

afterAll(async () => {
  await disconnectDb();
});

function companyValues(
  suffix: string,
  planId: string,
  overrides: Partial<CompanyFormValues> = {},
): CompanyFormValues {
  return {
    nombre: `Empresa onboarding ${suffix}`,
    nif: `B${suffix}`.slice(0, 20).toUpperCase(),
    direccionFiscal: "Calle Mayor 1, 28013 Madrid",
    emailFacturacion: `facturacion-${suffix}@example.com`,
    planId,
    estado: "ACTIVA",
    adminNombre: "Ana Invitada",
    adminEmail: `ana-${suffix}@example.com`,
    ...overrides,
  };
}

async function createInvitedCompany(
  tx: Prisma.TransactionClient,
  overrides: Partial<CompanyFormValues> = {},
) {
  const suffix = uniqueSuffix();
  const plan = await tx.plan.create({
    data: { nombre: `Plan onboarding ${suffix}`, importeMensual: "49.90" },
  });
  const created = await createCompanyWithInvitationInTransaction(
    tx,
    companyValues(suffix, plan.id, overrides),
    { now: createdAt },
  );

  if (!created.ok) {
    throw new Error(`No se pudo crear la empresa de prueba: ${created.error}`);
  }

  return created;
}

describe("búsqueda de invitación por token", () => {
  it("devuelve la empresa y el invitado de una invitación pendiente", async () => {
    const result = await inRollback(async (tx) => {
      const created = await createInvitedCompany(tx);
      return {
        created,
        lookup: await findInvitationByToken(tx, created.token, later),
      };
    });

    expect(result.lookup.status).toBe("VALIDA");
    if (result.lookup.status === "VALIDA") {
      expect(result.lookup.invitacionId).toBe(result.created.invitacionId);
      expect(result.lookup.empresa.id).toBe(result.created.empresaId);
      expect(result.lookup.usuario.id).toBe(result.created.usuarioId);
    }
  });

  it("no encuentra un token bien formado que no existe", async () => {
    const lookup = await inRollback((tx) =>
      findInvitationByToken(tx, createInvitationToken(), later),
    );

    expect(lookup).toEqual({ status: "NO_ENCONTRADA" });
  });
});

describe("aceptación de la invitación", () => {
  it("activa al usuario, guarda la contraseña, marca la invitación y crea una sesión válida", async () => {
    const result = await inRollback(async (tx) => {
      const created = await createInvitedCompany(tx);
      const accepted = await acceptInvitationInTransaction(tx, {
        token: created.token,
        passwordHash,
        now: later,
      });

      if (!accepted.ok) {
        throw new Error(`Se esperaba la aceptación: ${accepted.reason}`);
      }

      const usuario = await tx.usuario.findUniqueOrThrow({
        where: { id: created.usuarioId },
      });
      const invitacion = await tx.invitacion.findUniqueOrThrow({
        where: { id: created.invitacionId },
      });
      const sesiones = await tx.sesion.findMany({
        where: { usuarioId: created.usuarioId },
      });
      const session = await getSessionByToken(
        tx,
        accepted.sessionToken,
        later,
      );
      const login = await authenticateCredentials({
        db: tx,
        email: usuario.email,
        password: PASSWORD,
        now: later,
      });

      return { created, accepted, usuario, invitacion, sesiones, session, login };
    });

    expect(result.usuario.estado).toBe("ACTIVO");
    expect(result.usuario.passwordHash).toMatch(/^scrypt\$v=1\$/);
    expect(await verifyPassword(PASSWORD, result.usuario.passwordHash ?? "")).toBe(
      true,
    );
    expect(result.invitacion.aceptadaEn).toEqual(later);
    expect(result.accepted.empresaId).toBe(result.created.empresaId);

    // Las sesiones se cuentan antes del login posterior: la aceptación crea
    // exactamente una y solo se guarda el hash del token.
    expect(result.sesiones).toHaveLength(1);
    expect(result.sesiones[0].tokenHash).toBe(
      hashSessionToken(result.accepted.sessionToken),
    );
    expect(result.sesiones[0].tokenHash).not.toBe(result.accepted.sessionToken);

    expect(result.session?.empresa?.id).toBe(result.created.empresaId);
    expect(result.session?.esSuperadmin).toBe(false);
    expect(result.session?.cliente).toBeNull();
    expect(result.accepted.destino).toBe("/panel");
    expect(result.login.ok).toBe(true);
  });

  it("es de un solo uso: el segundo intento no cambia la contraseña ni crea sesión", async () => {
    const otherHash = await hashPassword("otra-contraseña-distinta");

    const result = await inRollback(async (tx) => {
      const created = await createInvitedCompany(tx);
      const first = await acceptInvitationInTransaction(tx, {
        token: created.token,
        passwordHash,
        now: later,
      });
      const second = await acceptInvitationInTransaction(tx, {
        token: created.token,
        passwordHash: otherHash,
        now: later,
      });
      const usuario = await tx.usuario.findUniqueOrThrow({
        where: { id: created.usuarioId },
      });
      const sesiones = await tx.sesion.count({
        where: { usuarioId: created.usuarioId },
      });
      const lookup = await findInvitationByToken(tx, created.token, later);

      return { first, second, usuario, sesiones, lookup };
    });

    expect(result.first.ok).toBe(true);
    expect(result.second).toEqual({ ok: false, reason: "ACEPTADA" });
    expect(result.usuario.passwordHash).toBe(passwordHash);
    expect(result.sesiones).toBe(1);
    expect(result.lookup).toEqual({ status: "ACEPTADA" });
  });

  it("rechaza una invitación caducada sin activar al usuario", async () => {
    const result = await inRollback(async (tx) => {
      const created = await createInvitedCompany(tx);
      const expiredAt = new Date("2026-11-21T10:00:00.000Z");
      const accepted = await acceptInvitationInTransaction(tx, {
        token: created.token,
        passwordHash,
        now: expiredAt,
      });
      const usuario = await tx.usuario.findUniqueOrThrow({
        where: { id: created.usuarioId },
      });
      const invitacion = await tx.invitacion.findUniqueOrThrow({
        where: { id: created.invitacionId },
      });
      const sesiones = await tx.sesion.count({
        where: { usuarioId: created.usuarioId },
      });

      return { accepted, usuario, invitacion, sesiones };
    });

    expect(result.accepted).toEqual({ ok: false, reason: "CADUCADA" });
    expect(result.usuario.estado).toBe("INACTIVO");
    expect(result.usuario.passwordHash).toBeNull();
    expect(result.invitacion.aceptadaEn).toBeNull();
    expect(result.sesiones).toBe(0);
  });

  it("rechaza la invitación de una empresa suspendida y la deja pendiente", async () => {
    const result = await inRollback(async (tx) => {
      const created = await createInvitedCompany(tx, { estado: "SUSPENDIDA" });
      const accepted = await acceptInvitationInTransaction(tx, {
        token: created.token,
        passwordHash,
        now: later,
      });
      const usuario = await tx.usuario.findUniqueOrThrow({
        where: { id: created.usuarioId },
      });
      const invitacion = await tx.invitacion.findUniqueOrThrow({
        where: { id: created.invitacionId },
      });

      return { accepted, usuario, invitacion };
    });

    expect(result.accepted).toEqual({ ok: false, reason: "EMPRESA_INACTIVA" });
    expect(result.usuario.estado).toBe("INACTIVO");
    expect(result.usuario.passwordHash).toBeNull();
    expect(result.invitacion.aceptadaEn).toBeNull();
  });

  it("rechaza un token desconocido o mal formado", async () => {
    const result = await inRollback(async (tx) => ({
      unknown: await acceptInvitationInTransaction(tx, {
        token: createInvitationToken(),
        passwordHash,
        now: later,
      }),
      malformed: await acceptInvitationInTransaction(tx, {
        token: "no-es-un-token",
        passwordHash,
        now: later,
      }),
    }));

    expect(result.unknown).toEqual({ ok: false, reason: "NO_ENCONTRADA" });
    expect(result.malformed).toEqual({ ok: false, reason: "NO_ENCONTRADA" });
  });
});

describe("aceptación de una invitación de contacto de cliente", () => {
  async function invitedContact(tx: Prisma.TransactionClient, suffix: string) {
    const s = await createPortalScenario(tx, suffix);
    const invited = await invitePortalContactInTransaction(tx, {
      empresaId: s.a.id,
      clienteId: s.c1.cliente.id,
      contactoId: s.c1.ana.id,
      now: createdAt,
    });

    if (!invited.ok) {
      throw new Error(invited.error);
    }

    return { s, invited };
  }

  it("la página la reconoce como portal con la razón social del cliente", async () => {
    const result = await inRollback(async (tx) => {
      const { s, invited } = await invitedContact(tx, uniqueSuffix());
      return { s, lookup: await findInvitationByToken(tx, invited.token, later) };
    });

    expect(result.lookup).toMatchObject({
      status: "VALIDA",
      tipo: "CONTACTO_CLIENTE",
      cliente: { razonSocial: "Cliente Uno" },
      empresa: { id: result.s.a.id },
      usuario: { nombre: "Ana Uno" },
    });
  });

  it("activa al usuario de cliente, crea su sesión con cliente y su destino es /portal", async () => {
    const result = await inRollback(async (tx) => {
      const { s, invited } = await invitedContact(tx, uniqueSuffix());
      const accepted = await acceptInvitationInTransaction(tx, {
        token: invited.token,
        passwordHash,
        now: later,
      });
      if (!accepted.ok) {
        throw new Error(accepted.reason);
      }
      const usuario = await tx.usuario.findUniqueOrThrow({
        where: { id: invited.usuarioId },
      });
      const session = await getSessionByToken(tx, accepted.sessionToken, later);
      const second = await acceptInvitationInTransaction(tx, {
        token: invited.token,
        passwordHash,
        now: later,
      });
      return { s, accepted, usuario, session, second };
    });

    expect(result.accepted.destino).toBe("/portal");
    expect(result.usuario.estado).toBe("ACTIVO");
    expect(result.usuario.roles).toEqual([]);
    expect(result.session?.cliente?.id).toBe(result.s.c1.cliente.id);
    expect(result.session?.roles).toEqual([]);
    expect(result.second).toEqual({ ok: false, reason: "ACEPTADA" });
  });

  it("rechaza una invitación de contacto caducada o de una empresa suspendida", async () => {
    const result = await inRollback(async (tx) => {
      const { invited } = await invitedContact(tx, uniqueSuffix());
      const caducada = await acceptInvitationInTransaction(tx, {
        token: invited.token,
        passwordHash,
        now: new Date("2026-11-21T10:00:00.000Z"),
      });

      const otra = await invitedContact(tx, uniqueSuffix());
      await tx.empresa.update({
        where: { id: otra.s.a.id },
        data: { estado: "SUSPENDIDA" },
      });
      const suspendida = await acceptInvitationInTransaction(tx, {
        token: otra.invited.token,
        passwordHash,
        now: later,
      });
      const usuario = await tx.usuario.findUniqueOrThrow({
        where: { id: otra.invited.usuarioId },
      });
      return { caducada, suspendida, usuario };
    });

    expect(result.caducada).toEqual({ ok: false, reason: "CADUCADA" });
    expect(result.suspendida).toEqual({ ok: false, reason: "EMPRESA_INACTIVA" });
    expect(result.usuario.estado).toBe("INACTIVO");
  });
});

describe("aceptación concurrente", () => {
  it("con dos envíos simultáneos solo uno acepta y solo se crea una sesión", async () => {
    const db = getDb();
    const suffix = uniqueSuffix();
    const plan = await db.plan.create({
      data: { nombre: `Plan concurrencia ${suffix}`, importeMensual: "49.90" },
    });

    try {
      const created = await createCompanyWithInvitation(
        db,
        companyValues(suffix, plan.id),
      );

      if (!created.ok) {
        throw new Error(`No se pudo crear la empresa: ${created.error}`);
      }

      const results = await Promise.all([
        acceptInvitation(db, { token: created.token, password: PASSWORD }),
        acceptInvitation(db, { token: created.token, password: PASSWORD }),
      ]);

      const winners = results.filter((result) => result.ok);
      const losers = results.filter((result) => !result.ok);
      const sesiones = await db.sesion.count({
        where: { usuarioId: created.usuarioId },
      });
      const usuario = await db.usuario.findUniqueOrThrow({
        where: { id: created.usuarioId },
      });

      expect(winners).toHaveLength(1);
      expect(losers).toEqual([{ ok: false, reason: "ACEPTADA" }]);
      expect(sesiones).toBe(1);
      expect(usuario.estado).toBe("ACTIVO");
    } finally {
      await db.usuario.deleteMany({ where: { empresa: { planId: plan.id } } });
      await db.empresa.deleteMany({ where: { planId: plan.id } });
      await db.plan.deleteMany({ where: { id: plan.id } });
    }
  });
});
