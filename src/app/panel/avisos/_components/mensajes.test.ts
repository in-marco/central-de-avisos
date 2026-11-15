import { describe, expect, it } from "vitest";
import {
  avisoAccionError,
  avisoError,
  avisoListadoError,
  avisoOkMessage,
  formatFecha,
  resumenDescripcion,
} from "./mensajes";

describe("mensajes de avisos", () => {
  it("resuelve los códigos conocidos con su campo", () => {
    expect(avisoError("descripcion")?.field).toBe("descripcion");
    expect(avisoError("contacto")?.field).toBe("contacto");
    expect(avisoError("sede")?.field).toBe("sede");
    expect(avisoError("prioridad")?.field).toBe("prioridad");
    expect(avisoError("no-encontrado")?.field).toBeUndefined();
    expect(avisoOkMessage("creado")).toBe("Aviso creado.");
  });

  it("resuelve los mensajes de validar y cancelar", () => {
    expect(avisoOkMessage("validado")).toBe("Aviso validado y publicado en la bolsa.");
    expect(avisoOkMessage("cancelado")).toBe("Aviso cancelado.");
    expect(avisoAccionError("incompleto")?.summary).toMatch(/^No se puede validar: el contacto/);
    expect(avisoAccionError("estado")?.summary).toBe(
      "El aviso ya no está en un estado que permita esta acción. Revisa su estado actual.",
    );
    expect(avisoAccionError("motivo")?.field).toBe("motivo");
    expect(avisoAccionError("confirmacion")?.field).toBe("confirmacion");
    expect(avisoAccionError("servicio")?.field).toBeUndefined();
    expect(avisoListadoError("no-encontrado")).toMatch(/aviso/);
    expect(avisoListadoError("servicio")).toBeDefined();
    // Los códigos de una página no se resuelven en la otra.
    expect(avisoListadoError("incompleto")).toBeUndefined();
    expect(avisoAccionError("no-encontrado")).toBeUndefined();
  });

  it.each(["__proto__", "constructor", "toString", "hasOwnProperty", "x", ""])(
    "ignora el código %j sin resolver propiedades heredadas",
    (code) => {
      expect(avisoError(code)).toBeUndefined();
      expect(avisoOkMessage(code)).toBeUndefined();
      expect(avisoAccionError(code)).toBeUndefined();
      expect(avisoListadoError(code)).toBeUndefined();
    },
  );

  it("formatea la fecha en Europe/Madrid", () => {
    // 23:30 UTC del 31/12 es ya 1 de enero en Madrid (UTC+1).
    expect(formatFecha(new Date("2026-12-31T23:30:00Z"))).toMatch(/^1\/1\/27, 0:30$/);
    // Horario de verano (UTC+2).
    expect(formatFecha(new Date("2026-07-15T08:05:00Z"))).toMatch(/^15\/7\/26, 10:05$/);
  });

  it("resume la descripción en una línea", () => {
    expect(resumenDescripcion("Línea 1\nLínea 2")).toBe("Línea 1 Línea 2");
    expect(resumenDescripcion("x".repeat(100), 10)).toBe(`${"x".repeat(9)}…`);
  });
});
