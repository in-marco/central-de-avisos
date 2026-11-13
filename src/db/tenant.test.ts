import { describe, expect, it } from "vitest";
import {
  assertTenantAccess,
  requireEmpresaId,
  TenantAccessError,
  TenantContextError,
  tenantFilter,
} from "./tenant";

const EMPRESA_A = "11111111-1111-4111-8111-111111111111";
const EMPRESA_B = "22222222-2222-4222-8222-222222222222";

describe("requireEmpresaId", () => {
  it("devuelve el identificador recortado", () => {
    expect(requireEmpresaId(`  ${EMPRESA_A}  `)).toBe(EMPRESA_A);
  });

  it.each([undefined, null, "", "   "])(
    "lanza TenantContextError con el valor %o",
    (value) => {
      expect(() => requireEmpresaId(value)).toThrow(TenantContextError);
    },
  );
});

describe("tenantFilter", () => {
  it("devuelve el filtro Prisma obligatorio", () => {
    expect(tenantFilter(EMPRESA_A)).toEqual({ empresaId: EMPRESA_A });
  });

  it("lanza antes de consultar si falta la empresa", () => {
    expect(() => tenantFilter(undefined)).toThrow(TenantContextError);
  });
});

describe("assertTenantAccess", () => {
  it("permite un recurso de la misma empresa", () => {
    expect(() => assertTenantAccess(EMPRESA_A, EMPRESA_A)).not.toThrow();
  });

  it("rechaza un recurso de otra empresa", () => {
    expect(() => assertTenantAccess(EMPRESA_B, EMPRESA_A)).toThrow(
      TenantAccessError,
    );
  });

  it("rechaza un recurso sin empresa", () => {
    expect(() => assertTenantAccess(null, EMPRESA_A)).toThrow(
      TenantAccessError,
    );
  });

  it("lanza si falta el contexto de empresa", () => {
    expect(() => assertTenantAccess(EMPRESA_A, undefined)).toThrow(
      TenantContextError,
    );
  });
});
