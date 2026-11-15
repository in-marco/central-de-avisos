import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

type GlobalWithDb = typeof globalThis & {
  __centralDeAvisosDb?: PrismaClient;
};

const globalWithDb = globalThis as GlobalWithDb;

export const DEFAULT_CONNECTION_TIMEOUT_MS = 2000;

/**
 * Timeout de conexión a PostgreSQL. `DATABASE_CONNECTION_TIMEOUT_MS` (entero
 * entre 500 y 30000) permite tolerar el arranque en frío de Neon en la demo
 * (10000); ausente o inválido, 2000 ms para fallar rápido.
 */
export function connectionTimeoutMs(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.DATABASE_CONNECTION_TIMEOUT_MS?.trim();

  if (!raw || !/^\d+$/.test(raw)) {
    return DEFAULT_CONNECTION_TIMEOUT_MS;
  }

  const value = Number(raw);

  return value >= 500 && value <= 30_000 ? value : DEFAULT_CONNECTION_TIMEOUT_MS;
}

/**
 * Devuelve el cliente Prisma de forma perezosa. Importar este módulo no
 * requiere DATABASE_URL ni abre conexiones; eso permite que `next build`,
 * `init.sh` y los tests unitarios funcionen sin base de datos.
 */
export function getDb(): PrismaClient {
  if (!globalWithDb.__centralDeAvisosDb) {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL no está configurada. Copia .env.example a .env antes de usar la base de datos.",
      );
    }

    const adapter = new PrismaPg({
      connectionString: databaseUrl,
      // Falla rápido en lugar de quedarse colgado si PostgreSQL no responde.
      connectionTimeoutMillis: connectionTimeoutMs(),
    });

    globalWithDb.__centralDeAvisosDb = new PrismaClient({ adapter });
  }

  return globalWithDb.__centralDeAvisosDb;
}

/** Cierra el pool y olvida el singleton (tests y cierre ordenado). */
export async function disconnectDb(): Promise<void> {
  if (globalWithDb.__centralDeAvisosDb) {
    const db = globalWithDb.__centralDeAvisosDb;
    globalWithDb.__centralDeAvisosDb = undefined;
    await db.$disconnect();
  }
}
