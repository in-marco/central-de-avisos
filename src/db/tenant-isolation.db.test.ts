import { afterAll, describe, expect, it } from "vitest";
import {
  assertTenantAccess,
  TenantAccessError,
  TenantContextError,
  tenantFilter,
} from "./tenant";
import { disconnectDb } from "./client";
import { inRollback, uniqueSuffix } from "./db-test-utils";

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
            nif: `A${suffix}`,
            emailFacturacion: `facturacion-a-${suffix}@example.com`,
            planId: plan.id,
          },
        });
        const empresaB = await tx.empresa.create({
          data: {
            nombre: `Empresa B ${suffix}`,
            nif: `B${suffix}`,
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
          nif: `AA${suffix}`,
          emailFacturacion: `facturacion-aa-${suffix}@example.com`,
          planId: plan.id,
        },
      });
      const empresaB = await tx.empresa.create({
        data: {
          nombre: `Empresa acceso B ${suffix}`,
          nif: `BB${suffix}`,
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

  it("requireEmpresaId impide consultar sin contexto de empresa", () => {
    expect(() => tenantFilter(undefined)).toThrow(TenantContextError);
    expect(() => tenantFilter("")).toThrow(TenantContextError);
  });
});
