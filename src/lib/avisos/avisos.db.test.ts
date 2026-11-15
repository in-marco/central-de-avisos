import { afterAll, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { disconnectDb, getDb } from "@/db/client";
import { inRollback, uniqueSuffix } from "@/db/db-test-utils";
import {
  createAviso,
  createAvisoInTransaction,
  getAvisoDetalle,
  getClienteParaAviso,
  listAvisos,
  listClientesParaAviso,
} from "./avisos";
import { PRIORIDADES, type NuevoAvisoValues } from "./validation";

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
