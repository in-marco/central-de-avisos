import { afterAll, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { disconnectDb, getDb } from "@/db/client";
import { inRollback, uniqueSuffix } from "@/db/db-test-utils";
import type { Rol } from "@/lib/authz/permissions";
import {
  LastAdminError,
  listCompanyUsers,
  updateUserRoles,
  updateUserRolesInTransaction,
} from "./usuarios";

afterAll(async () => {
  await disconnectDb();
});

type Db = Prisma.TransactionClient | ReturnType<typeof getDb>;

async function createCompany(db: Db, suffix: string, tag: string) {
  const plan = await db.plan.create({
    data: { nombre: `Plan usuarios ${tag} ${suffix}`, importeMensual: "10.00" },
  });
  const empresa = await db.empresa.create({
    data: {
      nombre: `Empresa ${tag} ${suffix}`,
      nif: `${tag}${suffix}`.toUpperCase().slice(0, 30),
      emailFacturacion: `facturacion-${tag}-${suffix}@example.com`,
      planId: plan.id,
    },
  });

  return { plan, empresa };
}

async function createUser(
  db: Db,
  empresaId: string,
  email: string,
  nombre: string,
  roles: Rol[],
  estado: "ACTIVO" | "INACTIVO" = "ACTIVO",
) {
  return db.usuario.create({
    data: { empresaId, email, nombre, roles, estado },
  });
}

async function teamFixture(tx: Prisma.TransactionClient, suffix: string) {
  const { empresa } = await createCompany(tx, suffix, "a");
  const admin = await createUser(
    tx,
    empresa.id,
    `admin-${suffix}@example.com`,
    "Ana Admin",
    ["ADMINISTRADOR"],
  );
  const tecnico = await createUser(
    tx,
    empresa.id,
    `tecnico-${suffix}@example.com`,
    "Tomás Técnico",
    ["TECNICO"],
  );
  const oficina = await createUser(
    tx,
    empresa.id,
    `oficina-${suffix}@example.com`,
    "Olga Oficina",
    ["OFICINA"],
  );

  return { empresa, admin, tecnico, oficina };
}

async function createClienteUser(
  tx: Prisma.TransactionClient,
  empresaId: string,
  suffix: string,
) {
  const cliente = await tx.cliente.create({
    data: {
      empresaId,
      razonSocial: "Cliente portal",
      nif: "B12345678",
      direccionFacturacion: "Calle 1",
    },
  });
  return tx.usuario.create({
    data: {
      empresaId,
      clienteId: cliente.id,
      email: `aaa-cliente-${suffix}@example.com`,
      nombre: "Aaa Cliente",
      roles: [],
    },
  });
}

describe("usuarios de cliente (portal) fuera de la gestión de usuarios", () => {
  it("listCompanyUsers no lista usuarios de cliente", async () => {
    const suffix = uniqueSuffix();
    const result = await inRollback(async (tx) => {
      const team = await teamFixture(tx, suffix);
      const clienteUser = await createClienteUser(tx, team.empresa.id, suffix);
      return { clienteUser, usuarios: await listCompanyUsers(tx, team.empresa.id) };
    });

    expect(result.usuarios.map((usuario) => usuario.id)).not.toContain(
      result.clienteUser.id,
    );
    expect(result.usuarios).toHaveLength(3);
  });

  it("cambiar los roles de un usuario de cliente devuelve no-encontrado sin tocarlo", async () => {
    const suffix = uniqueSuffix();
    const result = await inRollback(async (tx) => {
      const team = await teamFixture(tx, suffix);
      const clienteUser = await createClienteUser(tx, team.empresa.id, suffix);
      const update = await updateUserRolesInTransaction(tx, {
        empresaId: team.empresa.id,
        actorId: team.admin.id,
        usuarioId: clienteUser.id,
        roles: ["OFICINA"],
      });
      const after = await tx.usuario.findUniqueOrThrow({ where: { id: clienteUser.id } });
      return { update, after };
    });

    expect(result.update).toEqual({ ok: false, error: "no-encontrado" });
    expect(result.after.roles).toEqual([]);
  });
});

describe("listCompanyUsers", () => {
  it("lista solo usuarios de la empresa, ordenados por nombre y sin superadmin", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const team = await teamFixture(tx, suffix);
      const otra = await createCompany(tx, suffix, "b");
      await createUser(
        tx,
        otra.empresa.id,
        `ajeno-${suffix}@example.com`,
        "Ajeno",
        ["ADMINISTRADOR"],
      );
      await tx.usuario.create({
        data: {
          empresaId: null,
          email: `superadmin-${suffix}@example.com`,
          nombre: "Aaa Superadmin",
          esSuperadmin: true,
        },
      });

      return { team, usuarios: await listCompanyUsers(tx, team.empresa.id) };
    });

    expect(result.usuarios.map((usuario) => usuario.nombre)).toEqual([
      "Ana Admin",
      "Olga Oficina",
      "Tomás Técnico",
    ]);
    expect(result.usuarios[0]).toEqual({
      id: result.team.admin.id,
      nombre: "Ana Admin",
      email: `admin-${suffix}@example.com`,
      estado: "ACTIVO",
      roles: ["ADMINISTRADOR"],
    });
  });
});

