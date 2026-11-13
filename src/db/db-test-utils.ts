import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "./client";

class RollbackSignal extends Error {}

/**
 * Ejecuta trabajo de test dentro de una transacción y siempre la revierte.
 * Los errores distintos de la señal de rollback se propagan para poder
 * comprobar rechazos de PostgreSQL.
 */
export async function inRollback<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  let result: T | undefined;
  let completed = false;

  try {
    await getDb().$transaction(async (tx) => {
      result = await fn(tx);
      completed = true;
      throw new RollbackSignal();
    });
  } catch (error) {
    if (!(error instanceof RollbackSignal)) {
      throw error;
    }
  }

  if (!completed) {
    throw new Error("La transacción de test no llegó a completarse.");
  }

  return result as T;
}

export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
