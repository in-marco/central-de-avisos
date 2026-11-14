import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { tenantFilter } from "@/db/tenant";
import { isUniqueViolation } from "@/lib/superadmin/db-errors";
import { isUuid } from "@/lib/superadmin/validation";
import type {
  ClienteValues,
  ContactoValues,
  NuevoClienteValues,
  SedeValues,
} from "./validation";

/**
 * Repositorio de clientes, sedes y contactos. Toda consulta usa
 * `tenantFilter(empresaId)`; el `empresaId` sale siempre de la sesión. Los
 * ids recibidos en formularios se resuelven aquí: un recurso de otra empresa
 * se trata igual que uno inexistente (`no-encontrado`), sin revelar nada.
 *
 * Las ediciones son «última escritura gana».
 */

export type ClientesDb = PrismaClient | Prisma.TransactionClient;

export type ClienteResumen = {
  id: string;
  razonSocial: string;
  nif: string;
  sedes: number;
  contactos: number;
};

export async function listClientes(
  db: ClientesDb,
  empresaId: string,
): Promise<ClienteResumen[]> {
  const rows = await db.cliente.findMany({
    where: tenantFilter(empresaId),
    select: {
      id: true,
      razonSocial: true,
      nif: true,
      _count: { select: { sedes: true, contactos: true } },
    },
    orderBy: [{ razonSocial: "asc" }, { nif: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    razonSocial: row.razonSocial,
    nif: row.nif,
    sedes: row._count.sedes,
    contactos: row._count.contactos,
  }));
}

export async function getClienteDetalle(
  db: ClientesDb,
  empresaId: string,
  clienteId: string,
) {
  const filter = tenantFilter(empresaId);

  if (!isUuid(clienteId)) {
    return null;
  }

  return db.cliente.findFirst({
    where: { id: clienteId.trim().toLowerCase(), ...filter },
    select: {
      id: true,
      razonSocial: true,
      nif: true,
      direccionFacturacion: true,
      tarifaHoraria: true,
      creadoEn: true,
      sedes: {
        where: filter,
        select: { id: true, nombre: true, direccion: true },
        orderBy: [{ nombre: "asc" }, { creadoEn: "asc" }],
      },
      contactos: {
        where: filter,
        select: {
          id: true,
          nombre: true,
          telefono: true,
          email: true,
          sedeId: true,
        },
        orderBy: [{ nombre: "asc" }, { creadoEn: "asc" }],
      },
    },
  });
}

export type ClienteDetalle = NonNullable<Awaited<ReturnType<typeof getClienteDetalle>>>;

/**
 * - `cliente-no-encontrado`: el cliente no existe o es de otra empresa (la
 *   ruta vuelve al listado).
 * - `no-encontrado`: la sede o el contacto no existe, es de otra empresa o de
 *   otro cliente (la ruta vuelve al detalle del cliente).
 */
export type ClienteWriteError =
  | "cliente-no-encontrado"
  | "no-encontrado"
  | "nif-duplicado"
  | "sede";

export type WriteResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: ClienteWriteError };

/** Normaliza un id recibido o devuelve `null` si no es un UUID. */
function normalizeId(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !isUuid(value)) {
    return null;
  }

  return value.trim().toLowerCase();
}

/** Devuelve el id del cliente si es de la empresa, o `null`. */
export async function findClienteId(
  db: ClientesDb,
  empresaId: string,
  clienteId: string,
): Promise<string | null> {
  const filter = tenantFilter(empresaId);
  const id = normalizeId(clienteId);

  if (!id) {
    return null;
  }

  const cliente = await db.cliente.findFirst({
    where: { id, ...filter },
    select: { id: true },
  });

  return cliente?.id ?? null;
}

async function nifTakenByOther(
  db: ClientesDb,
  empresaId: string,
  nif: string,
  exceptClienteId?: string,
): Promise<boolean> {
  const existing = await db.cliente.findFirst({
    where: {
      ...tenantFilter(empresaId),
      nif,
      ...(exceptClienteId ? { NOT: { id: exceptClienteId } } : {}),
    },
    select: { id: true },
  });

  return existing !== null;
}

/**
 * Cuerpo transaccional del alta: cliente + primera sede + primer contacto.
 * Se exporta para probarlo con `inRollback`. Si falla cualquier inserción, la
 * transacción completa se revierte.
 */
export async function createClienteInTransaction(
  tx: Prisma.TransactionClient,
  empresaId: string,
  values: NuevoClienteValues,
): Promise<WriteResult<{ clienteId: string }>> {
  const filter = tenantFilter(empresaId);

  if (await nifTakenByOther(tx, filter.empresaId, values.cliente.nif)) {
    return { ok: false, error: "nif-duplicado" };
  }

  const cliente = await tx.cliente.create({
    data: {
      ...filter,
      razonSocial: values.cliente.razonSocial,
      nif: values.cliente.nif,
      direccionFacturacion: values.cliente.direccionFacturacion,
      tarifaHoraria: values.cliente.tarifaHoraria,
    },
    select: { id: true },
  });

  const sede = await tx.sede.create({
    data: {
      ...filter,
      clienteId: cliente.id,
      nombre: values.sede.nombre,
      direccion: values.sede.direccion,
    },
    select: { id: true },
  });

  await tx.contacto.create({
    data: {
      ...filter,
      clienteId: cliente.id,
      sedeId: values.contactoEnSede ? sede.id : null,
      nombre: values.contacto.nombre,
      telefono: values.contacto.telefono,
      email: values.contacto.email,
    },
  });

  return { ok: true, clienteId: cliente.id };
}

