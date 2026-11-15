import "dotenv/config";
import { getDb } from "../src/db/client";
import { hashPassword } from "../src/lib/auth/password";
import {
  describeSeedBase,
  equipoDemo,
  normalizeSeedEmail,
  requireSeedEnv,
  seedBase,
} from "./seed/base";

/**
 * Seed mínimo e idempotente para probar el login y los roles. Cada ejecución
 * restaura los roles demo (admin, oficina, técnico y encargado
 * ADMINISTRADOR+TECNICO), la configuración de facturación de Empresa Demo
 * (serie F, 45,00 €/h, NO_VERIFACTU) y deja al superadmin sin roles.
 *
 * No forma parte de `init.sh` ni del build. Se ejecuta manualmente después de
 * `npm run db:deploy` con `npm run db:seed`. Solo para desarrollo local. La
 * lógica compartida con `demo:seed` vive en `prisma/seed/base.ts`.
 */

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "db:seed está prohibido en producción: crea datos ficticios solo en local.",
    );
  }

  const adminEmail = normalizeSeedEmail(
    process.env.SEED_ADMIN_EMAIL ?? "admin@demo.local",
  );
  const superadminEmail = normalizeSeedEmail(
    process.env.SEED_SUPERADMIN_EMAIL ?? "superadmin@demo.local",
  );
  const adminPassword = requireSeedEnv("SEED_ADMIN_PASSWORD");
  const superadminPassword = requireSeedEnv("SEED_SUPERADMIN_PASSWORD");
  const equipoPassword = requireSeedEnv("SEED_EQUIPO_PASSWORD");

  const [adminPasswordHash, superadminPasswordHash, equipoPasswordHash] =
    await Promise.all([
      hashPassword(adminPassword),
      hashPassword(superadminPassword),
      hashPassword(equipoPassword),
    ]);

  const db = getDb();

  try {
    const result = await db.$transaction((tx) =>
      seedBase(tx, {
        adminEmail,
        superadminEmail,
        equipo: equipoDemo(),
        adminPasswordHash,
        superadminPasswordHash,
        equipoPasswordHash,
      }),
    );

    console.log("Seed completado sin duplicar datos.");
    for (const line of describeSeedBase(result)) {
      console.log(line);
    }
    console.log("Las contraseñas no se muestran; vienen de SEED_* en .env.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? `Seed fallido: ${error.message}` : "Seed fallido.",
  );
  process.exitCode = 1;
});
