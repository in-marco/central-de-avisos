import { getDb } from "@/db/client";

export const DATABASE_HEALTH_TIMEOUT_MS = 2000;

/**
 * Comprueba que PostgreSQL responde con `SELECT 1`. Cualquier fallo (URL
 * ausente, conexión rechazada, timeout) se traduce a `false` sin exponer el
 * error ni la cadena de conexión al llamador.
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const db = getDb();

    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error("Database health check timed out"));
        }, DATABASE_HEALTH_TIMEOUT_MS);
      }),
    ]);

    return true;
  } catch {
    return false;
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}
