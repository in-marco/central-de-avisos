import { afterAll, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { disconnectDb, getDb } from "@/db/client";
import { inRollback, uniqueSuffix } from "@/db/db-test-utils";
import { upsertContacto } from "@/lib/clientes/clientes";
import {
  cancelarAviso,
  cancelarAvisoInTransaction,
  countAvisosPorVista,
  createAviso,
  createAvisoInTransaction,
  findAvisoId,
  getAvisoDetalle,
  getClienteParaAviso,
  listAvisos,
  listBolsa,
  listClientesParaAviso,
  validarAviso,
  validarAvisoInTransaction,
} from "./avisos";
import { PRIORIDADES, type CancelacionValues, type NuevoAvisoValues } from "./validation";

afterAll(async () => {
  await disconnectDb();
});

const MISSING_ID = "00000000-0000-4000-8000-000000000000";

/**
 * Empresa con un usuario de oficina y un cliente con dos sedes y tres
 * contactos: uno de todo el cliente, uno de la sede 1 y uno de la sede 2.
 */
async function escenario(tx: Prisma.TransactionClient, suffix: string, tag: string) {
  const plan = await tx.plan.create({
    data: { nombre: `Plan avisos ${tag} ${suffix}`, importeMensual: "10.00" },
  });
  const empresa = await tx.empresa.create({
    data: {
      nombre: `Empresa avisos ${tag} ${suffix}`,
      nif: `${tag}${suffix}`.toUpperCase(),
      emailFacturacion: `facturacion-${tag}-${suffix}@example.com`,
      planId: plan.id,
    },
  });
  const usuario = await tx.usuario.create({
    data: {
      empresaId: empresa.id,
      email: `oficina-${tag}-${suffix}@example.com`,
      nombre: `Oficina ${tag}`,
      roles: ["OFICINA"],
    },
  });
  const cliente = await tx.cliente.create({
    data: {
      empresaId: empresa.id,
      razonSocial: `Cliente ${tag}`,
      nif: "B12345678",
      direccionFacturacion: "Calle Mayor 1",
    },
  });
  const sede1 = await tx.sede.create({
    data: { empresaId: empresa.id, clienteId: cliente.id, nombre: "Nave 1", direccion: "Polígono 1" },
  });
  const sede2 = await tx.sede.create({
    data: { empresaId: empresa.id, clienteId: cliente.id, nombre: "Nave 2", direccion: "Polígono 2" },
  });
  const contactoGeneral = await tx.contacto.create({
    data: { empresaId: empresa.id, clienteId: cliente.id, nombre: "Ana General", telefono: "600000001" },
  });
  const contactoSede1 = await tx.contacto.create({
    data: {
      empresaId: empresa.id,
      clienteId: cliente.id,
      sedeId: sede1.id,
      nombre: "Bea Sede 1",
      email: "bea@example.com",
    },
  });
  const contactoSede2 = await tx.contacto.create({
    data: {
      empresaId: empresa.id,
      clienteId: cliente.id,
      sedeId: sede2.id,
      nombre: "Carlos Sede 2",
      telefono: "600000002",
    },
  });
  const otroCliente = await tx.cliente.create({
    data: {
      empresaId: empresa.id,
      razonSocial: `Otro cliente ${tag}`,
      nif: "A87654321",
      direccionFacturacion: "Calle Menor 2",
    },
  });
  const otraSede = await tx.sede.create({
    data: { empresaId: empresa.id, clienteId: otroCliente.id, nombre: "Local", direccion: "Centro" },
  });
  const otroContacto = await tx.contacto.create({
    data: { empresaId: empresa.id, clienteId: otroCliente.id, nombre: "Dani Otro", telefono: "600000003" },
  });

  return {
    empresa,
    usuario,
    cliente,
    sede1,
    sede2,
    contactoGeneral,
    contactoSede1,
    contactoSede2,
    otroCliente,
    otraSede,
    otroContacto,
  };
}

type Escenario = Awaited<ReturnType<typeof escenario>>;

function valores(e: Escenario, overrides: Partial<NuevoAvisoValues> = {}): NuevoAvisoValues {
  return {
    clienteId: e.cliente.id,
    sedeId: e.sede1.id,
    contactoId: e.contactoSede1.id,
    descripcion: "La caldera no arranca.\nRevisar quemador.",
    prioridad: "NORMAL",
    ...overrides,
  };
}

describe("alta de aviso de oficina", () => {
  it.each(PRIORIDADES)("crea un aviso %s con origen OFICINA, estado NUEVO y creador", async (prioridad) => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const e = await escenario(tx, suffix, "alta");
      const created = await createAvisoInTransaction(
        tx,
        e.empresa.id,
        e.usuario.id,
        valores(e, { prioridad }),
      );

      if (!created.ok) {
        throw new Error(created.error);
      }

      const fila = await tx.aviso.findUniqueOrThrow({ where: { id: created.avisoId } });
      return { e, fila };
    });

    expect(result.fila).toMatchObject({
      empresaId: result.e.empresa.id,
      clienteId: result.e.cliente.id,
      sedeId: result.e.sede1.id,
      contactoId: result.e.contactoSede1.id,
      descripcion: "La caldera no arranca.\nRevisar quemador.",
      prioridad,
      origen: "OFICINA",
      estado: "NUEVO",
      creadoPorId: result.e.usuario.id,
    });
  });

  it("ignora estado, origen y empresaId aunque lleguen en los valores", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const e = await escenario(tx, suffix, "fijo");
      const otra = await escenario(tx, suffix, "fijob");
      const values = {
        ...valores(e),
        estado: "PENDIENTE",
        origen: "CLIENTE",
        empresaId: otra.empresa.id,
        creadoPorId: otra.usuario.id,
      } as NuevoAvisoValues;
      const created = await createAvisoInTransaction(tx, e.empresa.id, e.usuario.id, values);

      if (!created.ok) {
        throw new Error(created.error);
      }

      return { e, fila: await tx.aviso.findUniqueOrThrow({ where: { id: created.avisoId } }) };
    });

    expect(result.fila.estado).toBe("NUEVO");
    expect(result.fila.origen).toBe("OFICINA");
    expect(result.fila.empresaId).toBe(result.e.empresa.id);
    expect(result.fila.creadoPorId).toBe(result.e.usuario.id);
  });

  it("acepta un contacto de todo el cliente con cualquier sede", async () => {
    const suffix = uniqueSuffix();

    const created = await inRollback(async (tx) => {
      const e = await escenario(tx, suffix, "general");
      return createAvisoInTransaction(
        tx,
        e.empresa.id,
        e.usuario.id,
        valores(e, { sedeId: e.sede2.id, contactoId: e.contactoGeneral.id }),
      );
    });

    expect(created.ok).toBe(true);
  });

  it("rechaza cliente, sede y contacto que no encajan sin crear filas", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const e = await escenario(tx, suffix, "rech");
      const b = await escenario(tx, suffix, "rechb");
      const crear = (overrides: Partial<NuevoAvisoValues>) =>
        createAvisoInTransaction(tx, e.empresa.id, e.usuario.id, valores(e, overrides));

      const resultados = {
        clienteInexistente: await crear({ clienteId: MISSING_ID }),
        clienteNoUuid: await crear({ clienteId: "no-es-uuid" }),
        clienteDeB: await crear({
          clienteId: b.cliente.id,
          sedeId: b.sede1.id,
          contactoId: b.contactoSede1.id,
        }),
        sedeInexistente: await crear({ sedeId: MISSING_ID }),
        sedeDeOtroCliente: await crear({ sedeId: e.otraSede.id }),
        sedeDeB: await crear({ sedeId: b.sede1.id }),
        contactoInexistente: await crear({ contactoId: MISSING_ID }),
        contactoDeOtroCliente: await crear({ contactoId: e.otroContacto.id }),
        contactoDeB: await crear({ contactoId: b.contactoGeneral.id }),
        contactoDeOtraSede: await crear({ sedeId: e.sede1.id, contactoId: e.contactoSede2.id }),
      };

      const filas = await tx.aviso.count({
        where: { empresaId: { in: [e.empresa.id, b.empresa.id] } },
      });
      return { resultados, filas };
    });

    expect(result.resultados).toEqual({
      clienteInexistente: { ok: false, error: "no-encontrado" },
      clienteNoUuid: { ok: false, error: "no-encontrado" },
      clienteDeB: { ok: false, error: "no-encontrado" },
      sedeInexistente: { ok: false, error: "sede" },
      sedeDeOtroCliente: { ok: false, error: "sede" },
      sedeDeB: { ok: false, error: "sede" },
      contactoInexistente: { ok: false, error: "contacto" },
      contactoDeOtroCliente: { ok: false, error: "contacto" },
      contactoDeB: { ok: false, error: "contacto" },
      contactoDeOtraSede: { ok: false, error: "contacto" },
    });
    expect(result.filas).toBe(0);
  });

  it("createAviso confirma la transacción y el aviso es visible después", async () => {
    const db = getDb();
    const suffix = uniqueSuffix();
    // Datos confirmados de verdad: se borran al final del test.
    const e = await db.$transaction((tx) => escenario(tx, suffix, "commit"));

    try {
      const created = await createAviso(db, e.empresa.id, e.usuario.id, valores(e));
      expect(created.ok).toBe(true);
      const listado = await listAvisos(db, e.empresa.id);
      expect(listado).toHaveLength(1);
    } finally {
      await db.aviso.deleteMany({ where: { empresaId: e.empresa.id } });
      await db.contacto.deleteMany({ where: { empresaId: e.empresa.id } });
      await db.sede.deleteMany({ where: { empresaId: e.empresa.id } });
      await db.cliente.deleteMany({ where: { empresaId: e.empresa.id } });
      await db.usuario.deleteMany({ where: { empresaId: e.empresa.id } });
      await db.empresa.delete({ where: { id: e.empresa.id } });
      await db.plan.delete({ where: { id: e.empresa.planId } });
    }
  });
});

