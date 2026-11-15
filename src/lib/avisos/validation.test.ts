import { describe, expect, it } from "vitest";
import {
  DESCRIPCION_MAX_LENGTH,
  ESTADO_LABELS,
  ESTADOS,
  ESTADOS_CANCELABLES,
  isEstadoCancelable,
  MOTIVO_CANCELACION_MAX_LENGTH,
  normalizeDescripcion,
  normalizeMotivo,
  parseAvisoIdForm,
  parseCancelacionFields,
  parseCancelacionForm,
  parseNuevoAvisoFields,
  parseNuevoAvisoForm,
  parseVista,
  PRIORIDAD_LABELS,
  PRIORIDADES,
  PROBLEMA_VALIDACION_LABELS,
  problemasParaValidar,
  VISTA_LABELS,
  VISTAS,
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

const AVISO = "44444444-4444-4444-8444-444444444444";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("parseAvisoIdForm", () => {
  it("normaliza un UUID válido", () => {
    expect(parseAvisoIdForm(form({ avisoId: ` ${AVISO.toUpperCase()} ` }))).toEqual({
      ok: true,
      value: { avisoId: AVISO },
    });
  });

  it.each(["", "x", "123", "__proto__"])("rechaza %j como no-encontrado", (avisoId) => {
    expect(parseAvisoIdForm(form({ avisoId }))).toEqual({ ok: false, error: "no-encontrado" });
  });

  it("rechaza la ausencia del campo e ignora estado/empresa/usuario del formulario", () => {
    expect(parseAvisoIdForm(form({ estado: "PENDIENTE" }))).toEqual({
      ok: false,
      error: "no-encontrado",
    });
    expect(
      parseAvisoIdForm(
        form({ avisoId: AVISO, estado: "CANCELADO", empresaId: CLIENTE, validadoPorId: SEDE }),
      ),
    ).toEqual({ ok: true, value: { avisoId: AVISO } });
  });
});

describe("parseCancelacionFields", () => {
  const base = { avisoId: AVISO, motivo: "El cliente lo ha resuelto.", confirmar: "si" };

  it("acepta un motivo recortado con la confirmación", () => {
    expect(parseCancelacionFields({ ...base, motivo: "  Duplicado  " })).toEqual({
      ok: true,
      value: { avisoId: AVISO, motivo: "Duplicado" },
    });
  });

  it("normaliza CRLF y CR a LF y conserva los saltos y los acentos", () => {
    expect(normalizeMotivo("Línea uno\r\nLínea dos\rtres")).toBe("Línea uno\nLínea dos\ntres");
  });

  it.each([
    ["vacío", ""],
    ["solo espacios", "   \n\t "],
    ["de 501 caracteres", "x".repeat(MOTIVO_CANCELACION_MAX_LENGTH + 1)],
  ])("rechaza el motivo %s", (_nombre, motivo) => {
    expect(parseCancelacionFields({ ...base, motivo })).toEqual({ ok: false, error: "motivo" });
  });

  it("acepta exactamente 500 caracteres", () => {
    const motivo = "x".repeat(MOTIVO_CANCELACION_MAX_LENGTH);
    expect(parseCancelacionFields({ ...base, motivo })).toEqual({
      ok: true,
      value: { avisoId: AVISO, motivo },
    });
  });

  it.each(["", "on", "true", "SI", "no"])("exige confirmar=si (recibido %j)", (confirmar) => {
    expect(parseCancelacionFields({ ...base, confirmar })).toEqual({
      ok: false,
      error: "confirmacion",
    });
  });

  it("comprueba el aviso antes que el motivo y el motivo antes que la confirmación", () => {
    expect(parseCancelacionFields({ avisoId: "x", motivo: "", confirmar: "" })).toEqual({
      ok: false,
      error: "no-encontrado",
    });
    expect(parseCancelacionFields({ ...base, motivo: "", confirmar: "" })).toEqual({
      ok: false,
      error: "motivo",
    });
  });

  it("lee el formulario e ignora campos de servidor", () => {
    expect(
      parseCancelacionForm(
        form({
          avisoId: AVISO,
          motivo: "Duplicado",
          confirmar: "si",
          estado: "NUEVO",
          canceladoPorId: SEDE,
          empresaId: CLIENTE,
        }),
      ),
    ).toEqual({ ok: true, value: { avisoId: AVISO, motivo: "Duplicado" } });
    expect(parseCancelacionForm(form({ avisoId: AVISO, motivo: "Duplicado" }))).toEqual({
      ok: false,
      error: "confirmacion",
    });
  });
});

describe("problemasParaValidar", () => {
  it("no encuentra problemas con un contacto de todo el cliente o de la sede del aviso", () => {
    expect(problemasParaValidar({ sedeId: SEDE, contacto: { sedeId: null } })).toEqual([]);
    expect(problemasParaValidar({ sedeId: SEDE, contacto: { sedeId: SEDE } })).toEqual([]);
  });

  it("detecta un contacto vinculado a otra sede", () => {
    expect(problemasParaValidar({ sedeId: SEDE, contacto: { sedeId: CONTACTO } })).toEqual([
      "contacto-sede",
    ]);
    expect(PROBLEMA_VALIDACION_LABELS["contacto-sede"]).toContain("contacto");
  });
});

describe("estados cancelables", () => {
  it("solo NUEVO y PENDIENTE", () => {
    expect(ESTADOS_CANCELABLES).toEqual(["NUEVO", "PENDIENTE"]);
    expect(ESTADOS.filter(isEstadoCancelable)).toEqual(["NUEVO", "PENDIENTE"]);
  });
});

describe("parseVista", () => {
  it.each(VISTAS)("reconoce la vista %s", (vista) => {
    expect(parseVista(vista)).toBe(vista);
    expect(VISTA_LABELS[vista].length).toBeGreaterThan(0);
  });

  it.each([undefined, "", "BOLSA", "x", "__proto__", "constructor", "toString", "hasOwnProperty"])(
    "trata %j como todos",
    (value) => {
      expect(parseVista(value)).toBe("todos");
    },
  );
});
