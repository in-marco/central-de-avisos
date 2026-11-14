import { afterAll, describe, expect, it } from "vitest";
import {
  assertTenantAccess,
  TenantAccessError,
  TenantContextError,
  tenantFilter,
} from "./tenant";
import { disconnectDb } from "./client";
import { inRollback, uniqueSuffix } from "./db-test-utils";
import {
  listCompanyUsers,
  updateUserRolesInTransaction,
} from "@/lib/empresa/usuarios";

afterAll(async () => {
  await disconnectDb();
});

describe("aislamiento multiempresa", () => {
  it("tenantFilter solo devuelve usuarios de la empresa indicada", async () => {
    const suffix = uniqueSuffix();

    const { empresaA, empresaB, usuariosA, usuariosB, superadmin } =
      await inRollback(async (tx) => {
        const plan = await tx.plan.create({
          data: { nombre: `Plan aislamiento ${suffix}`, importeMensual: "10.00" },
        });

        const empresaA = await tx.empresa.create({
          data: {
            nombre: `Empresa A ${suffix}`,
            nif: `A${suffix.toUpperCase()}`,
            emailFacturacion: `facturacion-a-${suffix}@example.com`,
            planId: plan.id,
          },
        });
        const empresaB = await tx.empresa.create({
          data: {
            nombre: `Empresa B ${suffix}`,
            nif: `B${suffix.toUpperCase()}`,
            emailFacturacion: `facturacion-b-${suffix}@example.com`,
            planId: plan.id,
          },
        });

        for (const [indice, empresaId] of [
          [1, empresaA.id],
          [2, empresaA.id],
          [3, empresaB.id],
        ] as const) {
          await tx.usuario.create({
            data: {
              empresaId,
              email: `usuario-${indice}-${suffix}@example.com`,
              nombre: `Usuario ${indice}`,
            },
          });
        }

        const superadmin = await tx.usuario.create({
          data: {
            empresaId: null,
            email: `superadmin-${suffix}@example.com`,
            nombre: "Superadmin",
            esSuperadmin: true,
          },
        });

        const usuariosA = await tx.usuario.findMany({
          where: tenantFilter(empresaA.id),
          orderBy: { email: "asc" },
        });
        const usuariosB = await tx.usuario.findMany({
          where: tenantFilter(empresaB.id),
          orderBy: { email: "asc" },
        });

        return { empresaA, empresaB, usuariosA, usuariosB, superadmin };
      });

    expect(usuariosA).toHaveLength(2);
    expect(usuariosA.every((usuario) => usuario.empresaId === empresaA.id)).toBe(
      true,
    );

    expect(usuariosB).toHaveLength(1);
    expect(usuariosB[0]?.empresaId).toBe(empresaB.id);

    expect(usuariosA.some((usuario) => usuario.id === superadmin.id)).toBe(false);
    expect(usuariosB.some((usuario) => usuario.id === superadmin.id)).toBe(false);
  });

  it("assertTenantAccess bloquea un recurso de otra empresa", async () => {
    const suffix = uniqueSuffix();

    const { empresaA, usuarioB } = await inRollback(async (tx) => {
      const plan = await tx.plan.create({
        data: { nombre: `Plan acceso ${suffix}`, importeMensual: "10.00" },
      });

      const empresaA = await tx.empresa.create({
        data: {
          nombre: `Empresa acceso A ${suffix}`,
          nif: `AA${suffix.toUpperCase()}`,
          emailFacturacion: `facturacion-aa-${suffix}@example.com`,
          planId: plan.id,
        },
      });
      const empresaB = await tx.empresa.create({
        data: {
          nombre: `Empresa acceso B ${suffix}`,
          nif: `BB${suffix.toUpperCase()}`,
          emailFacturacion: `facturacion-bb-${suffix}@example.com`,
          planId: plan.id,
        },
      });

      const usuarioB = await tx.usuario.create({
        data: {
          empresaId: empresaB.id,
          email: `usuario-b-${suffix}@example.com`,
          nombre: "Usuario B",
        },
      });

      return { empresaA, usuarioB };
    });

    expect(() => assertTenantAccess(usuarioB.empresaId, empresaA.id)).toThrow(
      TenantAccessError,
    );
  });

  it("un administrador de A no lista ni edita usuarios de B", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const plan = await tx.plan.create({
        data: { nombre: `Plan roles aislamiento ${suffix}`, importeMensual: "10.00" },
      });
      const empresaA = await tx.empresa.create({
        data: {
          nombre: `Empresa roles A ${suffix}`,
          nif: `RA${suffix.toUpperCase()}`,
          emailFacturacion: `facturacion-ra-${suffix}@example.com`,
          planId: plan.id,
        },
      });
      const empresaB = await tx.empresa.create({
        data: {
          nombre: `Empresa roles B ${suffix}`,
          nif: `RB${suffix.toUpperCase()}`,
          emailFacturacion: `facturacion-rb-${suffix}@example.com`,
          planId: plan.id,
        },
      });
      const adminA = await tx.usuario.create({
        data: {
          empresaId: empresaA.id,
          email: `admin-ra-${suffix}@example.com`,
          nombre: "Admin A",
          roles: ["ADMINISTRADOR"],
        },
      });
      const tecnicoB = await tx.usuario.create({
        data: {
          empresaId: empresaB.id,
          email: `tecnico-rb-${suffix}@example.com`,
          nombre: "Técnico B",
          roles: ["TECNICO"],
        },
      });

      const listadoA = await listCompanyUsers(tx, empresaA.id);
      const update = await updateUserRolesInTransaction(tx, {
        empresaId: empresaA.id,
        actorId: adminA.id,
        usuarioId: tecnicoB.id,
        roles: ["ADMINISTRADOR"],
      });
      const tecnicoBDespues = await tx.usuario.findUniqueOrThrow({
        where: { id: tecnicoB.id },
      });

      return { adminA, tecnicoB, listadoA, update, tecnicoBDespues };
    });

    expect(result.listadoA.map((usuario) => usuario.id)).toEqual([
      result.adminA.id,
    ]);
    expect(result.update).toEqual({ ok: false, error: "no-encontrado" });
    expect(result.tecnicoBDespues.roles).toEqual(["TECNICO"]);
  });

  it("requireEmpresaId impide consultar sin contexto de empresa", () => {
    expect(() => tenantFilter(undefined)).toThrow(TenantContextError);
    expect(() => tenantFilter("")).toThrow(TenantContextError);
  });
});