describe("updateUserRolesInTransaction", () => {
  it("cambia los roles de un técnico a OFICINA+TECNICO normalizando duplicados", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const team = await teamFixture(tx, suffix);
      const update = await updateUserRolesInTransaction(tx, {
        empresaId: team.empresa.id,
        actorId: team.admin.id,
        usuarioId: team.tecnico.id,
        roles: ["TECNICO", "OFICINA", "TECNICO"],
      });
      const stored = await tx.usuario.findUniqueOrThrow({
        where: { id: team.tecnico.id },
      });

      return { update, stored };
    });

    expect(result.update).toEqual({ ok: true, roles: ["OFICINA", "TECNICO"] });
    expect(result.stored.roles).toEqual(["OFICINA", "TECNICO"]);
  });

  it("permite al administrador añadirse roles conservando ADMINISTRADOR", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const team = await teamFixture(tx, suffix);
      return updateUserRolesInTransaction(tx, {
        empresaId: team.empresa.id,
        actorId: team.admin.id,
        usuarioId: team.admin.id,
        roles: ["ADMINISTRADOR", "TECNICO"],
      });
    });

    expect(result).toEqual({ ok: true, roles: ["ADMINISTRADOR", "TECNICO"] });
  });

  const rejections: Array<{
    name: string;
    roles: unknown[];
    target: "tecnico" | "admin" | "ajeno" | "inexistente" | "invalido" | "superadmin";
    error: string;
  }> = [
    { name: "lista vacía", roles: [], target: "tecnico", error: "sin-roles" },
    { name: "rol desconocido", roles: ["CLIENTE"], target: "tecnico", error: "rol-invalido" },
    {
      name: "rol válido con otro desconocido",
      roles: ["OFICINA", "JEFE"],
      target: "tecnico",
      error: "rol-invalido",
    },
    {
      name: "quitarse el propio ADMINISTRADOR",
      roles: ["TECNICO"],
      target: "admin",
      error: "propio-admin",
    },
    {
      name: "usuario de otra empresa",
      roles: ["OFICINA"],
      target: "ajeno",
      error: "no-encontrado",
    },
    {
      name: "usuario inexistente",
      roles: ["OFICINA"],
      target: "inexistente",
      error: "no-encontrado",
    },
    {
      name: "id que no es UUID",
      roles: ["OFICINA"],
      target: "invalido",
      error: "no-encontrado",
    },
    {
      name: "superadmin",
      roles: ["OFICINA"],
      target: "superadmin",
      error: "no-encontrado",
    },
  ];

  for (const rejection of rejections) {
    it(`rechaza sin cambios: ${rejection.name}`, async () => {
      const suffix = uniqueSuffix();

      const result = await inRollback(async (tx) => {
        const team = await teamFixture(tx, suffix);
        const otra = await createCompany(tx, suffix, "b");
        const ajeno = await createUser(
          tx,
          otra.empresa.id,
          `ajeno-${suffix}@example.com`,
          "Ajeno",
          ["TECNICO"],
        );
        const superadmin = await tx.usuario.create({
          data: {
            empresaId: null,
            email: `superadmin-${suffix}@example.com`,
            nombre: "Superadmin",
            esSuperadmin: true,
          },
        });
        const targets = {
          tecnico: team.tecnico.id,
          admin: team.admin.id,
          ajeno: ajeno.id,
          inexistente: "00000000-0000-4000-8000-000000000000",
          invalido: "no-es-un-uuid",
          superadmin: superadmin.id,
        };
        const before = await tx.usuario.findMany({
          select: { id: true, roles: true },
          where: { id: { in: [team.tecnico.id, team.admin.id, ajeno.id, superadmin.id] } },
          orderBy: { id: "asc" },
        });

        const update = await updateUserRolesInTransaction(tx, {
          empresaId: team.empresa.id,
          actorId: team.admin.id,
          usuarioId: targets[rejection.target],
          roles: rejection.roles,
        });

        const after = await tx.usuario.findMany({
          select: { id: true, roles: true },
          where: { id: { in: [team.tecnico.id, team.admin.id, ajeno.id, superadmin.id] } },
          orderBy: { id: "asc" },
        });

        return { update, before, after };
      });

      expect(result.update).toEqual({ ok: false, error: rejection.error });
      expect(result.after).toEqual(result.before);
    });
  }

  it("lanza LastAdminError si no quedaría ningún administrador ACTIVO", async () => {
    const suffix = uniqueSuffix();

    await expect(
      inRollback(async (tx) => {
        const { empresa } = await createCompany(tx, suffix, "u");
        // El único otro administrador está INACTIVO: no cuenta.
        const inactivo = await createUser(
          tx,
          empresa.id,
          `inactivo-${suffix}@example.com`,
          "Admin inactivo",
          ["ADMINISTRADOR"],
          "INACTIVO",
        );
        const activo = await createUser(
          tx,
          empresa.id,
          `activo-${suffix}@example.com`,
          "Admin activo",
          ["ADMINISTRADOR"],
        );

        return updateUserRolesInTransaction(tx, {
          empresaId: empresa.id,
          actorId: inactivo.id,
          usuarioId: activo.id,
          roles: ["OFICINA"],
        });
      }),
    ).rejects.toBeInstanceOf(LastAdminError);
  });
});

