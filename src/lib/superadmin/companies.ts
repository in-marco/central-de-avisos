import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  isUniqueViolation,
  uniqueViolationTarget,
} from "./db-errors";
import {
  createInvitationToken,
  hashInvitationToken,
  INVITATION_DURATION_MS,
} from "./invitations";
import type { SuperadminDb } from "./plans";
import type { CompanyFormValues, SuperadminErrorCode } from "./validation";

export type CompanyWithInvitation = Prisma.EmpresaGetPayload<{
  include: {
    plan: true;
    invitaciones: { include: { usuario: true } };
  };
}>;

export type CompanyDetail = Prisma.EmpresaGetPayload<{
  include: {
    plan: true;
    usuarios: true;
    invitaciones: { include: { usuario: true } };
  };
}>;

export type CreateCompanyResult =
  | {
      ok: true;
      empresaId: string;
      usuarioId: string;
      invitacionId: string;
      token: string;
      expiraEn: Date;
    }
  | {
      ok: false;
      error: Extract<SuperadminErrorCode, "nif" | "email" | "plan" | "campos">;
    };

type CreateCompanyOptions = {
  now?: Date;
  invitationDurationMs?: number;
};

/**
 * Cuerpo transaccional del alta. Se exporta para poder probarlo dentro de una
 * transacción con rollback sin abrir transacciones anidadas.
 */
export async function createCompanyWithInvitationInTransaction(
  tx: Prisma.TransactionClient,
  values: CompanyFormValues,
  {
    now = new Date(),
    invitationDurationMs = INVITATION_DURATION_MS,
  }: CreateCompanyOptions = {},
): Promise<CreateCompanyResult> {
  const plan = await tx.plan.findUnique({
    where: { id: values.planId },
    select: { id: true, activo: true },
  });

  if (!plan || !plan.activo) {
    return { ok: false, error: "plan" };
  }

  const existingNif = await tx.empresa.findUnique({
    where: { nif: values.nif },
    select: { id: true },
  });

  if (existingNif) {
    return { ok: false, error: "nif" };
  }

  const existingAdmin = await tx.usuario.findUnique({
    where: { email: values.adminEmail },
    select: { id: true },
  });

  if (existingAdmin) {
    return { ok: false, error: "email" };
  }

  const empresa = await tx.empresa.create({
    data: {
      nombre: values.nombre,
      nif: values.nif,
      direccionFiscal: values.direccionFiscal,
      emailFacturacion: values.emailFacturacion,
      planId: values.planId,
      estado: values.estado,
    },
  });

  const usuario = await tx.usuario.create({
    data: {
      empresaId: empresa.id,
      email: values.adminEmail,
      nombre: values.adminNombre,
      passwordHash: null,
      estado: "INACTIVO",
      esSuperadmin: false,
      roles: ["ADMINISTRADOR"],
    },
  });

  const token = createInvitationToken();
  const expiraEn = new Date(now.getTime() + invitationDurationMs);

  const invitacion = await tx.invitacion.create({
    data: {
      empresaId: empresa.id,
      usuarioId: usuario.id,
      tipo: "ADMINISTRADOR_EMPRESA",
      tokenHash: hashInvitationToken(token),
      creadaEn: now,
      expiraEn,
    },
  });

  return {
    ok: true,
    empresaId: empresa.id,
    usuarioId: usuario.id,
    invitacionId: invitacion.id,
    token,
    expiraEn,
  };
}

/**
 * Da de alta la empresa, el administrador invitado y la invitación en una
 * única transacción. Cualquier fallo revierte las tres filas.
 */
export async function createCompanyWithInvitation(
  db: PrismaClient,
  values: CompanyFormValues,
  options: CreateCompanyOptions = {},
): Promise<CreateCompanyResult> {
  try {
    return await db.$transaction((tx) =>
      createCompanyWithInvitationInTransaction(tx, values, options),
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      const target = uniqueViolationTarget(error).join(",");

      if (target.includes("nif")) {
        return { ok: false, error: "nif" };
      }

      if (target.includes("email")) {
        return { ok: false, error: "email" };
      }
    }

    throw error;
  }
}

export function listCompaniesWithInvitations(
  db: SuperadminDb,
): Promise<CompanyWithInvitation[]> {
  return db.empresa.findMany({
    include: {
      plan: true,
      // Solo la invitación de administrador: las de contactos de cliente
      // (portal) no son del proveedor.
      invitaciones: {
        where: { tipo: "ADMINISTRADOR_EMPRESA" },
        include: { usuario: true },
        orderBy: { creadaEn: "desc" },
        take: 1,
      },
    },
    orderBy: { creadoEn: "desc" },
  }) as Promise<CompanyWithInvitation[]>;
}

export function getCompanyDetail(
  db: SuperadminDb,
  empresaId: string,
): Promise<CompanyDetail | null> {
  return db.empresa.findUnique({
    where: { id: empresaId },
    include: {
      plan: true,
      // Usuarios de empresa; los usuarios de cliente (portal) no se muestran.
      usuarios: { where: { clienteId: null }, orderBy: { creadoEn: "asc" } },
      invitaciones: {
        where: { tipo: "ADMINISTRADOR_EMPRESA" },
        include: { usuario: true },
        orderBy: { creadaEn: "desc" },
      },
    },
  }) as Promise<CompanyDetail | null>;
}

export function countCompanies(db: SuperadminDb) {
  return db.empresa.count();
}

export function countActivePlans(db: SuperadminDb) {
  return db.plan.count({ where: { activo: true } });
}

export function countPendingInvitations(db: SuperadminDb, now: Date = new Date()) {
  return db.invitacion.count({
    where: {
      tipo: "ADMINISTRADOR_EMPRESA",
      aceptadaEn: null,
      expiraEn: { gt: now },
    },
  });
}
