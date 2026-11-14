import { afterAll, describe, expect, it } from "vitest";
import { disconnectDb, getDb } from "./client";
import { inRollback, uniqueSuffix } from "./db-test-utils";

const MISSING_EMPRESA_ID = "00000000-0000-4000-8000-000000000000";

afterAll(async () => {
  await disconnectDb();
});

describe("esquema base", () => {
  it("crea las tablas planes, empresas, usuarios y sesiones", async () => {
    const rows = await getDb().$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('planes', 'empresas', 'usuarios', 'sesiones')
      ORDER BY table_name
    `;

    expect(rows.map((row) => row.table_name)).toEqual([
      "empresas",
      "planes",
      "sesiones",
      "usuarios",
    ]);
  });

  it("incluye columnas de password_hash y sesiones, FK e índices", async () => {
    const columns = await getDb().$queryRaw<
      Array<{ table_name: string; column_name: string; is_nullable: string }>
    >`
      SELECT table_name, column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'usuarios' AND column_name = 'password_hash')
          OR (
            table_name = 'sesiones'
            AND column_name IN (
              'usuario_id',
              'token_hash',
              'creado_en',
              'expira_en',
              'revocada_en'
            )
          )
        )
      ORDER BY table_name, column_name
    `;

    expect(columns).toEqual([
      { table_name: "sesiones", column_name: "creado_en", is_nullable: "NO" },
      { table_name: "sesiones", column_name: "expira_en", is_nullable: "NO" },
      { table_name: "sesiones", column_name: "revocada_en", is_nullable: "YES" },
      { table_name: "sesiones", column_name: "token_hash", is_nullable: "NO" },
      { table_name: "sesiones", column_name: "usuario_id", is_nullable: "NO" },
      { table_name: "usuarios", column_name: "password_hash", is_nullable: "YES" },
    ]);

    const indexes = await getDb().$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'sesiones_token_hash_key',
          'sesiones_usuario_id_idx',
          'sesiones_expira_en_idx'
        )
      ORDER BY indexname
    `;

    expect(indexes.map((row) => row.indexname)).toEqual([
      "sesiones_expira_en_idx",
      "sesiones_token_hash_key",
      "sesiones_usuario_id_idx",
    ]);

    const foreignKeys = await getDb().$queryRaw<Array<{ conname: string; confdeltype: string }>>`
      SELECT conname, confdeltype::text AS confdeltype
      FROM pg_constraint
      WHERE conname = 'sesiones_usuario_id_fkey'
    `;

    expect(foreignKeys).toEqual([
      { conname: "sesiones_usuario_id_fkey", confdeltype: "c" },
    ]);
  });

  it("incluye los CHECK de importe, email, coherencia y expiración", async () => {
    const rows = await getDb().$queryRaw<Array<{ conname: string }>>`
      SELECT conname
      FROM pg_constraint
      WHERE conname IN (
        'planes_importe_mensual_no_negativo',
        'sesiones_expiracion_posterior',
        'usuarios_email_normalizado',
        'usuarios_superadmin_empresa_coherente'
      )
      ORDER BY conname
    `;

    expect(rows.map((row) => row.conname)).toEqual([
      "planes_importe_mensual_no_negativo",
      "sesiones_expiracion_posterior",
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

  it("guarda password_hash nullable y crea una sesión válida", async () => {
    const suffix = uniqueSuffix();

    const { usuario, sinPassword, sesion } = await inRollback(async (tx) => {
      const plan = await tx.plan.create({
        data: { nombre: `Plan sesión ${suffix}`, importeMensual: "10.00" },
      });
      const empresa = await tx.empresa.create({
        data: {
          nombre: `Empresa sesión ${suffix}`,
          nif: `S${suffix}`,
          emailFacturacion: `facturacion-sesion-${suffix}@example.com`,
          planId: plan.id,
        },
      });

      const usuario = await tx.usuario.create({
        data: {
          empresaId: empresa.id,
          email: `con-password-${suffix}@example.com`,
          nombre: "Con contraseña",
          passwordHash: `scrypt$v=1$hash-${suffix}`,
        },
      });

      const sinPassword = await tx.usuario.create({
        data: {
          empresaId: empresa.id,
          email: `sin-password-${suffix}@example.com`,
          nombre: "Invitado sin contraseña",
        },
      });

      const sesion = await tx.sesion.create({
        data: {
          usuarioId: usuario.id,
          tokenHash: `token-hash-${suffix}`,
          expiraEn: new Date(Date.now() + 60_000),
        },
      });

      return { usuario, sinPassword, sesion };
    });

    expect(usuario.passwordHash).toContain("scrypt$v=1$");
    expect(sinPassword.passwordHash).toBeNull();
    expect(sesion.revocadaEn).toBeNull();
    expect(sesion.creadaEn).toBeInstanceOf(Date);
    expect(sesion.expiraEn.getTime()).toBeGreaterThan(sesion.creadaEn.getTime());
  });

  it("rechaza una sesión que expira antes de crearse", async () => {
    const suffix = uniqueSuffix();

    await expect(
      inRollback(async (tx) => {
        const usuario = await tx.usuario.create({
          data: {
            empresaId: null,
            email: `superadmin-expirado-${suffix}@example.com`,
            nombre: "Superadmin expirado",
            esSuperadmin: true,
          },
        });

        return tx.sesion.create({
          data: {
            usuarioId: usuario.id,
            tokenHash: `token-expirado-${suffix}`,
            expiraEn: new Date("2000-01-01T00:00:00.000Z"),
          },
        });
      }),
    ).rejects.toThrow();
  });

  it("exige token_hash único", async () => {
    const suffix = uniqueSuffix();

    await expect(
      inRollback(async (tx) => {
        const usuario = await tx.usuario.create({
          data: {
            empresaId: null,
            email: `superadmin-duplicado-${suffix}@example.com`,
            nombre: "Superadmin duplicado",
            esSuperadmin: true,
          },
        });
        const tokenHash = `token-duplicado-${suffix}`;
        const expiraEn = new Date(Date.now() + 60_000);

        await tx.sesion.create({
          data: { usuarioId: usuario.id, tokenHash, expiraEn },
        });
        return tx.sesion.create({
          data: { usuarioId: usuario.id, tokenHash, expiraEn },
        });
      }),
    ).rejects.toThrow();
  });

  it("borra las sesiones en cascada al borrar el usuario", async () => {
    const suffix = uniqueSuffix();

    const sesionesRestantes = await inRollback(async (tx) => {
      const usuario = await tx.usuario.create({
        data: {
          empresaId: null,
          email: `superadmin-cascada-${suffix}@example.com`,
          nombre: "Superadmin cascada",
          esSuperadmin: true,
        },
      });
      await tx.sesion.create({
        data: {
          usuarioId: usuario.id,
          tokenHash: `token-cascada-${suffix}`,
          expiraEn: new Date(Date.now() + 60_000),
        },
      });

      await tx.usuario.delete({ where: { id: usuario.id } });

      return tx.sesion.count({ where: { usuarioId: usuario.id } });
    });

    expect(sesionesRestantes).toBe(0);
  });
});
