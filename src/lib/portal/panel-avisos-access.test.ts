import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { visibleNavItems } from "@/lib/authz/navigation";
import { can, type AuthzSubject } from "@/lib/authz/permissions";

/**
 * Interacción entre el portal de cliente y los avisos de oficina: el usuario
 * de cliente recibe 403 en `/panel/avisos/*` y en `POST /api/panel/avisos`
 * porque esas rutas exigen `avisos.crear` con los guards de empresa y `can()`
 * niega todo permiso de empresa a una sesión con `cliente`. Este test fija las
 * dos mitades de ese contrato; el smoke (`SMOKE_CLIENTE_*`) lo comprueba por
 * HTTP.
 */
const ROOT = process.cwd();

function source(relative: string): string {
  return readFileSync(path.resolve(ROOT, relative), "utf8");
}

const clienteConRolesPorError: AuthzSubject = {
  esSuperadmin: false,
  empresa: { id: "empresa-1" },
  roles: ["ADMINISTRADOR", "OFICINA"],
  cliente: { id: "cliente-1" },
};

describe("usuario de cliente frente a los avisos de oficina", () => {
  it("no tiene avisos.crear aunque traiga roles por error", () => {
    expect(can(clienteConRolesPorError, "avisos.crear")).toBe(false);
    expect(can({ ...clienteConRolesPorError, cliente: null }, "avisos.crear")).toBe(true);
  });

  it("no ve «Avisos» en la navegación del panel", () => {
    const hrefs = visibleNavItems(clienteConRolesPorError).map((item) => item.href);
    expect(hrefs).not.toContain("/panel/avisos");
    expect(hrefs).toEqual([]);
  });

  it.each([
    "src/app/panel/avisos/page.tsx",
    "src/app/panel/avisos/nuevo/page.tsx",
    "src/app/panel/avisos/[id]/page.tsx",
  ])("%s exige avisos.crear con requirePermission", (page) => {
    expect(source(page)).toMatch(/requirePermission\(\s*"avisos\.crear"/);
  });

  it("POST /api/panel/avisos exige avisos.crear con authorizeCompanyRequest", () => {
    expect(source("src/app/api/panel/avisos/route.ts")).toMatch(
      /authorizeCompanyRequest\(\s*request,\s*"avisos\.crear"/,
    );
  });

  it("el portal no enlaza a /panel/avisos", () => {
    for (const file of ["src/app/portal/layout.tsx", "src/app/portal/page.tsx"]) {
      expect(source(file)).not.toContain("/panel/avisos");
    }
  });
});
