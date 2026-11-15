import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { tenantFilter } from "@/db/tenant";
import { normalizeUuid, type Estado, type NuevoAvisoValues } from "./validation";

/**
 * Repositorio de avisos. Toda consulta usa `tenantFilter(empresaId)`; el
 * `empresaId` y el usuario creador salen siempre de la sesión. Los ids de
 * cliente, sede y contacto recibidos en el formulario se resuelven aquí: un
 * recurso de otra empresa se trata igual que uno inexistente.
 *
 * Los FK compuestos de `avisos` impiden en PostgreSQL mezclar empresa,
 * cliente, sede y contacto. Que el contacto sea de todo el cliente o de la
 * sede elegida no lo puede expresar un FK: lo aplica `createAvisoInTransaction`.
 *
 * Esta feature solo crea avisos `NUEVO` con origen `OFICINA`; las
 * transiciones de estado pertenecen a features posteriores.
 */

export type AvisosDb = PrismaClient | Prisma.TransactionClient;

export type AvisoResumen = {
  id: string;
  prioridad: NuevoAvisoValues["prioridad"];
  estado: Estado;
  creadoEn: Date;
  descripcion: string;
  cliente: string;
  sede: string;
};

/** Avisos de la empresa, del más reciente al más antiguo. Sin paginación. */
export async function listAvisos(db: AvisosDb, empresaId: string): Promise<AvisoResumen[]> {
  const rows = await db.aviso.findMany({
    where: tenantFilter(empresaId),
    select: {
      id: true,
      prioridad: true,
      estado: true,
      creadoEn: true,
      descripcion: true,
      cliente: { select: { razonSocial: true } },
      sede: { select: { nombre: true } },
    },
    orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    prioridad: row.prioridad,
    estado: row.estado,
    creadoEn: row.creadoEn,
    descripcion: row.descripcion,
    cliente: row.cliente.razonSocial,
    sede: row.sede.nombre,
  }));
}

/**
 * Detalle de un aviso de la empresa. `null` si el id no es un UUID, no existe
 * o es de otra empresa (la página responde el mismo 404 en los tres casos).
 */
export async function getAvisoDetalle(db: AvisosDb, empresaId: string, avisoId: string) {
  const filter = tenantFilter(empresaId);
  const id = normalizeUuid(avisoId);

  if (!id) {
    return null;
  }

  return db.aviso.findFirst({
    where: { id, ...filter },
    select: {
      id: true,
      descripcion: true,
      prioridad: true,
      origen: true,
      estado: true,
      creadoEn: true,
      cliente: { select: { id: true, razonSocial: true, nif: true } },
      sede: { select: { id: true, nombre: true, direccion: true } },
      contacto: { select: { id: true, nombre: true, telefono: true, email: true } },
      creadoPor: { select: { nombre: true } },
    },
  });
}

export type AvisoDetalle = NonNullable<Awaited<ReturnType<typeof getAvisoDetalle>>>;

/** Clientes de la empresa para el paso 1 del alta. */
export async function listClientesParaAviso(db: AvisosDb, empresaId: string) {
  return db.cliente.findMany({
    where: tenantFilter(empresaId),
    select: { id: true, razonSocial: true, nif: true },
    orderBy: [{ razonSocial: "asc" }, { nif: "asc" }],
  });
}

/**
 * Cliente con sus sedes y contactos para el paso 2 del alta, o `null` si el id
 * no es un UUID, no existe o es de otra empresa.
 */
export async function getClienteParaAviso(
  db: AvisosDb,
  empresaId: string,
  clienteId: string,
) {
  const filter = tenantFilter(empresaId);
  const id = normalizeUuid(clienteId);

  if (!id) {
    return null;
  }

  return db.cliente.findFirst({
    where: { id, ...filter },
    select: {
      id: true,
      razonSocial: true,
      nif: true,
      sedes: {
        where: filter,
        select: { id: true, nombre: true, direccion: true },
        orderBy: [{ nombre: "asc" }, { creadoEn: "asc" }],
      },
      contactos: {
        where: filter,
        select: { id: true, nombre: true, sedeId: true },
        orderBy: [{ nombre: "asc" }, { creadoEn: "asc" }],
      },
    },
  });
}

