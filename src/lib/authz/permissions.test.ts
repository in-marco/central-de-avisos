import { describe, expect, it } from "vitest";
import {
  can,
  formatRoles,
  normalizeRoles,
  PERMISOS,
  permissionsFor,
  ROLES,
  ROLE_LABELS,
  type AuthzSubject,
  type Permiso,
  type Rol,
} from "./permissions";

/**
 * Tabla esperada copiada a mano de docs/user-and-access-model.md (columnas
 * Administrador, Oficina y Técnico). No se deriva de ROLE_PERMISSIONS para que
 * un cambio accidental de la matriz rompa el test.
 */
const EXPECTED: Record<Permiso, Record<Rol, boolean>> = {
  "panel.ver": { ADMINISTRADOR: true, OFICINA: true, TECNICO: true },
  "empresa.configurar": { ADMINISTRADOR: true, OFICINA: false, TECNICO: false },
  "usuarios.gestionar": { ADMINISTRADOR: true, OFICINA: false, TECNICO: false },
  "usuarios.desactivar": { ADMINISTRADOR: true, OFICINA: false, TECNICO: false },
  "clientes.gestionar": { ADMINISTRADOR: true, OFICINA: true, TECNICO: false },
  "avisos.crear": { ADMINISTRADOR: true, OFICINA: true, TECNICO: false },
  "avisos.validar": { ADMINISTRADOR: true, OFICINA: true, TECNICO: false },
  "avisos.asignar": { ADMINISTRADOR: true, OFICINA: true, TECNICO: false },
  "avisos.tomar": { ADMINISTRADOR: false, OFICINA: false, TECNICO: true },
  "partes.editar_propios": { ADMINISTRADOR: false, OFICINA: false, TECNICO: true },
  "partes.editar_cualquiera": { ADMINISTRADOR: false, OFICINA: true, TECNICO: false },
  "partes.aprobar": { ADMINISTRADOR: true, OFICINA: true, TECNICO: false },
  "facturas.ver": { ADMINISTRADOR: true, OFICINA: true, TECNICO: false },
  "facturas.emitir": { ADMINISTRADOR: true, OFICINA: true, TECNICO: false },
  "auditoria.ver": { ADMINISTRADOR: true, OFICINA: true, TECNICO: false },
};

function subject(roles: Rol[], overrides: Partial<AuthzSubject> = {}): AuthzSubject {
  return {
    esSuperadmin: false,
    empresa: { id: "empresa-1" },
    roles,
    ...overrides,
  };
}

const COMBINATIONS: Rol[][] = [
  ["ADMINISTRADOR", "TECNICO"],
  ["OFICINA", "ADMINISTRADOR"],
  ["OFICINA", "TECNICO"],
  ["ADMINISTRADOR", "OFICINA", "TECNICO"],
];

describe("matriz de permisos", () => {
  it("cubre exactamente los permisos declarados", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...PERMISOS].sort());
  });

  for (const rol of ROLES) {
    for (const permiso of PERMISOS) {
      const esperado = EXPECTED[permiso][rol];

      it(`${rol} ${esperado ? "puede" : "no puede"} ${permiso}`, () => {
        expect(can(subject([rol]), permiso)).toBe(esperado);
      });
    }
  }

  for (const roles of COMBINATIONS) {
    it(`${roles.join("+")} suma los permisos de sus roles`, () => {
      for (const permiso of PERMISOS) {
        const esperado = roles.some((rol) => EXPECTED[permiso][rol]);
        expect(can(subject(roles), permiso), permiso).toBe(esperado);
      }
    });
  }

  it("ADMINISTRADOR+TECNICO gestiona usuarios y además toma avisos", () => {
    const session = subject(["ADMINISTRADOR", "TECNICO"]);
    expect(can(session, "usuarios.gestionar")).toBe(true);
    expect(can(session, "avisos.tomar")).toBe(true);
    expect(can(session, "partes.editar_propios")).toBe(true);
    expect(can(session, "partes.editar_cualquiera")).toBe(false);
  });

  it("un usuario sin roles no tiene ningún permiso", () => {
    for (const permiso of PERMISOS) {
      expect(can(subject([]), permiso)).toBe(false);
    }
    expect(permissionsFor([]).size).toBe(0);
  });

  it("el superadmin no tiene permisos de empresa", () => {
    const superadmin = subject([], { esSuperadmin: true, empresa: null });
    for (const permiso of PERMISOS) {
      expect(can(superadmin, permiso)).toBe(false);
    }
  });

  it("deniega aunque un superadmin traiga roles por error", () => {
    const superadmin = subject(["ADMINISTRADOR"], {
      esSuperadmin: true,
      empresa: null,
    });
    expect(can(superadmin, "usuarios.gestionar")).toBe(false);
  });

  it("deniega sin sesión o sin empresa", () => {
    expect(can(null, "panel.ver")).toBe(false);
    expect(can(undefined, "panel.ver")).toBe(false);
    expect(can(subject(["ADMINISTRADOR"], { empresa: null }), "panel.ver")).toBe(
      false,
    );
  });
});

describe("normalizeRoles", () => {
  it("deduplica y ordena en el orden canónico", () => {
    expect(normalizeRoles(["TECNICO", "OFICINA", "TECNICO"])).toEqual({
      ok: true,
      roles: ["OFICINA", "TECNICO"],
    });
  });

  it("acepta una lista vacía (el mínimo se aplica en la acción)", () => {
    expect(normalizeRoles([])).toEqual({ ok: true, roles: [] });
  });

  it("rechaza roles desconocidos, en minúsculas o no textuales", () => {
    expect(normalizeRoles(["CLIENTE"])).toEqual({ ok: false, error: "rol-invalido" });
    expect(normalizeRoles(["administrador"])).toEqual({
      ok: false,
      error: "rol-invalido",
    });
    expect(normalizeRoles([42])).toEqual({ ok: false, error: "rol-invalido" });
    expect(normalizeRoles(["ADMINISTRADOR", ""])).toEqual({
      ok: false,
      error: "rol-invalido",
    });
  });
});

describe("etiquetas de rol", () => {
  it("usa nombres en español", () => {
    expect(ROLE_LABELS).toEqual({
      ADMINISTRADOR: "Administrador",
      OFICINA: "Oficina",
      TECNICO: "Técnico",
    });
  });

  it("formatea roles combinados en orden canónico", () => {
    expect(formatRoles(["TECNICO", "ADMINISTRADOR"])).toBe(
      "Administrador · Técnico",
    );
    expect(formatRoles([])).toBe("");
  });
});
