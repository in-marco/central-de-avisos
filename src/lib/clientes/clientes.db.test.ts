import { afterAll, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { disconnectDb, getDb } from "@/db/client";
import { inRollback, uniqueSuffix } from "@/db/db-test-utils";
import {
  createCliente,
  createClienteInTransaction,
  getClienteDetalle,
  listClientes,
  updateCliente,
  upsertContacto,
  upsertSede,
} from "./clientes";
import type { NuevoClienteValues } from "./validation";

afterAll(async () => {
  await disconnectDb();
});

type Db = Prisma.TransactionClient | ReturnType<typeof getDb>;

const MISSING_ID = "00000000-0000-4000-8000-000000000000";

async function createEmpresa(db: Db, suffix: string, tag: string) {
  const plan = await db.plan.create({
    data: { nombre: `Plan clientes ${tag} ${suffix}`, importeMensual: "10.00" },
  });
  const empresa = await db.empresa.create({
    data: {
      nombre: `Empresa clientes ${tag} ${suffix}`,
      nif: `${tag}${suffix}`.toUpperCase(),
      emailFacturacion: `facturacion-${tag}-${suffix}@example.com`,
      planId: plan.id,
    },
  });

  return { plan, empresa };
}

function nuevoCliente(
  overrides: Partial<NuevoClienteValues["cliente"]> = {},
  contactoEnSede = true,
): NuevoClienteValues {
  return {
    cliente: {
      razonSocial: "Talleres Norte SL",
      nif: "B12345678",
      direccionFacturacion: "Calle Mayor 1, Bilbao",
      tarifaHoraria: "42.50",
      ...overrides,
    },
    sede: { nombre: "Nave 1", direccion: "Polígono Norte 1" },
    contacto: { nombre: "Ana Pérez", telefono: "600123456", email: null },
    contactoEnSede,
  };
}

describe("alta de cliente", () => {
  it("crea cliente, sede y contacto vinculado en una transacción", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const { empresa } = await createEmpresa(tx, suffix, "alta");
      const created = await createClienteInTransaction(tx, empresa.id, nuevoCliente());

      if (!created.ok) {
        throw new Error(created.error);
      }

      const detalle = await getClienteDetalle(tx, empresa.id, created.clienteId);
      return { empresa, detalle };
    });

    expect(result.detalle?.nif).toBe("B12345678");
    expect(result.detalle?.tarifaHoraria?.toFixed(2)).toBe("42.50");
    expect(result.detalle?.sedes).toHaveLength(1);
    expect(result.detalle?.contactos).toHaveLength(1);
    expect(result.detalle?.contactos[0]?.sedeId).toBe(result.detalle?.sedes[0]?.id);
  });

  it("el primer contacto puede ser de todo el cliente", async () => {
    const suffix = uniqueSuffix();

    const detalle = await inRollback(async (tx) => {
      const { empresa } = await createEmpresa(tx, suffix, "todo");
      const created = await createClienteInTransaction(
        tx,
        empresa.id,
        nuevoCliente({ tarifaHoraria: null }, false),
      );

      return created.ok ? getClienteDetalle(tx, empresa.id, created.clienteId) : null;
    });

    expect(detalle?.contactos[0]?.sedeId).toBeNull();
    expect(detalle?.tarifaHoraria).toBeNull();
  });

  it("rechaza un NIF repetido en la empresa y lo admite en otra", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const { empresa: a } = await createEmpresa(tx, suffix, "dupa");
      const { empresa: b } = await createEmpresa(tx, suffix, "dupb");
      const primero = await createClienteInTransaction(tx, a.id, nuevoCliente());
      const repetido = await createClienteInTransaction(tx, a.id, nuevoCliente());
      const otraEmpresa = await createClienteInTransaction(tx, b.id, nuevoCliente());
      const totalA = await tx.cliente.count({ where: { empresaId: a.id } });

      return { primero, repetido, otraEmpresa, totalA };
    });

    expect(result.primero.ok).toBe(true);
    expect(result.repetido).toEqual({ ok: false, error: "nif-duplicado" });
    expect(result.otraEmpresa.ok).toBe(true);
    expect(result.totalA).toBe(1);
  });

  it("revierte cliente y sede si falla el contacto", async () => {
    const suffix = uniqueSuffix();
    const db = getDb();
    const { plan, empresa } = await createEmpresa(db, suffix, "rollback");

    try {
      // Email sin normalizar: lo rechaza el CHECK contactos_email_normalizado.
      const values = nuevoCliente();
      values.contacto = { nombre: "Ana", telefono: null, email: "Ana@Example.COM" };

      await expect(createCliente(db, empresa.id, values)).rejects.toThrow();

      expect(await db.cliente.count({ where: { empresaId: empresa.id } })).toBe(0);
      expect(await db.sede.count({ where: { empresaId: empresa.id } })).toBe(0);
      expect(await db.contacto.count({ where: { empresaId: empresa.id } })).toBe(0);

      const ok = await createCliente(db, empresa.id, nuevoCliente());
      expect(ok.ok).toBe(true);
      expect(await createCliente(db, empresa.id, nuevoCliente())).toEqual({
        ok: false,
        error: "nif-duplicado",
      });
    } finally {
      await db.contacto.deleteMany({ where: { empresaId: empresa.id } });
      await db.sede.deleteMany({ where: { empresaId: empresa.id } });
      await db.cliente.deleteMany({ where: { empresaId: empresa.id } });
      await db.empresa.delete({ where: { id: empresa.id } });
      await db.plan.delete({ where: { id: plan.id } });
    }
  });
});

