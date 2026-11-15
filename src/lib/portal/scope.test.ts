import { describe, expect, it } from "vitest";
import {
  clienteFilter,
  clienteScope,
  isPortalSession,
  PortalScopeError,
  type ClienteScope,
  type PortalSubject,
} from "./scope";

const PORTAL: PortalSubject = {
  esSuperadmin: false,
  empresa: { id: "empresa-1" },
  cliente: { id: "cliente-1" },
};

describe("alcance del portal de cliente", () => {
  it("reconoce solo sesiones de usuario de cliente", () => {
    expect(isPortalSession(PORTAL)).toBe(true);
    expect(isPortalSession(null)).toBe(false);
    expect(isPortalSession(undefined)).toBe(false);
    expect(isPortalSession({ ...PORTAL, cliente: null })).toBe(false);
    expect(isPortalSession({ ...PORTAL, empresa: null })).toBe(false);
    expect(isPortalSession({ ...PORTAL, esSuperadmin: true })).toBe(false);
    expect(isPortalSession({ ...PORTAL, cliente: { id: " " } })).toBe(false);
  });

  it("clienteScope devuelve empresa y cliente de la sesión", () => {
    expect(clienteScope(PORTAL)).toEqual({
      empresaId: "empresa-1",
      clienteId: "cliente-1",
    });
  });

  it("clienteScope lanza con sesiones de empresa, superadmin o anónimas", () => {
    expect(() => clienteScope({ ...PORTAL, cliente: null })).toThrow(
      PortalScopeError,
    );
    expect(() =>
      clienteScope({ esSuperadmin: true, empresa: null, cliente: null }),
    ).toThrow(PortalScopeError);
    expect(() => clienteScope(null)).toThrow(PortalScopeError);
  });

  it("clienteFilter fija empresa y cliente para el where de Prisma", () => {
    expect(clienteFilter(clienteScope(PORTAL))).toEqual({
      empresaId: "empresa-1",
      clienteId: "cliente-1",
    });
  });

  it("clienteFilter rechaza un alcance incompleto construido a mano", () => {
    expect(() =>
      clienteFilter({ empresaId: "", clienteId: "cliente-1" }),
    ).toThrow(PortalScopeError);
    expect(() =>
      clienteFilter({ empresaId: "empresa-1", clienteId: " " }),
    ).toThrow(PortalScopeError);
    expect(() => clienteFilter(null as unknown as ClienteScope)).toThrow(
      PortalScopeError,
    );
  });
});
