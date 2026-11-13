import { afterAll, describe, expect, it } from "vitest";
import { disconnectDb, getDb } from "./client";
import { inRollback, uniqueSuffix } from "./db-test-utils";

const MISSING_EMPRESA_ID = "00000000-0000-4000-8000-000000000000";

afterAll(async () => {
  await disconnectDb();
});

describe("esquema base", () => {
  it("crea las tablas planes, empresas y usuarios", async () => {
    const rows = await getDb().$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('planes', 'empresas', 'usuarios')
      ORDER BY table_name
    `;

    expect(rows.map((row) => row.table_name)).toEqual([
      "empresas",
      "planes",
      "usuarios",
    ]);
  });

  it("incluye los CHECK de importe, email y coherencia superadmin/empresa", async () => {
    const rows = await getDb().$queryRaw<Array<{ conname: string }>>`
      SELECT conname
      FROM pg_constraint
      WHERE conname IN (
        'planes_importe_mensual_no_negativo',
        'usuarios_email_normalizado',
        'usuarios_superadmin_empresa_coherente'
      )
      ORDER BY conname
    `;

    expect(rows.map((row) => row.conname)).toEqual([
      "planes_importe_mensual_no_negativo",
      "usuarios_email_normalizado",
      "usuarios_superadmin_empresa_coherente",
    ]);
  });

  it("aplica defaults y crea un usuario de empresa válido", async () => {
    const suffix = uniqueSuffix();

    const { plan, empresa, usuario } = await inRollback(async (tx) => {
      const plan = await tx.plan.create({
        data: {
          nombre: `Plan ${suffix}`,
          importeMensual: "49.90",
        },
      });

      const empresa = await tx.empresa.create({
        data: {
          nombre: `Empresa ${suffix}`,
          nif: `B${suffix}`,
          emailFacturacion: `facturacion-${suffix}@example.com`,
          planId: plan.id,
        },
      });

      const usuario = await tx.usuario.create({
        data: {
          empresaId: empresa.id,
          email: `usuario-${suffix}@example.com`,
          nombre: "Usuario de empresa",
        },
      });

      return { plan, empresa, usuario };
    });

    expect(plan.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(plan.importeMensual.toString()).toBe("49.9");
    expect(plan.activo).toBe(true);
    expect(empresa.estado).toBe("ACTIVA");
    expect(usuario.estado).toBe("ACTIVO");
    expect(usuario.esSuperadmin).toBe(false);
    expect(usuario.empresaId).toBe(empresa.id);
    expect(usuario.creadoEn).toBeInstanceOf(Date);
    expect(usuario.actualizadoEn).toBeInstanceOf(Date);
  });

  it("rechaza un importe mensual negativo", async () => {
    const suffix = uniqueSuffix();

    await expect(
      getDb().plan.create({
        data: {
          nombre: `Plan negativo ${suffix}`,
          importeMensual: "-0.01",
        },
      }),
    ).rejects.toThrow();
  });

  it("rechaza un email no normalizado", async () => {
    const suffix = uniqueSuffix();

    await expect(
      inRollback(async (tx) => {
        const plan = await tx.plan.create({
          data: { nombre: `Plan email ${suffix}`, importeMensual: "10.00" },
        });
        const empresa = await tx.empresa.create({
          data: {
            nombre: `Empresa email ${suffix}`,
            nif: `E${suffix}`,
            emailFacturacion: `facturacion-email-${suffix}@example.com`,
            planId: plan.id,
          },
        });

        return tx.usuario.create({
          data: {
            empresaId: empresa.id,
            email: `  Usuario-${suffix}@Example.COM  `,
            nombre: "Email con mayúsculas y espacios",
          },
        });
      }),
    ).rejects.toThrow();
  });

  it("rechaza un usuario no superadmin sin empresa_id", async () => {
    const suffix = uniqueSuffix();

    await expect(
      getDb().usuario.create({
        data: {
          email: `sin-empresa-${suffix}@example.com`,
          nombre: "Sin empresa",
          esSuperadmin: false,
          empresaId: null,
        },
      }),
    ).rejects.toThrow();
  });

  it("rechaza un superadmin con empresa_id", async () => {
    const suffix = uniqueSuffix();

    await expect(
      inRollback(async (tx) => {
        const plan = await tx.plan.create({
          data: { nombre: `Plan superadmin ${suffix}`, importeMensual: "10.00" },
        });
        const empresa = await tx.empresa.create({
          data: {
            nombre: `Empresa superadmin ${suffix}`,
            nif: `S${suffix}`,
            emailFacturacion: `facturacion-superadmin-${suffix}@example.com`,
            planId: plan.id,
          },
        });

        return tx.usuario.create({
          data: {
            empresaId: empresa.id,
            email: `superadmin-${suffix}@example.com`,
            nombre: "Superadmin con empresa",
            esSuperadmin: true,
          },
        });
      }),
    ).rejects.toThrow();
  });

  it("rechaza un usuario con una empresa inexistente", async () => {
    const suffix = uniqueSuffix();

    await expect(
      getDb().usuario.create({
        data: {
          empresaId: MISSING_EMPRESA_ID,
          email: `empresa-inexistente-${suffix}@example.com`,
          nombre: "Empresa inexistente",
        },
      }),
    ).rejects.toThrow();
  });

  it("rechaza un email duplicado", async () => {
    const suffix = uniqueSuffix();

    await expect(
      inRollback(async (tx) => {
        const plan = await tx.plan.create({
          data: { nombre: `Plan duplicado ${suffix}`, importeMensual: "10.00" },
        });
        const empresa = await tx.empresa.create({
          data: {
            nombre: `Empresa duplicada ${suffix}`,
            nif: `D${suffix}`,
            emailFacturacion: `facturacion-duplicada-${suffix}@example.com`,
            planId: plan.id,
          },
        });
        const email = `duplicado-${suffix}@example.com`;

        await tx.usuario.create({
          data: { empresaId: empresa.id, email, nombre: "Primero" },
        });

        return tx.usuario.create({
          data: { empresaId: empresa.id, email, nombre: "Segundo" },
        });
      }),
    ).rejects.toThrow();
  });

  it("impide borrar un plan con empresas asociadas (FK Restrict)", async () => {
    const suffix = uniqueSuffix();

    await expect(
      inRollback(async (tx) => {
        const plan = await tx.plan.create({
          data: { nombre: `Plan protegido ${suffix}`, importeMensual: "10.00" },
        });
        await tx.empresa.create({
          data: {
            nombre: `Empresa protegida ${suffix}`,
            nif: `R${suffix}`,
            emailFacturacion: `facturacion-protegida-${suffix}@example.com`,
            planId: plan.id,
          },
        });

        return tx.plan.delete({ where: { id: plan.id } });
      }),
    ).rejects.toThrow();
  });
});
