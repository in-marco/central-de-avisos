import { afterAll, describe, expect, it } from "vitest";
import { disconnectDb, getDb } from "@/db/client";
import { inRollback, uniqueSuffix } from "@/db/db-test-utils";
import { invitePortalContactInTransaction } from "@/lib/portal/invitaciones";
import {
  countPendingInvitations,
  createCompanyWithInvitation,
  createCompanyWithInvitationInTransaction,
  getCompanyDetail,
  listCompaniesWithInvitations,
} from "./companies";
import {
  getInvitationStatus,
  hashInvitationToken,
  INVITATION_DURATION_MS,
} from "./invitations";
import type { CompanyFormValues } from "./validation";

afterAll(async () => {
  await disconnectDb();
});

function companyValues(
  suffix: string,
  planId: string,
  overrides: Partial<CompanyFormValues> = {},
): CompanyFormValues {
  return {
    nombre: `Empresa ${suffix}`,
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

describe("alta de empresa con plan e invitación", () => {
  it("crea empresa, administrador INACTIVO e invitación con token hasheado", async () => {
    const suffix = uniqueSuffix();
    const now = new Date("2026-11-14T10:00:00.000Z");

    const result = await inRollback(async (tx) => {
      const plan = await tx.plan.create({
        data: { nombre: `Plan empresa ${suffix}`, importeMensual: "49.90" },
      });
      const values = companyValues(suffix, plan.id);
      const created = await createCompanyWithInvitationInTransaction(
        tx,
        values,
        { now },
      );

      if (!created.ok) {
        throw new Error(`Se esperaba el alta: ${created.error}`);
      }

      const empresa = await tx.empresa.findUnique({
        where: { id: created.empresaId },
        include: { plan: true },
      });
      const usuario = await tx.usuario.findUnique({
        where: { id: created.usuarioId },
      });
      const invitacion = await tx.invitacion.findUnique({
        where: { id: created.invitacionId },
      });
      const tie = await tx.invitacion.count({
        where: { empresaId: created.empresaId },
      });
      const detail = await getCompanyDetail(tx, created.empresaId);

      return {
        created,
        values,
        empresa,
        usuario,
        invitacion,
        tie,
        detail,
        now,
      };
    });

    expect(result.empresa?.nif).toBe(result.values.nif);
    expect(result.empresa?.direccionFiscal).toBe(
      "Calle Mayor 1, 28013 Madrid",
    );
    expect(result.empresa?.estado).toBe("ACTIVA");
    expect(result.empresa?.plan.nombre).toBe(`Plan empresa ${suffix}`);
    expect(result.usuario?.email).toBe(result.values.adminEmail);
    expect(result.usuario?.estado).toBe("INACTIVO");
    expect(result.usuario?.passwordHash).toBeNull();
    expect(result.usuario?.esSuperadmin).toBe(false);
    expect(result.usuario?.roles).toEqual(["ADMINISTRADOR"]);
    expect(result.usuario?.empresaId).toBe(result.created.empresaId);
    expect(result.invitacion?.tipo).toBe("ADMINISTRADOR_EMPRESA");
    expect(result.invitacion?.empresaId).toBe(result.created.empresaId);
    expect(result.invitacion?.usuarioId).toBe(result.created.usuarioId);
    expect(result.invitacion?.tokenHash).toBe(
      hashInvitationToken(result.created.token),
    );
    expect(result.invitacion?.tokenHash).not.toBe(result.created.token);
    expect(result.invitacion?.expiraEn.getTime()).toBe(
      result.now.getTime() + INVITATION_DURATION_MS,
    );
    expect(result.invitacion?.creadaEn.getTime()).toBe(result.now.getTime());
    expect(result.invitacion?.aceptadaEn).toBeNull();
    expect(result.tie).toBe(1);
    expect(result.detail?.invitaciones[0]?.usuario.email).toBe(
      result.values.adminEmail,
    );

    if (!result.invitacion) {
      throw new Error("Falta la invitación.");
    }

    expect(getInvitationStatus(result.invitacion, result.now)).toBe(
      "PENDIENTE",
    );
  });

  it("rechaza un NIF duplicado sin dejar filas parciales", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const plan = await tx.plan.create({
        data: { nombre: `Plan nif ${suffix}`, importeMensual: "10.00" },
      });
      const first = await createCompanyWithInvitationInTransaction(
        tx,
        companyValues(suffix, plan.id),
      );
      const second = await createCompanyWithInvitationInTransaction(
        tx,
        companyValues(`${suffix}-segunda`, plan.id, {
          nif: `B${suffix}`.slice(0, 20).toUpperCase(),
        }),
      );

      return {
        first,
        second,
        empresas: await tx.empresa.count({
          where: { planId: plan.id },
        }),
        usuarios: await tx.usuario.count({
          where: { email: { contains: suffix } },
        }),
        invitaciones: await tx.invitacion.count({
          where: { empresa: { planId: plan.id } },
        }),
      };
    });

    expect(result.first.ok).toBe(true);
    expect(result.second).toEqual({ ok: false, error: "nif" });
    expect(result.empresas).toBe(1);
    expect(result.usuarios).toBe(1);
    expect(result.invitaciones).toBe(1);
  });

  it("rechaza un email de administrador duplicado sin filas parciales", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const plan = await tx.plan.create({
        data: { nombre: `Plan email ${suffix}`, importeMensual: "10.00" },
      });
      const firstValues = companyValues(suffix, plan.id);
      const first = await createCompanyWithInvitationInTransaction(
        tx,
        firstValues,
      );
      const second = await createCompanyWithInvitationInTransaction(
        tx,
        companyValues(`${suffix}-segunda`, plan.id, {
          adminEmail: firstValues.adminEmail,
        }),
      );

      return {
        first,
        second,
        empresas: await tx.empresa.count({ where: { planId: plan.id } }),
        usuarios: await tx.usuario.count({
          where: { email: firstValues.adminEmail },
        }),
        invitaciones: await tx.invitacion.count({
          where: { empresa: { planId: plan.id } },
        }),
      };
    });

    expect(result.first.ok).toBe(true);
    expect(result.second).toEqual({ ok: false, error: "email" });
    expect(result.empresas).toBe(1);
    expect(result.usuarios).toBe(1);
    expect(result.invitaciones).toBe(1);
  });

  it("rechaza un plan inactivo o inexistente sin crear nada", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const inactive = await tx.plan.create({
        data: {
          nombre: `Plan inactivo ${suffix}`,
          importeMensual: "10.00",
          activo: false,
        },
      });

      const withInactive = await createCompanyWithInvitationInTransaction(
        tx,
        companyValues(`${suffix}-inactivo`, inactive.id),
      );
      const withMissing = await createCompanyWithInvitationInTransaction(
        tx,
        companyValues(
          `${suffix}-inexistente`,
          "00000000-0000-4000-8000-000000000000",
        ),
      );

      return {
        withInactive,
        withMissing,
        empresas: await tx.empresa.count({
          where: { nombre: { contains: suffix } },
        }),
      };
    });

    expect(result.withInactive).toEqual({ ok: false, error: "plan" });
    expect(result.withMissing).toEqual({ ok: false, error: "plan" });
    expect(result.empresas).toBe(0);
  });

  it("revierte empresa, usuario e invitación si falla la creación de la invitación", async () => {
    const db = getDb();
    const suffix = uniqueSuffix();
    const values = companyValues(suffix, "");
    const planIdPlaceholder = "00000000-0000-4000-8000-000000000000";
    values.planId = planIdPlaceholder;

    await expect(
      inRollback(async (tx) => {
        const plan = await tx.plan.create({
          data: { nombre: `Plan rollback ${suffix}`, importeMensual: "10.00" },
        });

        return createCompanyWithInvitationInTransaction(
          tx,
          { ...values, planId: plan.id },
          { invitationDurationMs: -1_000 },
        );
      }),
    ).rejects.toThrow();

    expect(await db.empresa.count({ where: { nif: values.nif } })).toBe(0);
    expect(
      await db.usuario.count({ where: { email: values.adminEmail } }),
    ).toBe(0);
  });

  it("lista empresas con plan e invitación y deriva el estado de la invitación", async () => {
    const db = getDb();
    const suffix = uniqueSuffix();
    const plan = await db.plan.create({
      data: { nombre: `Plan listado ${suffix}`, importeMensual: "10.00" },
    });

    try {
      const now = new Date("2026-11-14T10:00:00.000Z");
      const created = await createCompanyWithInvitation(
        db,
        companyValues(suffix, plan.id),
        { now },
      );

      if (!created.ok) {
        throw new Error(`Se esperaba el alta: ${created.error}`);
      }

      const list = await listCompaniesWithInvitations(db);
      const row = list.find((empresa) => empresa.id === created.empresaId);

      expect(row?.plan.nombre).toBe(`Plan listado ${suffix}`);
      expect(row?.invitaciones[0]?.usuario.email).toBe(
        `ana-${suffix}@example.com`,
      );

      if (!row?.invitaciones[0]) {
        throw new Error("Falta la invitación listada.");
      }

      expect(getInvitationStatus(row.invitaciones[0], now)).toBe("PENDIENTE");

      await db.invitacion.update({
        where: { id: created.invitacionId },
        data: { aceptadaEn: now },
      });

      const accepted = await db.invitacion.findUnique({
        where: { id: created.invitacionId },
      });

      if (!accepted) {
        throw new Error("Falta la invitación actualizada.");
      }

      expect(getInvitationStatus(accepted, now)).toBe("ACEPTADA");

      const expired = getInvitationStatus(
        accepted,
        new Date(accepted.expiraEn.getTime() + 1),
      );
      expect(expired).toBe("ACEPTADA");

      const pendingExpired = getInvitationStatus(
        { expiraEn: now, aceptadaEn: null },
        now,
      );
      expect(pendingExpired).toBe("CADUCADA");
    } finally {
      await db.invitacion.deleteMany({
        where: { empresa: { planId: plan.id } },
      });
      await db.usuario.deleteMany({ where: { empresa: { planId: plan.id } } });
      await db.empresa.deleteMany({ where: { planId: plan.id } });
      await db.plan.deleteMany({ where: { id: plan.id } });
    }
  });
});