describe("listado y detalle de avisos", () => {
  it("lista del más reciente al más antiguo y el detalle trae cliente, sede, contacto y creador", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const e = await escenario(tx, suffix, "list");
      const ids: string[] = [];

      for (const prioridad of PRIORIDADES) {
        const created = await createAvisoInTransaction(
          tx,
          e.empresa.id,
          e.usuario.id,
          valores(e, { prioridad, descripcion: `Aviso ${prioridad}` }),
        );

        if (!created.ok) {
          throw new Error(created.error);
        }

        // Fechas distintas para que el orden no dependa del reloj.
        await tx.aviso.update({
          where: { id: created.avisoId },
          data: { creadoEn: new Date(Date.UTC(2026, 0, ids.length + 1)) },
        });
        ids.push(created.avisoId);
      }

      const listado = await listAvisos(tx, e.empresa.id);
      const detalle = await getAvisoDetalle(tx, e.empresa.id, ids[0]!);
      const detalleMayusculas = await getAvisoDetalle(tx, e.empresa.id, ids[0]!.toUpperCase());
      return { e, ids, listado, detalle, detalleMayusculas };
    });

    expect(result.listado.map((aviso) => aviso.id)).toEqual([...result.ids].reverse());
    expect(result.listado[0]).toMatchObject({
      prioridad: "URGENTE",
      estado: "NUEVO",
      descripcion: "Aviso URGENTE",
      cliente: "Cliente list",
      sede: "Nave 1",
    });
    expect(result.detalle).toMatchObject({
      id: result.ids[0],
      prioridad: "NORMAL",
      origen: "OFICINA",
      estado: "NUEVO",
      cliente: { id: result.e.cliente.id, razonSocial: "Cliente list" },
      sede: { nombre: "Nave 1", direccion: "Polígono 1" },
      contacto: { nombre: "Bea Sede 1", telefono: null, email: "bea@example.com" },
      creadoPor: { nombre: "Oficina list" },
    });
    expect(result.detalleMayusculas?.id).toBe(result.ids[0]);
  });

  it("getAvisoDetalle devuelve null para ids inexistentes o que no son UUID", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const e = await escenario(tx, suffix, "nulo");
      return {
        inexistente: await getAvisoDetalle(tx, e.empresa.id, MISSING_ID),
        noUuid: await getAvisoDetalle(tx, e.empresa.id, "no-es-uuid"),
        vacio: await getAvisoDetalle(tx, e.empresa.id, ""),
      };
    });

    expect(result).toEqual({ inexistente: null, noUuid: null, vacio: null });
  });

  it("getClienteParaAviso trae sedes y contactos con su sede, o null si no es de la empresa", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const e = await escenario(tx, suffix, "paso");
      const b = await escenario(tx, suffix, "pasob");
      return {
        e,
        cliente: await getClienteParaAviso(tx, e.empresa.id, e.cliente.id),
        clienteDeB: await getClienteParaAviso(tx, e.empresa.id, b.cliente.id),
        noUuid: await getClienteParaAviso(tx, e.empresa.id, "x"),
        clientes: await listClientesParaAviso(tx, e.empresa.id),
      };
    });

    expect(result.cliente?.sedes.map((sede) => sede.nombre)).toEqual(["Nave 1", "Nave 2"]);
    expect(result.cliente?.contactos).toEqual([
      { id: result.e.contactoGeneral.id, nombre: "Ana General", sedeId: null },
      { id: result.e.contactoSede1.id, nombre: "Bea Sede 1", sedeId: result.e.sede1.id },
      { id: result.e.contactoSede2.id, nombre: "Carlos Sede 2", sedeId: result.e.sede2.id },
    ]);
    expect(result.clienteDeB).toBeNull();
    expect(result.noUuid).toBeNull();
    expect(result.clientes.map((cliente) => cliente.razonSocial)).toEqual([
      "Cliente paso",
      "Otro cliente paso",
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Validación, cancelación y bolsa (aviso-validation-pool).                   */
/* -------------------------------------------------------------------------- */

async function crearAvisoNuevo(
  tx: Prisma.TransactionClient,
  e: Escenario,
  overrides: Partial<NuevoAvisoValues> = {},
): Promise<string> {
  const created = await createAvisoInTransaction(tx, e.empresa.id, e.usuario.id, valores(e, overrides));

  if (!created.ok) {
    throw new Error(created.error);
  }

  return created.avisoId;
}

function cancelacion(avisoId: string, motivo = "Duplicado de otro aviso."): CancelacionValues {
  return { avisoId, motivo };
}

async function borrarEscenario(e: Escenario) {
  const db = getDb();
  await db.aviso.deleteMany({ where: { empresaId: e.empresa.id } });
  await db.contacto.deleteMany({ where: { empresaId: e.empresa.id } });
  await db.sede.deleteMany({ where: { empresaId: e.empresa.id } });
  await db.cliente.deleteMany({ where: { empresaId: e.empresa.id } });
  await db.usuario.deleteMany({ where: { empresaId: e.empresa.id } });
  await db.empresa.delete({ where: { id: e.empresa.id } });
  await db.plan.delete({ where: { id: e.empresa.planId } });
}

describe("validar aviso", () => {
  it("valida un aviso NUEVO coherente: PENDIENTE con fecha y autor de la sesión", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const e = await escenario(tx, suffix, "val");
      const avisoId = await crearAvisoNuevo(tx, e);
      const antes = Date.now();
      const validado = await validarAvisoInTransaction(tx, e.empresa.id, e.usuario.id, avisoId);
      const fila = await tx.aviso.findUniqueOrThrow({ where: { id: avisoId } });
      const detalle = await getAvisoDetalle(tx, e.empresa.id, avisoId);
      return { e, avisoId, antes, validado, fila, detalle };
    });

    expect(result.validado).toEqual({ ok: true, avisoId: result.avisoId });
    expect(result.fila.estado).toBe("PENDIENTE");
    expect(result.fila.validadoPorId).toBe(result.e.usuario.id);
    expect(result.fila.validadoEn).toBeInstanceOf(Date);
    expect(result.fila.validadoEn!.getTime()).toBeGreaterThanOrEqual(result.antes - 1000);
    expect(result.fila.canceladoEn).toBeNull();
    expect(result.detalle).toMatchObject({
      estado: "PENDIENTE",
      validadoPor: { nombre: "Oficina val" },
      canceladoPor: null,
      motivoCancelacion: null,
    });
  });

  it("acepta mayúsculas en el id y un contacto de todo el cliente", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const e = await escenario(tx, suffix, "valgen");
      const avisoId = await crearAvisoNuevo(tx, e, {
        sedeId: e.sede2.id,
        contactoId: e.contactoGeneral.id,
      });
      return validarAvisoInTransaction(tx, e.empresa.id, e.usuario.id, avisoId.toUpperCase());
    });

    expect(result.ok).toBe(true);
  });

  it("rechaza un aviso cuyo contacto se movió a otra sede y lo acepta tras corregirlo", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const e = await escenario(tx, suffix, "inc");
      const avisoId = await crearAvisoNuevo(tx, e, {
        sedeId: e.sede1.id,
        contactoId: e.contactoSede1.id,
      });
      // Edición desde la ficha del cliente: el contacto pasa a la sede 2.
      const movido = await upsertContacto(tx, e.empresa.id, {
        clienteId: e.cliente.id,
        contactoId: e.contactoSede1.id,
        values: { nombre: "Bea Sede 1", telefono: null, email: "bea@example.com", sedeId: e.sede2.id },
      });
      const incompleto = await validarAvisoInTransaction(tx, e.empresa.id, e.usuario.id, avisoId);
      const filaIncompleta = await tx.aviso.findUniqueOrThrow({ where: { id: avisoId } });
      // Corrección: el contacto pasa a ser de todo el cliente.
      await upsertContacto(tx, e.empresa.id, {
        clienteId: e.cliente.id,
        contactoId: e.contactoSede1.id,
        values: { nombre: "Bea Sede 1", telefono: null, email: "bea@example.com", sedeId: null },
      });
      const corregido = await validarAvisoInTransaction(tx, e.empresa.id, e.usuario.id, avisoId);
      return { avisoId, movido, incompleto, filaIncompleta, corregido };
    });

    expect(result.movido.ok).toBe(true);
    expect(result.incompleto).toEqual({
      ok: false,
      error: "incompleto",
      avisoId: result.avisoId,
      problemas: ["contacto-sede"],
    });
    expect(result.filaIncompleta).toMatchObject({
      estado: "NUEVO",
      validadoEn: null,
      validadoPorId: null,
    });
    expect(result.corregido).toEqual({ ok: true, avisoId: result.avisoId });
  });

  it("rechaza validar un aviso PENDIENTE o CANCELADO con estado y sin escribir", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const e = await escenario(tx, suffix, "valest");
      const pendiente = await crearAvisoNuevo(tx, e);
      const cancelado = await crearAvisoNuevo(tx, e);
      await validarAvisoInTransaction(tx, e.empresa.id, e.usuario.id, pendiente);
      await cancelarAvisoInTransaction(tx, e.empresa.id, e.usuario.id, cancelacion(cancelado));
      const filaPendiente = await tx.aviso.findUniqueOrThrow({ where: { id: pendiente } });
      return {
        pendiente,
        cancelado,
        filaPendiente,
        otraVez: await validarAvisoInTransaction(tx, e.empresa.id, e.usuario.id, pendiente),
        deCancelado: await validarAvisoInTransaction(tx, e.empresa.id, e.usuario.id, cancelado),
        filaPendienteDespues: await tx.aviso.findUniqueOrThrow({ where: { id: pendiente } }),
        filaCancelada: await tx.aviso.findUniqueOrThrow({ where: { id: cancelado } }),
      };
    });

    expect(result.otraVez).toEqual({ ok: false, error: "estado", avisoId: result.pendiente });
    expect(result.deCancelado).toEqual({ ok: false, error: "estado", avisoId: result.cancelado });
    expect(result.filaPendienteDespues.validadoEn).toEqual(result.filaPendiente.validadoEn);
    expect(result.filaCancelada).toMatchObject({ estado: "CANCELADO", validadoEn: null });
  });

  it("trata ids vacíos, no UUID, inexistentes o de otra empresa como no-encontrado", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const e = await escenario(tx, suffix, "valnf");
      const b = await escenario(tx, suffix, "valnfb");
      const avisoDeB = await crearAvisoNuevo(tx, b);
      const validar = (id: string) => validarAvisoInTransaction(tx, e.empresa.id, e.usuario.id, id);
      return {
        vacio: await validar(""),
        noUuid: await validar("no-es-uuid"),
        inexistente: await validar(MISSING_ID),
        deB: await validar(avisoDeB),
        filaDeB: await tx.aviso.findUniqueOrThrow({ where: { id: avisoDeB } }),
        findDeB: await findAvisoId(tx, e.empresa.id, avisoDeB),
        findPropio: await findAvisoId(tx, b.empresa.id, avisoDeB.toUpperCase()),
      };
    });

    const noEncontrado = { ok: false, error: "no-encontrado" };
    expect(result.vacio).toEqual(noEncontrado);
    expect(result.noUuid).toEqual(noEncontrado);
    expect(result.inexistente).toEqual(noEncontrado);
    expect(result.deB).toEqual(noEncontrado);
    expect(result.filaDeB).toMatchObject({ estado: "NUEVO", validadoEn: null });
    expect(result.findDeB).toBeNull();
    expect(result.findPropio).toBe(result.filaDeB.id);
  });
});