export type ClienteParaAviso = NonNullable<Awaited<ReturnType<typeof getClienteParaAviso>>>;

/**
 * Id normalizado del cliente si es de la empresa; `null` si no es un UUID, no
 * existe o es de otra empresa. La ruta lo usa para decidir si un error vuelve
 * al paso 2 (con `clienteId`) o al paso 1 (`no-encontrado`).
 */
export async function findClienteIdParaAviso(
  db: AvisosDb,
  empresaId: string,
  clienteId: string,
): Promise<string | null> {
  const filter = tenantFilter(empresaId);
  const id = normalizeUuid(clienteId);

  if (!id) {
    return null;
  }

  const cliente = await db.cliente.findFirst({
    where: { id, ...filter },
    select: { id: true },
  });

  return cliente?.id ?? null;
}

/**
 * - `no-encontrado`: el cliente no existe o es de otra empresa.
 * - `sede`: la sede no existe, es de otra empresa o de otro cliente.
 * - `contacto`: el contacto no existe, es de otra empresa, de otro cliente o
 *   está vinculado a una sede distinta de la elegida.
 */
export type AvisoWriteError = "no-encontrado" | "sede" | "contacto";

export type CreateAvisoResult =
  | { ok: true; avisoId: string }
  | { ok: false; error: AvisoWriteError };

/**
 * Cuerpo transaccional del alta. Se exporta para probarlo con `inRollback`.
 * `origen` y `estado` son fijos: el formulario no puede elegirlos.
 */
export async function createAvisoInTransaction(
  tx: Prisma.TransactionClient,
  empresaId: string,
  usuarioId: string,
  values: NuevoAvisoValues,
): Promise<CreateAvisoResult> {
  const filter = tenantFilter(empresaId);
  const clienteId = normalizeUuid(values.clienteId);

  const cliente = clienteId
    ? await tx.cliente.findFirst({
        where: { id: clienteId, ...filter },
        select: { id: true },
      })
    : null;

  if (!cliente) {
    return { ok: false, error: "no-encontrado" };
  }

  const sedeId = normalizeUuid(values.sedeId);
  const sede = sedeId
    ? await tx.sede.findFirst({
        where: { id: sedeId, clienteId: cliente.id, ...filter },
        select: { id: true },
      })
    : null;

  if (!sede) {
    return { ok: false, error: "sede" };
  }

  const contactoId = normalizeUuid(values.contactoId);
  const contacto = contactoId
    ? await tx.contacto.findFirst({
        where: {
          id: contactoId,
          clienteId: cliente.id,
          ...filter,
          // De todo el cliente o de la sede elegida.
          OR: [{ sedeId: null }, { sedeId: sede.id }],
        },
        select: { id: true },
      })
    : null;

  if (!contacto) {
    return { ok: false, error: "contacto" };
  }

  const aviso = await tx.aviso.create({
    data: {
      ...filter,
      clienteId: cliente.id,
      sedeId: sede.id,
      contactoId: contacto.id,
      descripcion: values.descripcion,
      prioridad: values.prioridad,
      origen: "OFICINA",
      estado: "NUEVO",
      creadoPorId: usuarioId,
    },
    select: { id: true },
  });

  return { ok: true, avisoId: aviso.id };
}

/** Alta de un aviso de oficina en una transacción. */
export async function createAviso(
  db: PrismaClient,
  empresaId: string,
  usuarioId: string,
  values: NuevoAvisoValues,
): Promise<CreateAvisoResult> {
  return db.$transaction((tx) => createAvisoInTransaction(tx, empresaId, usuarioId, values));
}