describe("edición y listado", () => {
  it("dos sedes y dos contactos, edición y recuentos del listado", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const { empresa } = await createEmpresa(tx, suffix, "edit");
      const created = await createClienteInTransaction(tx, empresa.id, nuevoCliente());

      if (!created.ok) {
        throw new Error(created.error);
      }

      const clienteId = created.clienteId;
      const sede2 = await upsertSede(tx, empresa.id, {
        clienteId,
        values: { nombre: "Nave 2", direccion: "Polígono Sur 2" },
      });

      if (!sede2.ok) {
        throw new Error(sede2.error);
      }

      const contacto2 = await upsertContacto(tx, empresa.id, {
        clienteId,
        values: {
          nombre: "Bruno",
          telefono: null,
          email: "bruno@cliente.es",
          sedeId: sede2.sedeId,
        },
      });

      const datos = await updateCliente(tx, empresa.id, clienteId, {
        razonSocial: "Talleres Norte y Sur SL",
        nif: "B12345678",
        direccionFacturacion: "Calle Mayor 2",
        tarifaHoraria: null,
      });
      const sedeEditada = await upsertSede(tx, empresa.id, {
        clienteId,
        sedeId: sede2.sedeId,
        values: { nombre: "Nave 2", direccion: "Polígono Sur 22" },
      });

      const antes = await getClienteDetalle(tx, empresa.id, clienteId);
      const primerContacto = antes!.contactos.find((c) => c.nombre === "Ana Pérez")!;
      const contactoEditado = await upsertContacto(tx, empresa.id, {
        clienteId,
        contactoId: primerContacto.id,
        values: {
          nombre: "Ana Pérez",
          telefono: "944000000",
          email: null,
          sedeId: null,
        },
      });

      const detalle = await getClienteDetalle(tx, empresa.id, clienteId);
      const listado = await listClientes(tx, empresa.id);

      return { sede2, contacto2, datos, sedeEditada, contactoEditado, detalle, listado };
    });

    expect(result.sede2).toEqual(expect.objectContaining({ ok: true, creada: true }));
    expect(result.contacto2).toEqual(expect.objectContaining({ ok: true, creado: true }));
    expect(result.datos).toEqual({ ok: true });
    expect(result.sedeEditada).toEqual(expect.objectContaining({ ok: true, creada: false }));
    expect(result.contactoEditado).toEqual(
      expect.objectContaining({ ok: true, creado: false }),
    );
    expect(result.detalle?.razonSocial).toBe("Talleres Norte y Sur SL");
    expect(result.detalle?.tarifaHoraria).toBeNull();
    expect(result.detalle?.sedes.map((s) => s.direccion)).toEqual([
      "Polígono Norte 1",
      "Polígono Sur 22",
    ]);
    const ana = result.detalle?.contactos.find((c) => c.nombre === "Ana Pérez");
    const bruno = result.detalle?.contactos.find((c) => c.nombre === "Bruno");
    expect(ana).toEqual(expect.objectContaining({ telefono: "944000000", sedeId: null }));
    expect(bruno?.sedeId).toBe(result.detalle?.sedes[1]?.id);
    expect(result.listado).toEqual([
      expect.objectContaining({ razonSocial: "Talleres Norte y Sur SL", sedes: 2, contactos: 2 }),
    ]);
  });

  it("la edición con un NIF de otro cliente de la empresa devuelve nif-duplicado", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const { empresa } = await createEmpresa(tx, suffix, "editdup");
      await createClienteInTransaction(tx, empresa.id, nuevoCliente());
      const otro = await createClienteInTransaction(
        tx,
        empresa.id,
        nuevoCliente({ nif: "A87654321", razonSocial: "Otro" }),
      );

      if (!otro.ok) {
        throw new Error(otro.error);
      }

      const update = await updateCliente(tx, empresa.id, otro.clienteId, {
        razonSocial: "Otro",
        nif: "B12345678",
        direccionFacturacion: "X",
        tarifaHoraria: null,
      });
      const mismoNif = await updateCliente(tx, empresa.id, otro.clienteId, {
        razonSocial: "Otro renombrado",
        nif: "A87654321",
        direccionFacturacion: "X",
        tarifaHoraria: null,
      });
      const after = await tx.cliente.findUniqueOrThrow({ where: { id: otro.clienteId } });

      return { update, mismoNif, after };
    });

    expect(result.update).toEqual({ ok: false, error: "nif-duplicado" });
    expect(result.mismoNif).toEqual({ ok: true });
    expect(result.after.nif).toBe("A87654321");
  });

  it("el contacto no puede usar una sede de otro cliente", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const { empresa } = await createEmpresa(tx, suffix, "sedeotro");
      const uno = await createClienteInTransaction(tx, empresa.id, nuevoCliente());
      const dos = await createClienteInTransaction(
        tx,
        empresa.id,
        nuevoCliente({ nif: "A87654321" }),
      );

      if (!uno.ok || !dos.ok) {
        throw new Error("alta");
      }

      const sedeDos = await tx.sede.findFirstOrThrow({ where: { clienteId: dos.clienteId } });
      const crear = await upsertContacto(tx, empresa.id, {
        clienteId: uno.clienteId,
        values: { nombre: "X", telefono: "600000000", email: null, sedeId: sedeDos.id },
      });
      const inexistente = await upsertContacto(tx, empresa.id, {
        clienteId: uno.clienteId,
        values: { nombre: "X", telefono: "600000000", email: null, sedeId: MISSING_ID },
      });
      // Una sede de otro cliente tampoco se puede editar desde este cliente.
      const editarSede = await upsertSede(tx, empresa.id, {
        clienteId: uno.clienteId,
        sedeId: sedeDos.id,
        values: { nombre: "Hack", direccion: "Hack" },
      });
      const contactos = await tx.contacto.count({ where: { clienteId: uno.clienteId } });
      const sedeDosDespues = await tx.sede.findUniqueOrThrow({ where: { id: sedeDos.id } });

      return { crear, inexistente, editarSede, contactos, sedeDosDespues };
    });

    expect(result.crear).toEqual({ ok: false, error: "sede" });
    expect(result.inexistente).toEqual({ ok: false, error: "sede" });
    expect(result.editarSede).toEqual({ ok: false, error: "no-encontrado" });
    expect(result.contactos).toBe(1);
    expect(result.sedeDosDespues.nombre).toBe("Nave 1");
  });

  it("ids inexistentes o que no son UUID devuelven no-encontrado", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const { empresa } = await createEmpresa(tx, suffix, "missing");
      const created = await createClienteInTransaction(tx, empresa.id, nuevoCliente());

      if (!created.ok) {
        throw new Error(created.error);
      }

      return {
        detalleMissing: await getClienteDetalle(tx, empresa.id, MISSING_ID),
        detalleNoUuid: await getClienteDetalle(tx, empresa.id, "no-es-uuid"),
        update: await updateCliente(tx, empresa.id, "no-es-uuid", {
          razonSocial: "X",
          nif: "B12345678",
          direccionFacturacion: "X",
          tarifaHoraria: null,
        }),
        sede: await upsertSede(tx, empresa.id, {
          clienteId: created.clienteId,
          sedeId: MISSING_ID,
          values: { nombre: "X", direccion: "X" },
        }),
        contacto: await upsertContacto(tx, empresa.id, {
          clienteId: created.clienteId,
          contactoId: "no-es-uuid",
          values: { nombre: "X", telefono: "600000000", email: null, sedeId: null },
        }),
      };
    });

    expect(result.detalleMissing).toBeNull();
    expect(result.detalleNoUuid).toBeNull();
    expect(result.update).toEqual({ ok: false, error: "cliente-no-encontrado" });
    expect(result.sede).toEqual({ ok: false, error: "no-encontrado" });
    expect(result.contacto).toEqual({ ok: false, error: "no-encontrado" });
  });
});
