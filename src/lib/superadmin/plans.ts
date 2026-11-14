import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { isUniqueViolation } from "./db-errors";
import type { PlanFormValues } from "./validation";

export type SuperadminDb = PrismaClient | Prisma.TransactionClient;

export type PlanMutationResult =
  | { ok: true; planId: string }
  | { ok: false; error: "campos" | "servicio" };

export function listPlans(db: SuperadminDb) {
  return db.plan.findMany({
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
  });
}

export function listActivePlans(db: SuperadminDb) {
  return db.plan.findMany({
    where: { activo: true },
    orderBy: { nombre: "asc" },
  });
}

export function getPlan(db: SuperadminDb, planId: string) {
  return db.plan.findUnique({ where: { id: planId } });
}

export async function createPlan(
  db: SuperadminDb,
  values: PlanFormValues,
): Promise<PlanMutationResult> {
  try {
    const plan = await db.plan.create({
      data: {
        nombre: values.nombre,
        importeMensual: values.importeMensual,
        activo: values.activo,
      },
    });

    return { ok: true, planId: plan.id };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "campos" };
    }

    throw error;
  }
}

export async function updatePlan(
  db: SuperadminDb,
  planId: string,
  values: PlanFormValues,
): Promise<PlanMutationResult | null> {
  try {
    const existing = await db.plan.findUnique({ where: { id: planId } });

    if (!existing) {
      return null;
    }

    const plan = await db.plan.update({
      where: { id: planId },
      data: {
        nombre: values.nombre,
        importeMensual: values.importeMensual,
        activo: values.activo,
      },
    });

    return { ok: true, planId: plan.id };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "campos" };
    }

    throw error;
  }
}