describe("las vistas de proveedor ignoran el portal de cliente", () => {
  it("listado, detalle y contador de pendientes solo muestran la invitación de administrador", async () => {
    const suffix = uniqueSuffix();
    const createdAt = new Date("2026-11-14T10:00:00.000Z");
    const portalAt = new Date("2026-11-14T12:00:00.000Z");
    const now = new Date("2026-11-14T13:00:00.000Z");

    const result = await inRollback(async (tx) => {
      const plan = await tx.plan.create({
        data: { nombre: `Plan portal proveedor ${suffix}`, importeMensual: "10.00" },
      });
      const created = await createCompanyWithInvitationInTransaction(
        tx,
        companyValues(suffix, plan.id),
        { now: createdAt },
      );
      if (!created.ok) {
        throw new Error(created.error);
      }
      const cliente = await tx.cliente.create({
        data: {
          empresaId: created.empresaId,
          razonSocial: "Cliente portal",
          nif: "B12345678",
          direccionFacturacion: "Calle 1",
        },
      });
      const contacto = await tx.contacto.create({
        data: {
          empresaId: created.empresaId,
          clienteId: cliente.id,
          nombre: "Ana Contacto",
          email: `contacto-${suffix}@example.com`,
        },
      });

      const pendientesAntes = await countPendingInvitations(tx, now);
      const portal = await invitePortalContactInTransaction(tx, {
        empresaId: created.empresaId,
        clienteId: cliente.id,
        contactoId: contacto.id,
        now: portalAt,
      });
      if (!portal.ok) {
        throw new Error(portal.error);
      }
      const pendientesDespues = await countPendingInvitations(tx, now);
      const list = await listCompaniesWithInvitations(tx);
      const detail = await getCompanyDetail(tx, created.empresaId);

      return {
        created,
        portal,
        pendientesAntes,
        pendientesDespues,
        row: list.find((empresa) => empresa.id === created.empresaId),
        detail,
      };
    });

    expect(result.pendientesDespues).toBe(result.pendientesAntes);
    expect(result.row?.invitaciones).toHaveLength(1);
    expect(result.row?.invitaciones[0]?.id).toBe(result.created.invitacionId);
    expect(result.detail?.invitaciones.map((invitacion) => invitacion.id)).toEqual([
      result.created.invitacionId,
    ]);
    expect(result.detail?.usuarios.map((usuario) => usuario.id)).toEqual([
      result.created.usuarioId,
    ]);
  });
});