describe("cancelar aviso", () => {
  it("cancela un aviso NUEVO con motivo, fecha y autor", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const e = await escenario(tx, suffix, "can");
      const avisoId = await crearAvisoNuevo(tx, e);
      const cancelado = await cancelarAvisoInTransaction(
        tx,
        e.empresa.id,
        e.usuario.id,
        cancelacion(avisoId, "Resuelto por el cliente.\nNo hace falta ir."),
      );
      const fila = await tx.aviso.findUniqueOrThrow({ where: { id: avisoId } });
      const detalle = await getAvisoDetalle(tx, e.empresa.id, avisoId);
      return { e, avisoId, cancelado, fila, detalle };
    });

    expect(result.cancelado).toEqual({ ok: true, avisoId: result.avisoId });
    expect(result.fila).toMatchObject({
      estado: "CANCELADO",
      motivoCancelacion: "Resuelto por el cliente.\nNo hace falta ir.",
      canceladoPorId: result.e.usuario.id,
      validadoEn: null,
      validadoPorId: null,
    });
    expect(result.fila.canceladoEn).toBeInstanceOf(Date);
    expect(result.detalle).toMatchObject({
      canceladoPor: { nombre: "Oficina can" },
      motivoCancelacion: "Resuelto por el cliente.\nNo hace falta ir.",
    });
  });

  it("cancela un aviso PENDIENTE conservando la validación y lo saca de la bolsa", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const e = await escenario(tx, suffix, "canpen");
      const avisoId = await crearAvisoNuevo(tx, e);
      await validarAvisoInTransaction(tx, e.empresa.id, e.usuario.id, avisoId);
      const bolsaAntes = await listBolsa(tx, e.empresa.id);
      const validada = await tx.aviso.findUniqueOrThrow({ where: { id: avisoId } });
      const cancelado = await cancelarAvisoInTransaction(
        tx,
        e.empresa.id,
        e.usuario.id,
        cancelacion(avisoId),
      );
      return {
        e,
        avisoId,
        bolsaAntes,
        validada,
        cancelado,
        fila: await tx.aviso.findUniqueOrThrow({ where: { id: avisoId } }),
        bolsaDespues: await listBolsa(tx, e.empresa.id),
        cancelados: await listAvisos(tx, e.empresa.id, "cancelados"),
      };
    });

    expect(result.bolsaAntes.map((aviso) => aviso.id)).toEqual([result.avisoId]);
    expect(result.cancelado.ok).toBe(true);
    expect(result.fila).toMatchObject({
      estado: "CANCELADO",
      validadoPorId: result.e.usuario.id,
      validadoEn: result.validada.validadoEn,
    });
    expect(result.bolsaDespues).toEqual([]);
    expect(result.cancelados.map((aviso) => aviso.id)).toEqual([result.avisoId]);
  });

  it("rechaza cancelar un aviso CANCELADO o en un estado posterior sin escribir", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const e = await escenario(tx, suffix, "canest");
      const cancelado = await crearAvisoNuevo(tx, e);
      await cancelarAvisoInTransaction(tx, e.empresa.id, e.usuario.id, cancelacion(cancelado, "Primero"));
      const asignado = await crearAvisoNuevo(tx, e);
      // Estado posterior simulado directamente (la asignación es de otra feature).
      await tx.aviso.update({
        where: { id: asignado },
        data: { estado: "ASIGNADO", validadoEn: new Date(), validadoPorId: e.usuario.id },
      });
      const cancelar = (id: string) =>
        cancelarAvisoInTransaction(tx, e.empresa.id, e.usuario.id, cancelacion(id, "Segundo"));
      return {
        cancelado,
        asignado,
        otraVez: await cancelar(cancelado),
        deAsignado: await cancelar(asignado),
        filaCancelada: await tx.aviso.findUniqueOrThrow({ where: { id: cancelado } }),
        filaAsignada: await tx.aviso.findUniqueOrThrow({ where: { id: asignado } }),
      };
    });

    expect(result.otraVez).toEqual({ ok: false, error: "estado", avisoId: result.cancelado });
    expect(result.deAsignado).toEqual({ ok: false, error: "estado", avisoId: result.asignado });
    expect(result.filaCancelada.motivoCancelacion).toBe("Primero");
    expect(result.filaAsignada).toMatchObject({ estado: "ASIGNADO", canceladoEn: null });
  });

  it("trata ids inexistentes, no UUID o de otra empresa como no-encontrado", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const e = await escenario(tx, suffix, "cannf");
      const b = await escenario(tx, suffix, "cannfb");
      const avisoDeB = await crearAvisoNuevo(tx, b);
      const cancelar = (id: string) =>
        cancelarAvisoInTransaction(tx, e.empresa.id, e.usuario.id, cancelacion(id));
      return {
        noUuid: await cancelar("x"),
        inexistente: await cancelar(MISSING_ID),
        deB: await cancelar(avisoDeB),
        filaDeB: await tx.aviso.findUniqueOrThrow({ where: { id: avisoDeB } }),
      };
    });

    expect(result.noUuid).toEqual({ ok: false, error: "no-encontrado" });
    expect(result.inexistente).toEqual({ ok: false, error: "no-encontrado" });
    expect(result.deB).toEqual({ ok: false, error: "no-encontrado" });
    expect(result.filaDeB).toMatchObject({ estado: "NUEVO", canceladoEn: null });
  });

  it("ignora estado, empresa y autor aunque lleguen en los valores", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const e = await escenario(tx, suffix, "canign");
      const b = await escenario(tx, suffix, "canignb");
      const avisoId = await crearAvisoNuevo(tx, e);
      const values = {
        ...cancelacion(avisoId),
        estado: "PENDIENTE",
        empresaId: b.empresa.id,
        canceladoPorId: b.usuario.id,
      } as CancelacionValues;
      await cancelarAvisoInTransaction(tx, e.empresa.id, e.usuario.id, values);
      return { e, fila: await tx.aviso.findUniqueOrThrow({ where: { id: avisoId } }) };
    });

    expect(result.fila).toMatchObject({
      estado: "CANCELADO",
      empresaId: result.e.empresa.id,
      canceladoPorId: result.e.usuario.id,
    });
  });
});

