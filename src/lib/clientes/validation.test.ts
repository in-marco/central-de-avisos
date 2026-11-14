import { describe, expect, it } from "vitest";
import {
  isValidTelefono,
  parseClienteFields,
  parseClienteForm,
  parseContactoFields,
  parseNuevoClienteForm,
  parseSedeFields,
} from "./validation";

const CLIENTE_OK = {
  razonSocial: "  Talleres Norte SL ",
  nif: "b12345678 ",
  direccionFacturacion: " Calle Mayor 1, Bilbao ",
  tarifaHoraria: "",
};

const CONTACTO_OK = {
  nombre: " Lucía ",
  telefono: " +34 600 123 456 ",
  email: "",
  sedeId: "",
};

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

describe("datos de facturación del cliente", () => {
  it("recorta y normaliza el NIF a mayúsculas", () => {
    expect(parseClienteFields(CLIENTE_OK)).toEqual({
      ok: true,
      value: {
        razonSocial: "Talleres Norte SL",
        nif: "B12345678",
        direccionFacturacion: "Calle Mayor 1, Bilbao",
        tarifaHoraria: null,
      },
    });
  });

  it("rechaza NIF con formato inválido", () => {
    for (const nif of ["12345", "B1234567", "ÑÑ", "B12345678X"]) {
      expect(parseClienteFields({ ...CLIENTE_OK, nif })).toEqual({
        ok: false,
        error: "nif",
      });
    }
  });

  it.each([
    ["razón social vacía", { razonSocial: "   " }],
    ["razón social > 160", { razonSocial: "a".repeat(161) }],
    ["dirección vacía", { direccionFacturacion: "" }],
    ["dirección > 240", { direccionFacturacion: "a".repeat(241) }],
    ["NIF vacío", { nif: " " }],
    ["NIF > 20", { nif: "B".repeat(21) }],
  ])("devuelve campos con %s", (_label, override) => {
    expect(parseClienteFields({ ...CLIENTE_OK, ...override })).toEqual({
      ok: false,
      error: "campos",
    });
  });

  it("acepta los límites exactos de longitud", () => {
    const result = parseClienteFields({
      ...CLIENTE_OK,
      razonSocial: "a".repeat(160),
      direccionFacturacion: "b".repeat(240),
    });
    expect(result.ok).toBe(true);
  });

  it("normaliza la tarifa con coma o punto y dos decimales", () => {
    for (const [raw, value] of [
      ["45", "45.00"],
      ["45,5", "45.50"],
      ["0", "0.00"],
      [" 38.75 ", "38.75"],
    ]) {
      const result = parseClienteFields({ ...CLIENTE_OK, tarifaHoraria: raw! });
      expect(result).toEqual({
        ok: true,
        value: expect.objectContaining({ tarifaHoraria: value }),
      });
    }
  });

  it("rechaza tarifas negativas, con más de 2 decimales o no numéricas", () => {
    for (const tarifaHoraria of ["-1", "45.999", "abc", "1e3", "45,5,5"]) {
      expect(parseClienteFields({ ...CLIENTE_OK, tarifaHoraria })).toEqual({
        ok: false,
        error: "tarifa",
      });
    }
  });

  it("lee los campos desde FormData", () => {
    const result = parseClienteForm(
      form({
        razonSocial: "Cliente",
        nif: "x1234567l",
        direccionFacturacion: "Dirección",
        tarifaHoraria: "30",
      }),
    );
    expect(result).toEqual({
      ok: true,
      value: {
        razonSocial: "Cliente",
        nif: "X1234567L",
        direccionFacturacion: "Dirección",
        tarifaHoraria: "30.00",
      },
    });
  });
});

describe("sede", () => {
  it("exige nombre y dirección dentro de los límites", () => {
    expect(parseSedeFields({ nombre: " Nave 1 ", direccion: " Polígono 3 " })).toEqual({
      ok: true,
      value: { nombre: "Nave 1", direccion: "Polígono 3" },
    });
    expect(parseSedeFields({ nombre: "", direccion: "x" })).toEqual({
      ok: false,
      error: "campos",
    });
    expect(parseSedeFields({ nombre: "a".repeat(121), direccion: "x" })).toEqual({
      ok: false,
      error: "campos",
    });
    expect(parseSedeFields({ nombre: "a", direccion: "d".repeat(241) })).toEqual({
      ok: false,
      error: "campos",
    });
  });
});

