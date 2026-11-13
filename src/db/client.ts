import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

type GlobalWithDb = typeof globalThis & {
  __centralDeAvisosDb?: PrismaClient;
};

const globalWithDb = globalThis as GlobalWithDb;

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
      connectionTimeoutMillis: 2000,
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