/** Alta del cliente con su primera sede y su primer contacto. */
export async function createCliente(
  db: PrismaClient,
  empresaId: string,
  values: NuevoClienteValues,
): Promise<WriteResult<{ clienteId: string }>> {
  try {
    return await db.$transaction((tx) =>
      createClienteInTransaction(tx, empresaId, values),
    );
  } catch (error) {
    // Carrera entre dos altas con el mismo NIF: lo resuelve el índice único.
    if (isUniqueViolation(error)) {
      return { ok: false, error: "nif-duplicado" };
    }

    throw error;
  }
}

/** Edita los datos de facturación de un cliente de la empresa. */
export async function updateCliente(
  db: ClientesDb,
  empresaId: string,
  clienteId: string,
  values: ClienteValues,
): Promise<WriteResult> {
  const filter = tenantFilter(empresaId);
  const id = await findClienteId(db, filter.empresaId, clienteId);

  if (!id) {
    return { ok: false, error: "cliente-no-encontrado" };
  }

  if (await nifTakenByOther(db, filter.empresaId, values.nif, id)) {
    return { ok: false, error: "nif-duplicado" };
  }

  try {
    const { count } = await db.cliente.updateMany({
      where: { id, ...filter },
      data: {
        razonSocial: values.razonSocial,
        nif: values.nif,
        direccionFacturacion: values.direccionFacturacion,
        tarifaHoraria: values.tarifaHoraria,
      },
    });

    if (count === 0) {
      return { ok: false, error: "cliente-no-encontrado" };
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "nif-duplicado" };
    }

    throw error;
  }

  return { ok: true };
}

export type UpsertSedeInput = {
  clienteId: string;
  /** Sin `sedeId` se crea una sede nueva; con él se edita. */
  sedeId?: string | null;
  values: SedeValues;
};

/** Crea o edita una sede de un cliente de la empresa. */
export async function upsertSede(
  db: ClientesDb,
  empresaId: string,
  { clienteId, sedeId, values }: UpsertSedeInput,
): Promise<WriteResult<{ sedeId: string; creada: boolean }>> {
  const filter = tenantFilter(empresaId);
  const cliente = await findClienteId(db, filter.empresaId, clienteId);

  if (!cliente) {
    return { ok: false, error: "cliente-no-encontrado" };
  }

  if (sedeId === undefined || sedeId === null || sedeId.trim() === "") {
    const sede = await db.sede.create({
      data: {
        ...filter,
        clienteId: cliente,
        nombre: values.nombre,
        direccion: values.direccion,
      },
      select: { id: true },
    });

    return { ok: true, sedeId: sede.id, creada: true };
  }

  const id = normalizeId(sedeId);

  if (!id) {
    return { ok: false, error: "no-encontrado" };
  }

  const { count } = await db.sede.updateMany({
    where: { id, clienteId: cliente, ...filter },
    data: { nombre: values.nombre, direccion: values.direccion },
  });

  if (count === 0) {
    return { ok: false, error: "no-encontrado" };
  }

  return { ok: true, sedeId: id, creada: false };
}

export type UpsertContactoInput = {
  clienteId: string;
  /** Sin `contactoId` se crea un contacto nuevo; con él se edita. */
  contactoId?: string | null;
  values: ContactoValues;
};

/**
 * Crea o edita un contacto de un cliente de la empresa. Si llega `sedeId`,
 * la sede debe ser de ese mismo cliente y empresa; si no, `sede`. Esta regla
 * no la impone PostgreSQL (ver el comentario de `Contacto` en el esquema).
 */
export async function upsertContacto(
  db: ClientesDb,
  empresaId: string,
  { clienteId, contactoId, values }: UpsertContactoInput,
): Promise<WriteResult<{ contactoId: string; creado: boolean }>> {
  const filter = tenantFilter(empresaId);
  const cliente = await findClienteId(db, filter.empresaId, clienteId);

  if (!cliente) {
    return { ok: false, error: "cliente-no-encontrado" };
  }

  let sedeId: string | null = null;

  if (values.sedeId !== null) {
    const id = normalizeId(values.sedeId);
    const sede = id
      ? await db.sede.findFirst({
          where: { id, clienteId: cliente, ...filter },
          select: { id: true },
        })
      : null;

    if (!sede) {
      return { ok: false, error: "sede" };
    }

    sedeId = sede.id;
  }

  const data = {
    nombre: values.nombre,
    telefono: values.telefono,
    email: values.email,
    sedeId,
  };

  if (contactoId === undefined || contactoId === null || contactoId.trim() === "") {
    const contacto = await db.contacto.create({
      data: { ...filter, clienteId: cliente, ...data },
      select: { id: true },
    });

    return { ok: true, contactoId: contacto.id, creado: true };
  }

  const id = normalizeId(contactoId);

  if (!id) {
    return { ok: false, error: "no-encontrado" };
  }

  const { count } = await db.contacto.updateMany({
    where: { id, clienteId: cliente, ...filter },
    data,
  });

  if (count === 0) {
    return { ok: false, error: "no-encontrado" };
  }

  return { ok: true, contactoId: id, creado: false };
}