describe("teléfono", () => {
  it.each(["600123456", "+34 600 123 456", "(94) 412-34-56", "123456"])(
    "acepta %s",
    (value) => {
      expect(isValidTelefono(value)).toBe(true);
    },
  );

  it.each(["12345", "abc123456", "+34 600 123 456 789 012", "600.123.456", "-- () --", "++34600123456"])(
    "rechaza %s",
    (value) => {
      expect(isValidTelefono(value)).toBe(false);
    },
  );
});

describe("contacto", () => {
  it("recorta, convierte vacíos en null y exige teléfono o email", () => {
    expect(parseContactoFields(CONTACTO_OK)).toEqual({
      ok: true,
      value: {
        nombre: "Lucía",
        telefono: "+34 600 123 456",
        email: null,
        sedeId: null,
      },
    });
  });

  it("normaliza el email a minúsculas", () => {
    const result = parseContactoFields({
      ...CONTACTO_OK,
      telefono: "",
      email: " Lucia@Cliente.ES ",
    });
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({ email: "lucia@cliente.es", telefono: null }),
    });
  });

  it("sin teléfono ni email devuelve contacto", () => {
    expect(parseContactoFields({ ...CONTACTO_OK, telefono: " ", email: "" })).toEqual({
      ok: false,
      error: "contacto",
    });
  });

  it("email inválido o demasiado largo devuelve email", () => {
    for (const email of ["no-es-email", "a@b", `${"a".repeat(250)}@x.es`]) {
      expect(parseContactoFields({ ...CONTACTO_OK, email })).toEqual({
        ok: false,
        error: "email",
      });
    }
  });

  it("teléfono inválido devuelve telefono", () => {
    expect(parseContactoFields({ ...CONTACTO_OK, telefono: "12" })).toEqual({
      ok: false,
      error: "telefono",
    });
  });

  it("nombre vacío o > 120 devuelve campos", () => {
    expect(parseContactoFields({ ...CONTACTO_OK, nombre: "" })).toEqual({
      ok: false,
      error: "campos",
    });
    expect(parseContactoFields({ ...CONTACTO_OK, nombre: "a".repeat(121) })).toEqual({
      ok: false,
      error: "campos",
    });
  });

  it("sedeId vacío es todo el cliente; un sedeId que no es UUID devuelve sede", () => {
    const id = "0F8FAD5B-D9CB-469F-A165-70867728950E";
    expect(parseContactoFields({ ...CONTACTO_OK, sedeId: id })).toEqual({
      ok: true,
      value: expect.objectContaining({ sedeId: id.toLowerCase() }),
    });
    expect(parseContactoFields({ ...CONTACTO_OK, sedeId: "nave-1" })).toEqual({
      ok: false,
      error: "sede",
    });
  });
});

describe("alta completa", () => {
  const base = {
    razonSocial: "Cliente",
    nif: "b12345678 ",
    direccionFacturacion: "Dirección",
    tarifaHoraria: "",
    sedeNombre: "Nave 1",
    sedeDireccion: "Polígono 1",
    contactoNombre: "Ana",
    contactoTelefono: "600123456",
    contactoEmail: "",
  };

  it("devuelve cliente, primera sede y primer contacto", () => {
    expect(parseNuevoClienteForm(form({ ...base, contactoEnSede: "1" }))).toEqual({
      ok: true,
      value: {
        cliente: {
          razonSocial: "Cliente",
          nif: "B12345678",
          direccionFacturacion: "Dirección",
          tarifaHoraria: null,
        },
        sede: { nombre: "Nave 1", direccion: "Polígono 1" },
        contacto: { nombre: "Ana", telefono: "600123456", email: null },
        contactoEnSede: true,
      },
    });

    const sinVincular = parseNuevoClienteForm(form(base));
    expect(sinVincular.ok && sinVincular.value.contactoEnSede).toBe(false);
  });

  it("propaga el primer error en orden cliente, sede y contacto", () => {
    expect(parseNuevoClienteForm(form({ ...base, nif: "x" }))).toEqual({
      ok: false,
      error: "nif",
    });
    expect(parseNuevoClienteForm(form({ ...base, sedeDireccion: "" }))).toEqual({
      ok: false,
      error: "campos",
    });
    expect(
      parseNuevoClienteForm(form({ ...base, contactoTelefono: "", contactoEmail: "" })),
    ).toEqual({ ok: false, error: "contacto" });
  });
});