describe("vistas del listado y bolsa", () => {
  it("ordena la bolsa por prioridad y antigüedad y cuenta cada vista", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const e = await escenario(tx, suffix, "bolsa");
      const b = await escenario(tx, suffix, "bolsab");
      // Orden de creación deliberadamente distinto del orden esperado.
      const plan: Array<[string, NuevoAvisoValues["prioridad"], number]> = [
        ["normal", "NORMAL", 1],
        ["urgente-reciente", "URGENTE", 5],
        ["alta", "ALTA", 3],
        ["urgente-antiguo", "URGENTE", 2],
        ["nuevo-normal", "NORMAL", 4],
        ["nuevo-urgente", "URGENTE", 6],
        ["cancelado-1", "ALTA", 7],
        ["cancelado-2", "NORMAL", 8],
      ];
      const ids: Record<string, string> = {};

      for (const [nombre, prioridad, dia] of plan) {
        const id = await crearAvisoNuevo(tx, e, { prioridad, descripcion: nombre });
        await tx.aviso.update({
          where: { id },
          data: { creadoEn: new Date(Date.UTC(2026, 0, dia)) },
        });
        ids[nombre] = id;
      }

      for (const nombre of ["normal", "urgente-reciente", "alta", "urgente-antiguo", "cancelado-2"]) {
        await validarAvisoInTransaction(tx, e.empresa.id, e.usuario.id, ids[nombre]!);
      }

      await cancelarAvisoInTransaction(tx, e.empresa.id, e.usuario.id, cancelacion(ids["cancelado-1"]!));
      await cancelarAvisoInTransaction(tx, e.empresa.id, e.usuario.id, cancelacion(ids["cancelado-2"]!));
      // Un aviso en la bolsa de B nunca aparece en la de A.
      const avisoDeB = await crearAvisoNuevo(tx, b, { prioridad: "URGENTE" });
      await validarAvisoInTransaction(tx, b.empresa.id, b.usuario.id, avisoDeB);

      const nombres = (lista: Array<{ descripcion: string }>) => lista.map((a) => a.descripcion);
      return {
        bolsa: nombres(await listBolsa(tx, e.empresa.id)),
        vistaBolsa: nombres(await listAvisos(tx, e.empresa.id, "bolsa")),
        porValidar: nombres(await listAvisos(tx, e.empresa.id, "por-validar")),
        cancelados: nombres(await listAvisos(tx, e.empresa.id, "cancelados")),
        todos: nombres(await listAvisos(tx, e.empresa.id, "todos")),
        recuento: await countAvisosPorVista(tx, e.empresa.id),
        recuentoB: await countAvisosPorVista(tx, b.empresa.id),
        bolsaB: (await listBolsa(tx, b.empresa.id)).map((a) => a.id),
        avisoDeB,
      };
    });

    expect(result.bolsa).toEqual(["urgente-antiguo", "urgente-reciente", "alta", "normal"]);
    expect(result.vistaBolsa).toEqual(result.bolsa);
    expect(result.porValidar).toEqual(["nuevo-urgente", "nuevo-normal"]);
    expect(result.cancelados).toEqual(["cancelado-2", "cancelado-1"]);
    expect(result.todos).toEqual([
      "cancelado-2",
      "cancelado-1",
      "nuevo-urgente",
      "urgente-reciente",
      "nuevo-normal",
      "alta",
      "urgente-antiguo",
      "normal",
    ]);
    expect(result.recuento).toEqual({ todos: 8, "por-validar": 2, bolsa: 4, cancelados: 2 });
    expect(result.recuentoB).toEqual({ todos: 1, "por-validar": 0, bolsa: 1, cancelados: 0 });
    expect(result.bolsaB).toEqual([result.avisoDeB]);
  });

  it("cuenta cero en todas las vistas de una empresa sin avisos", async () => {
    const suffix = uniqueSuffix();

    const recuento = await inRollback(async (tx) => {
      const e = await escenario(tx, suffix, "vacia");
      return countAvisosPorVista(tx, e.empresa.id);
    });

    expect(recuento).toEqual({ todos: 0, "por-validar": 0, bolsa: 0, cancelados: 0 });
  });
});