describe("último administrador en concurrencia", () => {
  it("dos administradores que se quitan ADMINISTRADOR a la vez dejan uno activo", async () => {
    const db = getDb();
    const suffix = uniqueSuffix();
    const { plan, empresa } = await createCompany(db, suffix, "c");

    try {
      const adminA = await createUser(
        db,
        empresa.id,
        `admin-a-${suffix}@example.com`,
        "Admin A",
        ["ADMINISTRADOR"],
      );
      const adminB = await createUser(
        db,
        empresa.id,
        `admin-b-${suffix}@example.com`,
        "Admin B",
        ["ADMINISTRADOR"],
      );

      const results = await Promise.all([
        updateUserRoles(db, {
          empresaId: empresa.id,
          actorId: adminA.id,
          usuarioId: adminB.id,
          roles: ["OFICINA"],
        }),
        updateUserRoles(db, {
          empresaId: empresa.id,
          actorId: adminB.id,
          usuarioId: adminA.id,
          roles: ["OFICINA"],
        }),
      ]);

      const admins = await db.usuario.count({
        where: {
          empresaId: empresa.id,
          estado: "ACTIVO",
          roles: { has: "ADMINISTRADOR" },
        },
      });

      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toEqual([
        { ok: false, error: "ultimo-admin" },
      ]);
      expect(admins).toBe(1);
    } finally {
      await db.usuario.deleteMany({ where: { empresaId: empresa.id } });
      await db.empresa.deleteMany({ where: { id: empresa.id } });
      await db.plan.deleteMany({ where: { id: plan.id } });
    }
  });
});
