import { describe, expect, it } from "vitest";
import {
  DESCRIPCION_MAX_LENGTH,
  ESTADO_LABELS,
  ESTADOS,
  normalizeDescripcion,
  parseNuevoAvisoFields,
  parseNuevoAvisoForm,
  PRIORIDAD_LABELS,
  PRIORIDADES,
  type NuevoAvisoInput,
} from "./validation";

const CLIENTE = "11111111-1111-4111-8111-111111111111";
const SEDE = "22222222-2222-4222-8222-222222222222";
const CONTACTO = "33333333-3333-4333-8333-333333333333";

function input(overrides: Partial<NuevoAvisoInput> = {}): NuevoAvisoInput {
  return {
    clienteId: CLIENTE,
    sedeId: SEDE,
    contactoId: CONTACTO,
    descripcion: "La caldera no arranca.",
    prioridad: "NORMAL",
    ...overrides,
  };
}

describe("parseNuevoAvisoFields", () => {
  it.each(PRIORIDADES)("acepta la prioridad %s", (prioridad) => {
    const result = parseNuevoAvisoFields(input({ prioridad }));
    expect(result).toEqual({
      ok: true,
      value: {
        clienteId: CLIENTE,
        sedeId: SEDE,
        contactoId: CONTACTO,
        descripcion: "La caldera no arranca.",
        prioridad,
      },
    });
  });

  it.each([[""], ["normal"], ["BAJA"], [" NORMAL"], ["__proto__"]])(
    "rechaza la prioridad %j",
    (prioridad) => {
      expect(parseNuevoAvisoFields(input({ prioridad }))).toEqual({
        ok: false,
        error: "prioridad",
      });
    },
  );

  it.each([
    ["descripción vacía", ""],
    ["solo espacios", "   \n\t  "],
    ["2001 caracteres", "x".repeat(DESCRIPCION_MAX_LENGTH + 1)],
  ])("rechaza %s", (_label, descripcion) => {
    expect(parseNuevoAvisoFields(input({ descripcion }))).toEqual({
      ok: false,
      error: "descripcion",
    });
  });

  it("acepta 2000 caracteres y recorta extremos conservando saltos de línea", () => {
    const larga = parseNuevoAvisoFields(input({ descripcion: "y".repeat(2000) }));
    expect(larga.ok).toBe(true);

    const result = parseNuevoAvisoFields(
      input({ descripcion: "  Línea 1\r\nLínea 2\r\n\r\nLínea 4  " }),
    );
    expect(result.ok && result.value.descripcion).toBe("Línea 1\nLínea 2\n\nLínea 4");
  });

  it("cuenta \\r\\n como un solo carácter, como el maxLength del navegador", () => {
    const texto = `${"a".repeat(999)}\r\n${"b".repeat(1000)}`;
    expect(normalizeDescripcion(texto)?.length).toBe(2000);
  });

  it.each([
    ["clienteId", "no-encontrado"],
    ["sedeId", "sede"],
    ["contactoId", "contacto"],
  ] as const)("un %s vacío o que no es UUID da %s", (campo, error) => {
    for (const valor of ["", "no-es-uuid", "1234", `${CLIENTE}x`]) {
      expect(parseNuevoAvisoFields(input({ [campo]: valor }))).toEqual({
        ok: false,
        error,
      });
    }
  });

  it("normaliza los UUID a minúsculas", () => {
    const result = parseNuevoAvisoFields(
      input({ clienteId: ` ${CLIENTE.toUpperCase()} `, sedeId: SEDE.toUpperCase() }),
    );
    expect(result.ok && result.value.clienteId).toBe(CLIENTE);
    expect(result.ok && result.value.sedeId).toBe(SEDE);
  });
});

describe("parseNuevoAvisoForm", () => {
  it("ignora empresaId, estado, origen y creadoPorId del formulario", () => {
    const data = new FormData();
    data.set("clienteId", CLIENTE);
    data.set("sedeId", SEDE);
    data.set("contactoId", CONTACTO);
    data.set("descripcion", "Fuga de agua");
    data.set("prioridad", "URGENTE");
    data.set("empresaId", "44444444-4444-4444-8444-444444444444");
    data.set("estado", "PENDIENTE");
    data.set("origen", "CLIENTE");
    data.set("creadoPorId", "55555555-5555-4555-8555-555555555555");

    const result = parseNuevoAvisoForm(data);
    expect(result).toEqual({
      ok: true,
      value: {
        clienteId: CLIENTE,
        sedeId: SEDE,
        contactoId: CONTACTO,
        descripcion: "Fuga de agua",
        prioridad: "URGENTE",
      },
    });
  });

  it("un formulario vacío vuelve al paso del cliente", () => {
    expect(parseNuevoAvisoForm(new FormData())).toEqual({
      ok: false,
      error: "no-encontrado",
    });
  });
});

describe("etiquetas", () => {
  it("tiene etiqueta en español para cada prioridad y estado", () => {
    expect(PRIORIDADES.map((p) => PRIORIDAD_LABELS[p])).toEqual([
      "Normal",
      "Alta",
      "Urgente",
    ]);
    expect(ESTADOS.every((estado) => ESTADO_LABELS[estado].length > 0)).toBe(true);
    expect(ESTADO_LABELS.NUEVO).toBe("Nuevo");
  });
});
