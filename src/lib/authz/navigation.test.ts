import { describe, expect, it } from "vitest";
import { isNavItemActive, NAV_ITEMS, visibleNavItems } from "./navigation";
import type { AuthzSubject, Rol } from "./permissions";

function company(roles: Rol[]): AuthzSubject {
  return { esSuperadmin: false, empresa: { id: "empresa-1" }, roles };
}

const SUPERADMIN: AuthzSubject = { esSuperadmin: true, empresa: null, roles: [] };

function labels(session: AuthzSubject | null) {
  return visibleNavItems(session).map((item) => item.label);
}

describe("navegación del panel por permisos", () => {
  it("el administrador ve Inicio, Usuarios y Empresa", () => {
    expect(labels(company(["ADMINISTRADOR"]))).toEqual([
      "Inicio",
      "Usuarios",
      "Empresa",
    ]);
  });

  it("oficina y técnico solo ven Inicio", () => {
    expect(labels(company(["OFICINA"]))).toEqual(["Inicio"]);
    expect(labels(company(["TECNICO"]))).toEqual(["Inicio"]);
    expect(labels(company(["OFICINA", "TECNICO"]))).toEqual(["Inicio"]);
  });

  it("ADMINISTRADOR+TECNICO ve Usuarios y Empresa", () => {
    expect(labels(company(["ADMINISTRADOR", "TECNICO"]))).toEqual([
      "Inicio",
      "Usuarios",
      "Empresa",
    ]);
  });

  it("un usuario sin roles solo ve Inicio", () => {
    expect(labels(company([]))).toEqual(["Inicio"]);
  });

  it("el superadmin ve Inicio y Panel de proveedor, pero no Usuarios", () => {
    expect(labels(SUPERADMIN)).toEqual(["Inicio", "Panel de proveedor"]);
  });

  it("sin sesión no hay navegación", () => {
    expect(labels(null)).toEqual([]);
  });

  it("marca como activa solo la ruta correspondiente", () => {
    const [inicio, usuarios, empresa] = NAV_ITEMS;
    expect(isNavItemActive(inicio!, "/panel")).toBe(true);
    expect(isNavItemActive(inicio!, "/panel/usuarios")).toBe(false);
    expect(isNavItemActive(usuarios!, "/panel/usuarios")).toBe(true);
    expect(isNavItemActive(usuarios!, "/panel/usuarios-x")).toBe(false);
    expect(empresa?.href).toBe("/panel/empresa");
    expect(isNavItemActive(empresa!, "/panel/empresa")).toBe(true);
    expect(isNavItemActive(empresa!, "/panel/usuarios")).toBe(false);
    expect(isNavItemActive(inicio!, "/panel/empresa")).toBe(false);
  });
});