describe("concurrencia real de validar y cancelar", () => {
  it("dos validaciones simultáneas del mismo aviso: una gana y la otra recibe estado", async () => {
    const db = getDb();
    const suffix = uniqueSuffix();
    const e = await db.$transaction((tx) => escenario(tx, suffix, "concval"));

    try {
      const avisoId = await db.$transaction((tx) => crearAvisoNuevo(tx, e));
      const otro = await db.usuario.create({
        data: {
          empresaId: e.empresa.id,
          email: `oficina2-concval-${suffix}@example.com`,
          nombre: "Oficina 2",
          roles: ["OFICINA"],
        },
      });
      const resultados = await Promise.all([
        validarAviso(db, e.empresa.id, e.usuario.id, avisoId),
        validarAviso(db, e.empresa.id, otro.id, avisoId),
      ]);
      const ganadores = resultados.filter((r) => r.ok);
      const perdedores = resultados.filter((r) => !r.ok);
      expect(ganadores).toHaveLength(1);
      expect(perdedores).toEqual([{ ok: false, error: "estado", avisoId }]);

      const fila = await db.aviso.findUniqueOrThrow({ where: { id: avisoId } });
      const ganador = resultados[0]!.ok ? e.usuario.id : otro.id;
      expect(fila.estado).toBe("PENDIENTE");
      expect(fila.validadoPorId).toBe(ganador);
    } finally {
      await borrarEscenario(e);
    }
  });

  it("dos cancelaciones simultáneas del mismo aviso: una gana y la otra recibe estado", async () => {
    const db = getDb();
    const suffix = uniqueSuffix();
    const e = await db.$transaction((tx) => escenario(tx, suffix, "conccan"));

    try {
      const avisoId = await db.$transaction((tx) => crearAvisoNuevo(tx, e));
      await validarAviso(db, e.empresa.id, e.usuario.id, avisoId);
      const resultados = await Promise.all([
        cancelarAviso(db, e.empresa.id, e.usuario.id, cancelacion(avisoId, "Motivo A")),
        cancelarAviso(db, e.empresa.id, e.usuario.id, cancelacion(avisoId, "Motivo B")),
      ]);
      expect(resultados.filter((r) => r.ok)).toHaveLength(1);
      expect(resultados.filter((r) => !r.ok)).toEqual([{ ok: false, error: "estado", avisoId }]);

      const fila = await db.aviso.findUniqueOrThrow({ where: { id: avisoId } });
      expect(fila.estado).toBe("CANCELADO");
      expect(fila.motivoCancelacion).toBe(resultados[0]!.ok ? "Motivo A" : "Motivo B");
      expect(fila.validadoPorId).toBe(e.usuario.id);
    } finally {
      await borrarEscenario(e);
    }
  });

  it("validar y cancelar a la vez: nunca quedan las dos transiciones", async () => {
    const db = getDb();
    const suffix = uniqueSuffix();
    const e = await db.$transaction((tx) => escenario(tx, suffix, "concmix"));

    try {
      const avisoId = await db.$transaction((tx) => crearAvisoNuevo(tx, e));
      const [validado, cancelado] = await Promise.all([
        validarAviso(db, e.empresa.id, e.usuario.id, avisoId),
        cancelarAviso(db, e.empresa.id, e.usuario.id, cancelacion(avisoId)),
      ]);
      const fila = await db.aviso.findUniqueOrThrow({ where: { id: avisoId } });
      // Si la validación gana, la cancelación (PENDIENTE es cancelable) también
      // puede aplicarse después; si gana la cancelación, la validación falla.
      expect(cancelado.ok || validado.ok).toBe(true);
      if (!validado.ok) {
        expect(validado).toEqual({ ok: false, error: "estado", avisoId });
        expect(fila).toMatchObject({ estado: "CANCELADO", validadoEn: null });
      } else {
        expect(["PENDIENTE", "CANCELADO"]).toContain(fila.estado);
      }
    } finally {
      await borrarEscenario(e);
    }
  });
});
