import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { tenantFilter } from "@/db/tenant";
import {
  ESTADOS_CANCELABLES,
  isEstadoCancelable,
  normalizeUuid,
  problemasParaValidar,
  type CancelacionValues,
  type Estado,
  type NuevoAvisoValues,
  type ProblemaValidacion,
  type Vista,
} from "./validation";

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
 * El alta crea avisos `NUEVO` con origen `OFICINA`. Las transiciones
 * `NUEVO → PENDIENTE` (validar) y `NUEVO | PENDIENTE → CANCELADO` (cancelar)
 * se hacen aquí con `updateMany` condicionado al estado de origen: si otra
 * petición cambió el estado antes, `count` es 0 y se responde `estado` sin
 * escribir dos veces. Autor y fecha los fija el servidor.
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

/** Estado que filtra cada vista del listado (`todos` no filtra). */
const VISTA_ESTADO: Record<Exclude<Vista, "todos">, Estado> = {
  "por-validar": "NUEVO",
  bolsa: "PENDIENTE",
  cancelados: "CANCELADO",
};

/**
 * Orden de cada vista. `por-validar` y `bolsa` van por prioridad (Urgente,
 * Alta, Normal: PostgreSQL ordena el enum por orden de declaración, NORMAL <
 * ALTA < URGENTE) y después por antigüedad (el más antiguo primero). `todos`
 * y `cancelados`, del más reciente al más antiguo.
 */
function orderByVista(vista: Vista): Prisma.AvisoOrderByWithRelationInput[] {
  if (vista === "por-validar" || vista === "bolsa") {
    return [{ prioridad: "desc" }, { creadoEn: "asc" }, { id: "asc" }];
  }

  return [{ creadoEn: "desc" }, { id: "desc" }];
}

/**
 * Avisos de la empresa en una vista del listado. Sin paginación. Sin `vista`
 * se listan todos, del más reciente al más antiguo.
 */
