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

function item(href: string) {
  const found = NAV_ITEMS.find((entry) => entry.href === href);

  if (!found) {
    throw new Error(`Falta la entrada ${href}`);
  }

  return found;
}

describe("navegación del panel por permisos", () => {
  it("el administrador ve Inicio, Clientes, Usuarios y Empresa", () => {
    expect(labels(company(["ADMINISTRADOR"]))).toEqual([
      "Inicio",
      "Clientes",
      "Usuarios",
      "Empresa",
    ]);
  });

  it("oficina ve Inicio y Clientes", () => {
    expect(labels(company(["OFICINA"]))).toEqual(["Inicio", "Clientes"]);
    expect(labels(company(["OFICINA", "TECNICO"]))).toEqual(["Inicio", "Clientes"]);
  });

  it("el técnico solo ve Inicio", () => {
    expect(labels(company(["TECNICO"]))).toEqual(["Inicio"]);
  });

  it("ADMINISTRADOR+TECNICO ve Clientes, Usuarios y Empresa", () => {
    expect(labels(company(["ADMINISTRADOR", "TECNICO"]))).toEqual([
      "Inicio",
      "Clientes",
      "Usuarios",
      "Empresa",
    ]);
  });

  it("un usuario sin roles solo ve Inicio", () => {
    expect(labels(company([]))).toEqual(["Inicio"]);
  });

  it("el superadmin ve Inicio y Panel de proveedor, pero no Clientes ni Usuarios", () => {
    expect(labels(SUPERADMIN)).toEqual(["Inicio", "Panel de proveedor"]);
  });

  it("sin sesión no hay navegación", () => {
    expect(labels(null)).toEqual([]);
  });

  it("marca como activa solo la ruta correspondiente", () => {
    const inicio = item("/panel");
    const usuarios = item("/panel/usuarios");
    const clientes = item("/panel/clientes");
    const empresa = item("/panel/empresa");
    expect(isNavItemActive(inicio, "/panel")).toBe(true);
    expect(isNavItemActive(inicio, "/panel/usuarios")).toBe(false);
    expect(isNavItemActive(usuarios, "/panel/usuarios")).toBe(true);
    expect(isNavItemActive(usuarios, "/panel/usuarios-x")).toBe(false);
    expect(isNavItemActive(clientes, "/panel/clientes")).toBe(true);
    expect(isNavItemActive(clientes, "/panel/clientes/nuevo")).toBe(true);
    expect(isNavItemActive(clientes, "/panel/clientes-x")).toBe(false);
    expect(isNavItemActive(empresa, "/panel/empresa")).toBe(true);
    expect(isNavItemActive(empresa, "/panel/usuarios")).toBe(false);
    expect(isNavItemActive(inicio, "/panel/empresa")).toBe(false);
  });
});
