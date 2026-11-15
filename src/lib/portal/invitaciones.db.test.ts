import { afterAll, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { disconnectDb, getDb } from "@/db/client";
import { inRollback, uniqueSuffix } from "@/db/db-test-utils";
import { findInvitationByToken } from "@/lib/onboarding/invitation-acceptance";
import {
  hashInvitationToken,
  INVITATION_DURATION_MS,
} from "@/lib/superadmin/invitations";
import { createPortalScenario } from "./db-test-fixtures";
import {
  findFlashPortalInvitation,
  invitePortalContact,
  invitePortalContactInTransaction,
  listPortalAccess,
} from "./invitaciones";

afterAll(async () => {
  await disconnectDb();
});

const t0 = new Date("2026-11-15T10:00:00.000Z");
const t1 = new Date("2026-11-16T10:00:00.000Z");
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

async function snapshot(tx: Prisma.TransactionClient) {
  const [usuarios, invitaciones] = await Promise.all([
    tx.usuario.findMany({ orderBy: { id: "asc" } }),
    tx.invitacion.findMany({ orderBy: { id: "asc" } }),
  ]);
  return JSON.stringify({ usuarios, invitaciones });
}

describe("invitar a un contacto al portal", () => {
  it("crea un usuario de cliente INACTIVO sin contraseña y una invitación CONTACTO_CLIENTE de 7 días", async () => {
    const result = await inRollback(async (tx) => {
      const s = await createPortalScenario(tx, uniqueSuffix());
      const invited = await invitePortalContactInTransaction(tx, {
        empresaId: s.a.id,
        clienteId: s.c1.cliente.id,
        contactoId: s.c1.ana.id,
        now: t0,
      });

      if (!invited.ok) {
        throw new Error(invited.error);
      }

      const usuario = await tx.usuario.findUniqueOrThrow({
        where: { id: invited.usuarioId },
      });
      const invitacion = await tx.invitacion.findUniqueOrThrow({
        where: { id: invited.invitacionId },
      });
      return { s, invited, usuario, invitacion };
    });

    expect(result.invited.nuevoUsuario).toBe(true);
    expect(result.usuario).toMatchObject({
      empresaId: result.s.a.id,
      clienteId: result.s.c1.cliente.id,
      contactoId: result.s.c1.ana.id,
      email: result.s.c1.ana.email,
      nombre: "Ana Uno",
      estado: "INACTIVO",
      passwordHash: null,
      esSuperadmin: false,
      roles: [],
    });
    expect(result.invitacion.tipo).toBe("CONTACTO_CLIENTE");
    expect(result.invitacion.empresaId).toBe(result.s.a.id);
    expect(result.invitacion.expiraEn.getTime() - t0.getTime()).toBe(
      INVITATION_DURATION_MS,
    );
    expect(result.invitacion.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.invitacion.tokenHash).toBe(hashInvitationToken(result.invited.token));
    expect(result.invitacion.tokenHash).not.toContain(result.invited.token);
  });

  it("rechaza sin cambiar la base: sin email, email en uso, ya activo, otro cliente, otra empresa o id no válido", async () => {
    const result = await inRollback(async (tx) => {
      const s = await createPortalScenario(tx, uniqueSuffix());
      const base = { empresaId: s.a.id, clienteId: s.c1.cliente.id, now: t0 };

      const before = await snapshot(tx);
      const sinEmail = await invitePortalContactInTransaction(tx, {
        ...base,
        contactoId: s.c1.sinEmail.id,
      });
      const otroCliente = await invitePortalContactInTransaction(tx, {
        ...base,
        contactoId: s.c2.beto.id,
      });
      const otroClienteConSuId = await invitePortalContactInTransaction(tx, {
        empresaId: s.a.id,
        clienteId: s.c2.cliente.id,
        contactoId: s.c1.ana.id,
        now: t0,
      });
      const otraEmpresa = await invitePortalContactInTransaction(tx, {
        ...base,
        clienteId: s.bc.cliente.id,
        contactoId: s.bc.contacto.id,
      });
      const noUuid = await invitePortalContactInTransaction(tx, {
        ...base,
        contactoId: "no-es-un-uuid",
      });
      const inexistente = await invitePortalContactInTransaction(tx, {
        ...base,
        contactoId: MISSING_ID,
      });
      const after = await snapshot(tx);

      // Email en uso por un usuario de empresa.
      await tx.usuario.create({
        data: {
          empresaId: s.a.id,
          email: s.c1.ana.email!,
          nombre: "Usuario de empresa",
          roles: ["OFICINA"],
        },
      });
      const beforeEmail = await snapshot(tx);
      const emailEnUso = await invitePortalContactInTransaction(tx, {
        ...base,
        contactoId: s.c1.ana.id,
      });
      const afterEmail = await snapshot(tx);

      // Ya activo.
      const invitedBeto = await invitePortalContactInTransaction(tx, {
        empresaId: s.a.id,
        clienteId: s.c2.cliente.id,
        contactoId: s.c2.beto.id,
        now: t0,
      });
      if (!invitedBeto.ok) {
        throw new Error(invitedBeto.error);
      }
      await tx.usuario.update({
        where: { id: invitedBeto.usuarioId },
        data: { estado: "ACTIVO", passwordHash: "scrypt$v=1$x" },
      });
      const beforeActivo = await snapshot(tx);
      const yaActivo = await invitePortalContactInTransaction(tx, {
        empresaId: s.a.id,
        clienteId: s.c2.cliente.id,
        contactoId: s.c2.beto.id,
        now: t1,
      });
      const afterActivo = await snapshot(tx);

      return {
        sinEmail,
        otroCliente,
        otroClienteConSuId,
        otraEmpresa,
        noUuid,
        inexistente,
        emailEnUso,
        yaActivo,
        sinCambios: before === after,
        sinCambiosEmail: beforeEmail === afterEmail,
        sinCambiosActivo: beforeActivo === afterActivo,
      };
    });

    expect(result.sinEmail).toEqual({ ok: false, error: "contacto-sin-email" });
    expect(result.otroCliente).toEqual({ ok: false, error: "no-encontrado" });
    expect(result.otroClienteConSuId).toEqual({ ok: false, error: "no-encontrado" });
    expect(result.otraEmpresa).toEqual({ ok: false, error: "no-encontrado" });
    expect(result.noUuid).toEqual({ ok: false, error: "no-encontrado" });
    expect(result.inexistente).toEqual({ ok: false, error: "no-encontrado" });
    expect(result.emailEnUso).toEqual({ ok: false, error: "email-en-uso" });
    expect(result.yaActivo).toEqual({ ok: false, error: "ya-activo" });
    expect(result.sinCambios).toBe(true);
    expect(result.sinCambiosEmail).toBe(true);
    expect(result.sinCambiosActivo).toBe(true);
  });

  it("generar un enlace nuevo caduca el anterior y no crea otro usuario", async () => {
    const result = await inRollback(async (tx) => {
      const s = await createPortalScenario(tx, uniqueSuffix());
      const input = {
        empresaId: s.a.id,
        clienteId: s.c1.cliente.id,
        contactoId: s.c1.ana.id,
      };
      const first = await invitePortalContactInTransaction(tx, { ...input, now: t0 });
      const second = await invitePortalContactInTransaction(tx, { ...input, now: t1 });

      if (!first.ok || !second.ok) {
        throw new Error("Se esperaban dos invitaciones");
      }

      const usuarios = await tx.usuario.count({ where: { contactoId: s.c1.ana.id } });
      const primera = await tx.invitacion.findUniqueOrThrow({
        where: { id: first.invitacionId },
      });
      const oldLookup = await findInvitationByToken(tx, first.token, t1);
      const newLookup = await findInvitationByToken(tx, second.token, t1);
      const accesos = await listPortalAccess(tx, s.a.id, s.c1.cliente.id, t1);

      return { first, second, usuarios, primera, oldLookup, newLookup, accesos, s };
    });

    expect(result.second.nuevoUsuario).toBe(false);
    expect(result.second.usuarioId).toBe(result.first.usuarioId);
    expect(result.usuarios).toBe(1);
    expect(result.primera.expiraEn).toEqual(t1);
    expect(result.oldLookup).toEqual({ status: "CADUCADA" });
    expect(result.newLookup.status).toBe("VALIDA");
    expect(result.accesos.get(result.s.c1.ana.id)).toEqual({
      estado: "pendiente",
      expiraEn: new Date(t1.getTime() + INVITATION_DURATION_MS),
    });
  });
});

describe("estado del acceso y enlace flash", () => {
  it("lista sin acceso, pendiente, caducada y activo solo del cliente pedido", async () => {
    const result = await inRollback(async (tx) => {
      const s = await createPortalScenario(tx, uniqueSuffix());
      const invited = await invitePortalContactInTransaction(tx, {
        empresaId: s.a.id,
        clienteId: s.c1.cliente.id,
        contactoId: s.c1.ana.id,
        now: t0,
      });
      const beto = await invitePortalContactInTransaction(tx, {
        empresaId: s.a.id,
        clienteId: s.c2.cliente.id,
        contactoId: s.c2.beto.id,
        now: t0,
      });
      if (!invited.ok || !beto.ok) {
        throw new Error("Se esperaban las invitaciones");
      }

      const pendiente = await listPortalAccess(tx, s.a.id, s.c1.cliente.id, t1);
      const caducada = await listPortalAccess(
        tx,
        s.a.id,
        s.c1.cliente.id,
        new Date(t0.getTime() + INVITATION_DURATION_MS),
      );
      await tx.usuario.update({
        where: { id: invited.usuarioId },
        data: { estado: "ACTIVO", passwordHash: "scrypt$v=1$x" },
      });
      const activo = await listPortalAccess(tx, s.a.id, s.c1.cliente.id, t1);
      const otraEmpresa = await listPortalAccess(tx, s.b.id, s.c1.cliente.id, t1);

      return { s, pendiente, caducada, activo, otraEmpresa };
    });

    const ana = result.s.c1.ana.id;
    expect(result.pendiente.get(ana)?.estado).toBe("pendiente");
    expect(result.pendiente.has(result.s.c1.sinEmail.id)).toBe(false);
    // El acceso de un contacto de C2 no aparece en C1.
    expect(result.pendiente.has(result.s.c2.beto.id)).toBe(false);
    expect(result.pendiente.size).toBe(1);
    expect(result.caducada.get(ana)).toEqual({ estado: "caducada" });
    expect(result.activo.get(ana)).toEqual({ estado: "activo" });
    expect(result.otraEmpresa.size).toBe(0);
  });

  it("el enlace flash solo se reconoce en la ficha de su cliente y empresa mientras está pendiente", async () => {
    const result = await inRollback(async (tx) => {
      const s = await createPortalScenario(tx, uniqueSuffix());
      const invited = await invitePortalContactInTransaction(tx, {
        empresaId: s.a.id,
        clienteId: s.c1.cliente.id,
        contactoId: s.c1.ana.id,
        now: t0,
      });
      if (!invited.ok) {
        throw new Error(invited.error);
      }

      return {
        propio: await findFlashPortalInvitation(tx, s.a.id, s.c1.cliente.id, invited.token, t1),
        otroCliente: await findFlashPortalInvitation(tx, s.a.id, s.c2.cliente.id, invited.token, t1),
        otraEmpresa: await findFlashPortalInvitation(tx, s.b.id, s.c1.cliente.id, invited.token, t1),
        caducado: await findFlashPortalInvitation(
          tx,
          s.a.id,
          s.c1.cliente.id,
          invited.token,
          new Date(t0.getTime() + INVITATION_DURATION_MS),
        ),
        malFormado: await findFlashPortalInvitation(tx, s.a.id, s.c1.cliente.id, "x", t1),
        ausente: await findFlashPortalInvitation(tx, s.a.id, s.c1.cliente.id, undefined, t1),
      };
    });

    expect(result.propio).toEqual({ contactoNombre: "Ana Uno" });
    expect(result.otroCliente).toBeNull();
    expect(result.otraEmpresa).toBeNull();
    expect(result.caducado).toBeNull();
    expect(result.malFormado).toBeNull();
    expect(result.ausente).toBeNull();
  });
});

describe("carreras de invitación", () => {
  it("dos contactos con el mismo email invitados a la vez: uno gana y el otro recibe email-en-uso", async () => {
    const db = getDb();
    const suffix = uniqueSuffix();
    const s = await db.$transaction((tx) => createPortalScenario(tx, suffix));

    try {
      // Mismo email en un contacto de C2 (los emails de contacto no son únicos).
      await db.contacto.update({
        where: { id: s.c2.beto.id },
        data: { email: s.c1.ana.email },
      });

      const results = await Promise.all([
        invitePortalContact(db, {
          empresaId: s.a.id,
          clienteId: s.c1.cliente.id,
          contactoId: s.c1.ana.id,
        }),
        invitePortalContact(db, {
          empresaId: s.a.id,
          clienteId: s.c2.cliente.id,
          contactoId: s.c2.beto.id,
        }),
      ]);

      const winners = results.filter((result) => result.ok);
      const losers = results.filter((result) => !result.ok);
      const usuarios = await db.usuario.count({ where: { email: s.c1.ana.email! } });

      expect(winners).toHaveLength(1);
      expect(losers).toEqual([{ ok: false, error: "email-en-uso" }]);
      expect(usuarios).toBe(1);
    } finally {
      await db.usuario.deleteMany({ where: { empresaId: { in: [s.a.id, s.b.id] } } });
      await db.contacto.deleteMany({ where: { empresaId: { in: [s.a.id, s.b.id] } } });
      await db.sede.deleteMany({ where: { empresaId: { in: [s.a.id, s.b.id] } } });
      await db.cliente.deleteMany({ where: { empresaId: { in: [s.a.id, s.b.id] } } });
      await db.empresa.deleteMany({ where: { id: { in: [s.a.id, s.b.id] } } });
      await db.plan.deleteMany({ where: { id: s.plan.id } });
    }
  });
});
