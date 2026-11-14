import { afterAll, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { disconnectDb, getDb } from "./client";
import { inRollback, uniqueSuffix } from "./db-test-utils";

const MISSING_EMPRESA_ID = "00000000-0000-4000-8000-000000000000";

afterAll(async () => {
  await disconnectDb();
});

describe("esquema base", () => {
  it("crea las tablas planes, empresas, usuarios, sesiones e invitaciones", async () => {
    const rows = await getDb().$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('planes', 'empresas', 'usuarios', 'sesiones', 'invitaciones')
      ORDER BY table_name
    `;

    expect(rows.map((row) => row.table_name)).toEqual([
      "empresas",
      "invitaciones",
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
          OR (table_name = 'empresas' AND column_name = 'direccion_fiscal')
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
          OR (
            table_name = 'invitaciones'
            AND column_name IN (
              'empresa_id',
              'usuario_id',
              'tipo',
              'token_hash',
              'creado_en',
              'expira_en',
              'aceptada_en'
            )
          )
        )
      ORDER BY table_name, column_name
    `;

    expect(columns).toEqual([
      { table_name: "empresas", column_name: "direccion_fiscal", is_nullable: "YES" },
      { table_name: "invitaciones", column_name: "aceptada_en", is_nullable: "YES" },
      { table_name: "invitaciones", column_name: "creado_en", is_nullable: "NO" },
      { table_name: "invitaciones", column_name: "empresa_id", is_nullable: "NO" },
      { table_name: "invitaciones", column_name: "expira_en", is_nullable: "NO" },
      { table_name: "invitaciones", column_name: "tipo", is_nullable: "NO" },
      { table_name: "invitaciones", column_name: "token_hash", is_nullable: "NO" },
      { table_name: "invitaciones", column_name: "usuario_id", is_nullable: "NO" },
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
          'sesiones_expira_en_idx',
          'invitaciones_token_hash_key',
          'invitaciones_empresa_id_idx',
          'invitaciones_usuario_id_idx',
          'invitaciones_expira_en_idx'
        )
      ORDER BY indexname
    `;

    expect(indexes.map((row) => row.indexname)).toEqual([
      "invitaciones_empresa_id_idx",
      "invitaciones_expira_en_idx",
      "invitaciones_token_hash_key",
      "invitaciones_usuario_id_idx",
      "sesiones_expira_en_idx",
      "sesiones_token_hash_key",
      "sesiones_usuario_id_idx",
    ]);

    const foreignKeys = await getDb().$queryRaw<Array<{ conname: string; confdeltype: string }>>`
      SELECT conname, confdeltype::text AS confdeltype
      FROM pg_constraint
      WHERE conname IN (
        'sesiones_usuario_id_fkey',
        'invitaciones_empresa_id_fkey',
        'invitaciones_usuario_id_fkey'
      )
      ORDER BY conname
    `;

    expect(foreignKeys).toEqual([
      { conname: "invitaciones_empresa_id_fkey", confdeltype: "r" },
      { conname: "invitaciones_usuario_id_fkey", confdeltype: "c" },
      { conname: "sesiones_usuario_id_fkey", confdeltype: "c" },
    ]);
  });

  it("incluye los CHECK de importe, email, coherencia y expiración", async () => {
    const rows = await getDb().$queryRaw<Array<{ conname: string }>>`
      SELECT conname
      FROM pg_constraint
      WHERE conname IN (
        'empresas_nif_normalizado',
        'invitaciones_aceptacion_posterior',
        'invitaciones_expiracion_posterior',
        'planes_importe_mensual_no_negativo',
        'sesiones_expiracion_posterior',
        'usuarios_email_normalizado',
        'usuarios_roles_sin_nulos',
        'usuarios_superadmin_empresa_coherente',
        'usuarios_superadmin_sin_roles'
      )
      ORDER BY conname
    `;

    expect(rows.map((row) => row.conname)).toEqual([
      "empresas_nif_normalizado",
      "invitaciones_aceptacion_posterior",
      "invitaciones_expiracion_posterior",
      "planes_importe_mensual_no_negativo",
      "sesiones_expiracion_posterior",
      "usuarios_email_normalizado",
      "usuarios_roles_sin_nulos",
      "usuarios_superadmin_empresa_coherente",
      "usuarios_superadmin_sin_roles",
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
          nif: `B${suffix.toUpperCase()}`,
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
    expect(usuario.roles).toEqual([]);
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
            nif: `E${suffix.toUpperCase()}`,
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
            nif: `S${suffix.toUpperCase()}`,
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
            nif: `D${suffix.toUpperCase()}`,
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
            nif: `R${suffix.toUpperCase()}`,
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
          nif: `S${suffix.toUpperCase()}`,
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

  it("exige NIF normalizado en empresas", async () => {
    const suffix = uniqueSuffix();

    await expect(
      inRollback(async (tx) => {
        const plan = await tx.plan.create({
          data: { nombre: `Plan nif ${suffix}`, importeMensual: "10.00" },
        });

        return tx.empresa.create({
          data: {
            nombre: `Empresa nif ${suffix}`,
            nif: ` b${suffix} `,
            emailFacturacion: `facturacion-nif-${suffix}@example.com`,
            planId: plan.id,
          },
        });
      }),
    ).rejects.toThrow();
  });

  it("valida la expiración y la aceptación de invitaciones", async () => {
    const suffix = uniqueSuffix();

    await expect(
      inRollback(async (tx) => {
        const plan = await tx.plan.create({
          data: { nombre: `Plan invitación ${suffix}`, importeMensual: "10.00" },
        });
        const empresa = await tx.empresa.create({
          data: {
            nombre: `Empresa invitación ${suffix}`,
            nif: `I${suffix.toUpperCase()}`,
            emailFacturacion: `facturacion-invitacion-${suffix}@example.com`,
            planId: plan.id,
          },
        });
        const usuario = await tx.usuario.create({
          data: {
            empresaId: empresa.id,
            email: `invitado-${suffix}@example.com`,
            nombre: "Invitado",
            estado: "INACTIVO",
          },
        });
        const creadaEn = new Date("2026-11-14T10:00:00.000Z");

        return tx.invitacion.create({
          data: {
            empresaId: empresa.id,
            usuarioId: usuario.id,
            tokenHash: `invitacion-expirada-${suffix}`,
            creadaEn,
            expiraEn: new Date(creadaEn.getTime() - 1_000),
          },
        });
      }),
    ).rejects.toThrow();

    await expect(
      inRollback(async (tx) => {
        const plan = await tx.plan.create({
          data: { nombre: `Plan aceptada ${suffix}`, importeMensual: "10.00" },
        });
        const empresa = await tx.empresa.create({
          data: {
            nombre: `Empresa aceptada ${suffix}`,
            nif: `J${suffix.toUpperCase()}`,
            emailFacturacion: `facturacion-aceptada-${suffix}@example.com`,
            planId: plan.id,
          },
        });
        const usuario = await tx.usuario.create({
          data: {
            empresaId: empresa.id,
            email: `aceptada-${suffix}@example.com`,
            nombre: "Invitado",
            estado: "INACTIVO",
          },
        });
        const creadaEn = new Date("2026-11-14T10:00:00.000Z");

        return tx.invitacion.create({
          data: {
            empresaId: empresa.id,
            usuarioId: usuario.id,
            tokenHash: `invitacion-aceptada-${suffix}`,
            creadaEn,
            expiraEn: new Date(creadaEn.getTime() + 60_000),
            aceptadaEn: new Date(creadaEn.getTime() - 1_000),
          },
        });
      }),
    ).rejects.toThrow();
  });

  it("exige token_hash único en invitaciones", async () => {
    const suffix = uniqueSuffix();

    await expect(
      inRollback(async (tx) => {
        const plan = await tx.plan.create({
          data: { nombre: `Plan token ${suffix}`, importeMensual: "10.00" },
        });
        const empresa = await tx.empresa.create({
          data: {
            nombre: `Empresa token ${suffix}`,
            nif: `K${suffix.toUpperCase()}`,
            emailFacturacion: `facturacion-token-${suffix}@example.com`,
            planId: plan.id,
          },
        });
        const usuario = await tx.usuario.create({
          data: {
            empresaId: empresa.id,
            email: `token-${suffix}@example.com`,
            nombre: "Invitado",
            estado: "INACTIVO",
          },
        });
        const creadaEn = new Date();
        const expiraEn = new Date(creadaEn.getTime() + 60_000);
        const tokenHash = `invitacion-token-${suffix}`;

        await tx.invitacion.create({
          data: {
            empresaId: empresa.id,
            usuarioId: usuario.id,
            tokenHash,
            creadaEn,
            expiraEn,
          },
        });

        return tx.invitacion.create({
          data: {
            empresaId: empresa.id,
            usuarioId: usuario.id,
            tokenHash,
            creadaEn,
            expiraEn,
          },
        });
      }),
    ).rejects.toThrow();
  });

  it("borra las invitaciones en cascada al borrar el usuario", async () => {
    const suffix = uniqueSuffix();

    const restantes = await inRollback(async (tx) => {
      const plan = await tx.plan.create({
        data: { nombre: `Plan cascada ${suffix}`, importeMensual: "10.00" },
      });
      const empresa = await tx.empresa.create({
        data: {
          nombre: `Empresa cascada ${suffix}`,
          nif: `L${suffix.toUpperCase()}`,
          emailFacturacion: `facturacion-cascada-${suffix}@example.com`,
          planId: plan.id,
        },
      });
      const usuario = await tx.usuario.create({
        data: {
          empresaId: empresa.id,
          email: `cascada-${suffix}@example.com`,
          nombre: "Invitado",
          estado: "INACTIVO",
        },
      });
      const creadaEn = new Date();

      await tx.invitacion.create({
        data: {
          empresaId: empresa.id,
          usuarioId: usuario.id,
          tokenHash: `invitacion-cascada-${suffix}`,
          creadaEn,
          expiraEn: new Date(creadaEn.getTime() + 60_000),
        },
      });

      await tx.usuario.delete({ where: { id: usuario.id } });

      return tx.invitacion.count({ where: { usuarioId: usuario.id } });
    });

    expect(restantes).toBe(0);
  });
});

describe("roles de usuario", () => {
  it("la columna roles es rol_usuario[] NOT NULL con default vacío", async () => {
    const rows = await getDb().$queryRaw<
      Array<{ udt_name: string; is_nullable: string; column_default: string | null }>
    >`
      SELECT udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'usuarios'
        AND column_name = 'roles'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.udt_name).toBe("_rol_usuario");
    expect(rows[0]?.is_nullable).toBe("NO");
    expect(rows[0]?.column_default).toContain("ARRAY[]");

    const labels = await getDb().$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'rol_usuario'
      ORDER BY e.enumsortorder
    `;

    expect(labels.map((row) => row.enumlabel)).toEqual([
      "ADMINISTRADOR",
      "OFICINA",
      "TECNICO",
    ]);
  });

  it("guarda roles combinados en un usuario de empresa", async () => {
    const suffix = uniqueSuffix();

    const usuario = await inRollback(async (tx) => {
      const plan = await tx.plan.create({
        data: { nombre: `Plan roles ${suffix}`, importeMensual: "10.00" },
      });
      const empresa = await tx.empresa.create({
        data: {
          nombre: `Empresa roles ${suffix}`,
          nif: `R${suffix.toUpperCase()}`,
          emailFacturacion: `facturacion-roles-${suffix}@example.com`,
          planId: plan.id,
        },
      });

      return tx.usuario.create({
        data: {
          empresaId: empresa.id,
          email: `roles-${suffix}@example.com`,
          nombre: "Encargado",
          roles: ["ADMINISTRADOR", "TECNICO"],
        },
      });
    });

    expect(usuario.roles).toEqual(["ADMINISTRADOR", "TECNICO"]);
  });

  it("rechaza un superadmin con roles (usuarios_superadmin_sin_roles)", async () => {
    const suffix = uniqueSuffix();

    await expect(
      getDb().usuario.create({
        data: {
          empresaId: null,
          email: `superadmin-roles-${suffix}@example.com`,
          nombre: "Superadmin con roles",
          esSuperadmin: true,
          roles: ["ADMINISTRADOR"],
        },
      }),
    ).rejects.toThrow();

    const superadmin = await inRollback((tx) =>
      tx.usuario.create({
        data: {
          empresaId: null,
          email: `superadmin-sin-roles-${suffix}@example.com`,
          nombre: "Superadmin sin roles",
          esSuperadmin: true,
        },
      }),
    );

    expect(superadmin.roles).toEqual([]);
  });

  it("rechaza un elemento nulo en roles (usuarios_roles_sin_nulos)", async () => {
    const suffix = uniqueSuffix();

    await expect(
      inRollback(async (tx) => {
        const plan = await tx.plan.create({
          data: { nombre: `Plan nulos ${suffix}`, importeMensual: "10.00" },
        });
        const empresa = await tx.empresa.create({
          data: {
            nombre: `Empresa nulos ${suffix}`,
            nif: `N${suffix.toUpperCase()}`,
            emailFacturacion: `facturacion-nulos-${suffix}@example.com`,
            planId: plan.id,
          },
        });
        const usuario = await tx.usuario.create({
          data: {
            empresaId: empresa.id,
            email: `nulos-${suffix}@example.com`,
            nombre: "Roles con nulo",
          },
        });

        return tx.$executeRaw`
          UPDATE usuarios
          SET roles = ARRAY['OFICINA', NULL]::rol_usuario[]
          WHERE id = ${usuario.id}::uuid
        `;
      }),
    ).rejects.toThrow();
  });
});

describe("configuración de facturación de empresas", () => {
  it("añade serie_factura, tarifa_horaria y modo_fiscal con su tipo y default", async () => {
    const rows = await getDb().$queryRaw<
      Array<{
        column_name: string;
        data_type: string;
        udt_name: string;
        is_nullable: string;
        column_default: string | null;
        numeric_precision: number | null;
        numeric_scale: number | null;
      }>
    >`
      SELECT column_name, data_type, udt_name, is_nullable, column_default,
             numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'empresas'
        AND column_name IN ('serie_factura', 'tarifa_horaria', 'modo_fiscal')
      ORDER BY column_name
    `;

    expect(rows).toHaveLength(3);
    const [modo, serie, tarifa] = rows;

    expect(modo).toMatchObject({
      column_name: "modo_fiscal",
      udt_name: "modo_fiscal",
      is_nullable: "NO",
    });
    expect(modo?.column_default).toContain("NO_VERIFACTU");
    expect(serie).toMatchObject({
      column_name: "serie_factura",
      data_type: "text",
      is_nullable: "YES",
      column_default: null,
    });
    expect(tarifa).toMatchObject({
      column_name: "tarifa_horaria",
      data_type: "numeric",
      is_nullable: "YES",
      numeric_precision: 10,
      numeric_scale: 2,
    });

    const labels = await getDb().$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'modo_fiscal'
      ORDER BY e.enumsortorder
    `;

    expect(labels.map((row) => row.enumlabel)).toEqual(["NO_VERIFACTU"]);
  });

  it("incluye los CHECK de formato de serie y tarifa positiva", async () => {
    const rows = await getDb().$queryRaw<Array<{ conname: string }>>`
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'empresas'::regclass
        AND contype = 'c'
        AND conname IN (
          'empresas_serie_factura_formato',
          'empresas_tarifa_horaria_positiva'
        )
      ORDER BY conname
    `;

    expect(rows.map((row) => row.conname)).toEqual([
      "empresas_serie_factura_formato",
      "empresas_tarifa_horaria_positiva",
    ]);
  });

  function empresaConFacturacion(data: {
    serieFactura?: string;
    tarifaHoraria?: string;
  }) {
    const suffix = uniqueSuffix();

    return inRollback(async (tx) => {
      const plan = await tx.plan.create({
        data: { nombre: `Plan facturación ${suffix}`, importeMensual: "10.00" },
      });

      return tx.empresa.create({
        data: {
          nombre: `Empresa facturación ${suffix}`,
          nif: `FAC${suffix.toUpperCase()}`,
          emailFacturacion: `facturacion-fac-${suffix}@example.com`,
          planId: plan.id,
          ...data,
        },
      });
    });
  }

  it("acepta una serie normalizada y una tarifa positiva", async () => {
    const empresa = await empresaConFacturacion({
      serieFactura: "F-2026",
      tarifaHoraria: "45.00",
    });

    expect(empresa.serieFactura).toBe("F-2026");
    expect(empresa.tarifaHoraria?.toFixed(2)).toBe("45.00");
    expect(empresa.modoFiscal).toBe("NO_VERIFACTU");
  });

  it.each([["f"], ["F 1"], ["-F"], ["F/1"], ["ABCDEFGHIJK"], [""]])(
    "rechaza la serie %j",
    async (serieFactura) => {
      await expect(empresaConFacturacion({ serieFactura })).rejects.toThrow();
    },
  );

  it.each([["0"], ["-5.00"]])("rechaza la tarifa %s", async (tarifaHoraria) => {
    await expect(empresaConFacturacion({ tarifaHoraria })).rejects.toThrow();
  });

  it("rechaza un modo fiscal fuera del enum", async () => {
    const suffix = uniqueSuffix();

    await expect(
      inRollback(async (tx) => {
        const plan = await tx.plan.create({
          data: { nombre: `Plan modo ${suffix}`, importeMensual: "10.00" },
        });
        const empresa = await tx.empresa.create({
          data: {
            nombre: `Empresa modo ${suffix}`,
            nif: `MOD${suffix.toUpperCase()}`,
            emailFacturacion: `facturacion-modo-${suffix}@example.com`,
            planId: plan.id,
          },
        });

        return tx.$executeRaw`
          UPDATE empresas SET modo_fiscal = 'VERIFACTU' WHERE id = ${empresa.id}::uuid
        `;
      }),
    ).rejects.toThrow();
  });
});

describe("clientes, sedes y contactos", () => {
  async function dosEmpresas(tx: Prisma.TransactionClient, suffix: string) {
    const plan = await tx.plan.create({
      data: { nombre: `Plan clientes esquema ${suffix}`, importeMensual: "10.00" },
    });
    const crear = (tag: string) =>
      tx.empresa.create({
        data: {
          nombre: `Empresa ${tag} ${suffix}`,
          nif: `${tag}${suffix.toUpperCase()}`,
          emailFacturacion: `facturacion-${tag.toLowerCase()}-${suffix}@example.com`,
          planId: plan.id,
        },
      });
    const a = await crear("SA");
    const b = await crear("SB");
    const cliente = await tx.cliente.create({
      data: {
        empresaId: a.id,
        razonSocial: "Cliente esquema",
        nif: "B12345678",
        direccionFacturacion: "Dirección",
      },
    });
    const sede = await tx.sede.create({
      data: { empresaId: a.id, clienteId: cliente.id, nombre: "Sede", direccion: "Dir" },
    });

    return { a, b, cliente, sede };
  }

  it("sedes no tiene datos fiscales: la factura irá al cliente", async () => {
    const rows = await getDb().$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('clientes', 'sedes', 'contactos')
      ORDER BY table_name, ordinal_position
    `;
    const columnas = (tabla: string) =>
      rows.filter((row) => row.table_name === tabla).map((row) => row.column_name);

    expect(columnas("clientes")).toEqual([
      "id",
      "empresa_id",
      "razon_social",
      "nif",
      "direccion_facturacion",
      "tarifa_horaria",
      "creado_en",
      "actualizado_en",
    ]);
    expect(columnas("sedes")).toEqual([
      "id",
      "empresa_id",
      "cliente_id",
      "nombre",
      "direccion",
      "creado_en",
      "actualizado_en",
    ]);
    expect(columnas("contactos")).toEqual([
      "id",
      "empresa_id",
      "cliente_id",
      "sede_id",
      "nombre",
      "telefono",
      "email",
      "creado_en",
      "actualizado_en",
    ]);
    for (const fiscal of ["nif", "razon_social", "direccion_facturacion"]) {
      expect(columnas("sedes")).not.toContain(fiscal);
      expect(columnas("contactos")).not.toContain(fiscal);
    }
  });

  it("incluye CHECK, FK compuestos e índices únicos", async () => {
    const checks = await getDb().$queryRaw<Array<{ conname: string }>>`
      SELECT conname FROM pg_constraint
      WHERE conname IN (
        'clientes_nif_normalizado',
        'clientes_tarifa_no_negativa',
        'contactos_email_normalizado',
        'contactos_telefono_o_email'
      )
      ORDER BY conname
    `;
    expect(checks.map((row) => row.conname)).toEqual([
      "clientes_nif_normalizado",
      "clientes_tarifa_no_negativa",
      "contactos_email_normalizado",
      "contactos_telefono_o_email",
    ]);

    const fks = await getDb().$queryRaw<
      Array<{ conname: string; confdeltype: string; columnas: number }>
    >`
      SELECT conname, confdeltype::text AS confdeltype, cardinality(conkey)::int AS columnas
      FROM pg_constraint
      WHERE conname IN (
        'clientes_empresa_id_fkey',
        'sedes_cliente_id_empresa_id_fkey',
        'contactos_cliente_id_empresa_id_fkey',
        'contactos_sede_id_fkey'
      )
      ORDER BY conname
    `;
    expect(fks).toEqual([
      { conname: "clientes_empresa_id_fkey", confdeltype: "r", columnas: 1 },
      { conname: "contactos_cliente_id_empresa_id_fkey", confdeltype: "r", columnas: 2 },
      { conname: "contactos_sede_id_fkey", confdeltype: "r", columnas: 1 },
      { conname: "sedes_cliente_id_empresa_id_fkey", confdeltype: "r", columnas: 2 },
    ]);

    const indexes = await getDb().$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename IN ('clientes', 'sedes', 'contactos')
      ORDER BY indexname
    `;
    expect(indexes.map((row) => row.indexname)).toEqual([
      "clientes_empresa_id_nif_key",
      "clientes_id_empresa_id_key",
      "clientes_pkey",
      "contactos_cliente_id_idx",
      "contactos_pkey",
      "contactos_sede_id_idx",
      "sedes_cliente_id_idx",
      "sedes_id_cliente_id_key",
      "sedes_pkey",
    ]);
  });

  it("rechaza una sede o un contacto con empresa distinta de su cliente", async () => {
    const suffix = uniqueSuffix();

    await expect(
      inRollback(async (tx) => {
        const { b, cliente } = await dosEmpresas(tx, suffix);
        return tx.sede.create({
          data: { empresaId: b.id, clienteId: cliente.id, nombre: "X", direccion: "X" },
        });
      }),
    ).rejects.toThrow();

    await expect(
      inRollback(async (tx) => {
        const { b, cliente } = await dosEmpresas(tx, `${suffix}c`);
        return tx.contacto.create({
          data: { empresaId: b.id, clienteId: cliente.id, nombre: "X", telefono: "600000000" },
        });
      }),
    ).rejects.toThrow();
  });

  it("rechaza NIF no normalizado y tarifa negativa; admite el mismo NIF en otra empresa", async () => {
    const suffix = uniqueSuffix();

    await expect(
      inRollback(async (tx) => {
        const { a } = await dosEmpresas(tx, suffix);
        return tx.cliente.create({
          data: {
            empresaId: a.id,
            razonSocial: "X",
            nif: " a87654321",
            direccionFacturacion: "X",
          },
        });
      }),
    ).rejects.toThrow();

    await expect(
      inRollback(async (tx) => {
        const { a } = await dosEmpresas(tx, `${suffix}t`);
        return tx.cliente.create({
          data: {
            empresaId: a.id,
            razonSocial: "X",
            nif: "A87654321",
            direccionFacturacion: "X",
            tarifaHoraria: "-0.01",
          },
        });
      }),
    ).rejects.toThrow();

    await expect(
      inRollback(async (tx) => {
        const { a } = await dosEmpresas(tx, `${suffix}d`);
        return tx.cliente.create({
          data: {
            empresaId: a.id,
            razonSocial: "Duplicado",
            nif: "B12345678",
            direccionFacturacion: "X",
          },
        });
      }),
    ).rejects.toThrow();

    const otraEmpresa = await inRollback(async (tx) => {
      const { b } = await dosEmpresas(tx, `${suffix}o`);
      return tx.cliente.create({
        data: {
          empresaId: b.id,
          razonSocial: "Mismo NIF, otra empresa",
          nif: "B12345678",
          direccionFacturacion: "X",
          tarifaHoraria: "0",
        },
      });
    });
    expect(otraEmpresa.nif).toBe("B12345678");
  });

  it("rechaza un contacto sin teléfono ni email o con email no normalizado", async () => {
    const suffix = uniqueSuffix();

    await expect(
      inRollback(async (tx) => {
        const { a, cliente } = await dosEmpresas(tx, suffix);
        return tx.contacto.create({
          data: { empresaId: a.id, clienteId: cliente.id, nombre: "Sin datos" },
        });
      }),
    ).rejects.toThrow();

    await expect(
      inRollback(async (tx) => {
        const { a, cliente } = await dosEmpresas(tx, `${suffix}e`);
        return tx.contacto.create({
          data: {
            empresaId: a.id,
            clienteId: cliente.id,
            nombre: "Email",
            email: "Ana@Example.com",
          },
        });
      }),
    ).rejects.toThrow();

    const valido = await inRollback(async (tx) => {
      const { a, cliente, sede } = await dosEmpresas(tx, `${suffix}v`);
      return tx.contacto.create({
        data: {
          empresaId: a.id,
          clienteId: cliente.id,
          sedeId: sede.id,
          nombre: "Válido",
          email: "ana@example.com",
        },
      });
    });
    expect(valido.telefono).toBeNull();
  });
});