export async function listAvisos(
  db: AvisosDb,
  empresaId: string,
  vista: Vista = "todos",
): Promise<AvisoResumen[]> {
  const filter = tenantFilter(empresaId);
  const rows = await db.aviso.findMany({
    where: vista === "todos" ? filter : { ...filter, estado: VISTA_ESTADO[vista] },
    select: {
      id: true,
      prioridad: true,
      estado: true,
      creadoEn: true,
      descripcion: true,
      cliente: { select: { razonSocial: true } },
      sede: { select: { nombre: true } },
    },
    orderBy: orderByVista(vista),
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
 * Bolsa de pendientes de la empresa: avisos `PENDIENTE` (validados y sin
 * asignar) por prioridad y antigüedad. Punto de reutilización para
 * `technician-inbox`.
 */
export async function listBolsa(db: AvisosDb, empresaId: string): Promise<AvisoResumen[]> {
  return listAvisos(db, empresaId, "bolsa");
}

export type RecuentoVistas = Record<Vista, number>;

/** Número de avisos de la empresa en cada vista del listado. */
export async function countAvisosPorVista(
  db: AvisosDb,
  empresaId: string,
): Promise<RecuentoVistas> {
  const grupos = await db.aviso.groupBy({
    by: ["estado"],
    where: tenantFilter(empresaId),
    _count: { _all: true },
  });

  const porEstado = new Map<Estado, number>(
    grupos.map((grupo) => [grupo.estado, grupo._count._all]),
  );

  return {
    todos: grupos.reduce((total, grupo) => total + grupo._count._all, 0),
    "por-validar": porEstado.get("NUEVO") ?? 0,
    bolsa: porEstado.get("PENDIENTE") ?? 0,
    cancelados: porEstado.get("CANCELADO") ?? 0,
  };
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
      contacto: {
        select: { id: true, nombre: true, telefono: true, email: true, sedeId: true },
      },
      creadoPor: { select: { nombre: true } },
      validadoEn: true,
      validadoPor: { select: { nombre: true } },
      canceladoEn: true,
      canceladoPor: { select: { nombre: true } },
      motivoCancelacion: true,
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

/**
 * Resultado de validar o cancelar. En los errores, `avisoId` solo está
 * presente si el aviso es de la empresa (la ruta vuelve a su detalle); con
 * `no-encontrado` no lo está (la ruta vuelve al listado).
 */
export type TransicionAvisoResult =
  | { ok: true; avisoId: string }
  | { ok: false; error: "no-encontrado" }
  | { ok: false; error: "estado"; avisoId: string }
  | { ok: false; error: "incompleto"; avisoId: string; problemas: ProblemaValidacion[] };

/**
 * Id normalizado del aviso si es de la empresa; `null` si no es un UUID, no
 * existe o es de otra empresa. La ruta lo usa para decidir a dónde vuelve un
 * error de formulario o de servicio.
 */
export async function findAvisoId(
  db: AvisosDb,
  empresaId: string,
  avisoId: string,
): Promise<string | null> {
  const id = normalizeUuid(avisoId);

  if (!id) {
    return null;
  }

  const aviso = await db.aviso.findFirst({
    where: { id, ...tenantFilter(empresaId) },
    select: { id: true },
  });

  return aviso?.id ?? null;
}

/**
 * Valida un aviso `NUEVO`: pasa a `PENDIENTE` (entra en la bolsa) con
 * `validado_en` y `validado_por_id` = usuario de la sesión. Recalcula
 * `problemasParaValidar` en servidor; si hay alguno, `incompleto` sin
 * escribir. Se exporta para probarlo con `inRollback`.
 */
export async function validarAvisoInTransaction(
  tx: Prisma.TransactionClient,
  empresaId: string,
  usuarioId: string,
  avisoId: string,
): Promise<TransicionAvisoResult> {
  const filter = tenantFilter(empresaId);
  const id = normalizeUuid(avisoId);

  const aviso = id
    ? await tx.aviso.findFirst({
        where: { id, ...filter },
        select: { id: true, estado: true, sedeId: true, contacto: { select: { sedeId: true } } },
      })
    : null;

  if (!aviso) {
    return { ok: false, error: "no-encontrado" };
  }

  if (aviso.estado !== "NUEVO") {
    return { ok: false, error: "estado", avisoId: aviso.id };
  }

  const problemas = problemasParaValidar(aviso);

  if (problemas.length > 0) {
    return { ok: false, error: "incompleto", avisoId: aviso.id, problemas };
  }

  const { count } = await tx.aviso.updateMany({
    where: { id: aviso.id, ...filter, estado: "NUEVO" },
    data: { estado: "PENDIENTE", validadoEn: new Date(), validadoPorId: usuarioId },
  });

  if (count === 0) {
    return { ok: false, error: "estado", avisoId: aviso.id };
  }

  return { ok: true, avisoId: aviso.id };
}

/** Valida un aviso en una transacción. */
export async function validarAviso(
  db: PrismaClient,
  empresaId: string,
  usuarioId: string,
  avisoId: string,
): Promise<TransicionAvisoResult> {
  return db.$transaction((tx) => validarAvisoInTransaction(tx, empresaId, usuarioId, avisoId));
}

/**
 * Cancela un aviso `NUEVO` o `PENDIENTE` con motivo, `cancelado_en` y
 * `cancelado_por_id` = usuario de la sesión. Si estaba `PENDIENTE`, conserva
 * los datos de validación. Se exporta para probarlo con `inRollback`.
 */
export async function cancelarAvisoInTransaction(
  tx: Prisma.TransactionClient,
  empresaId: string,
  usuarioId: string,
  values: CancelacionValues,
): Promise<TransicionAvisoResult> {
  const filter = tenantFilter(empresaId);
  const id = normalizeUuid(values.avisoId);

  const aviso = id
    ? await tx.aviso.findFirst({
        where: { id, ...filter },
        select: { id: true, estado: true },
      })
    : null;

  if (!aviso) {
    return { ok: false, error: "no-encontrado" };
  }

  if (!isEstadoCancelable(aviso.estado)) {
    return { ok: false, error: "estado", avisoId: aviso.id };
  }

  const { count } = await tx.aviso.updateMany({
    where: { id: aviso.id, ...filter, estado: { in: [...ESTADOS_CANCELABLES] } },
    data: {
      estado: "CANCELADO",
      motivoCancelacion: values.motivo,
      canceladoEn: new Date(),
      canceladoPorId: usuarioId,
    },
  });

  if (count === 0) {
    return { ok: false, error: "estado", avisoId: aviso.id };
  }

  return { ok: true, avisoId: aviso.id };
}

/** Cancela un aviso en una transacción. */
export async function cancelarAviso(
  db: PrismaClient,
  empresaId: string,
  usuarioId: string,
  values: CancelacionValues,
): Promise<TransicionAvisoResult> {
  return db.$transaction((tx) => cancelarAvisoInTransaction(tx, empresaId, usuarioId, values));
}
