import "dotenv/config";
import { getDb } from "../src/db/client";
import { hashPassword } from "../src/lib/auth/password";

/**
 * Seed mínimo e idempotente para probar el login.
 *
 * No forma parte de `init.sh` ni del build. Se ejecuta manualmente después de
 * `npm run db:deploy` con `npm run db:seed`. Solo para desarrollo local.
 */

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Falta ${name}. Configura las variables SEED_* en .env (ver .env.example).`,
    );
  }

  return value;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "db:seed está prohibido en producción: crea datos ficticios solo en local.",
    );
  }

  const adminEmail = normalizeEmail(
    process.env.SEED_ADMIN_EMAIL ?? "admin@demo.local",
  );
  const superadminEmail = normalizeEmail(
    process.env.SEED_SUPERADMIN_EMAIL ?? "superadmin@demo.local",
  );
  const adminPassword = requireEnv("SEED_ADMIN_PASSWORD");
  const superadminPassword = requireEnv("SEED_SUPERADMIN_PASSWORD");

  const [adminPasswordHash, superadminPasswordHash] = await Promise.all([
    hashPassword(adminPassword),
    hashPassword(superadminPassword),
  ]);

  const db = getDb();

  try {
    const result = await db.$transaction(async (tx) => {
      const plan = await tx.plan.upsert({
        where: { nombre: "Plan Demo" },
        update: { importeMensual: "49.90", activo: true },
        create: { nombre: "Plan Demo", importeMensual: "49.90" },
      });

      const empresa = await tx.empresa.upsert({
        where: { nif: "B12345678" },
        update: {
          nombre: "Empresa Demo",
          direccionFiscal: "Calle Mayor 1, 28013 Madrid",
          emailFacturacion: "facturacion@demo.local",
          planId: plan.id,
          estado: "ACTIVA",
        },
        create: {
          nombre: "Empresa Demo",
          nif: "B12345678",
          direccionFiscal: "Calle Mayor 1, 28013 Madrid",
          emailFacturacion: "facturacion@demo.local",
          planId: plan.id,
        },
      });

      const admin = await tx.usuario.upsert({
        where: { email: adminEmail },
        update: {
          nombre: "Administradora Demo",
          empresaId: empresa.id,
          passwordHash: adminPasswordHash,
          estado: "ACTIVO",
          esSuperadmin: false,
        },
        create: {
          nombre: "Administradora Demo",
          email: adminEmail,
          empresaId: empresa.id,
          passwordHash: adminPasswordHash,
        },
      });

      const superadmin = await tx.usuario.upsert({
        where: { email: superadminEmail },
        update: {
          nombre: "Superadmin Demo",
          empresaId: null,
          passwordHash: superadminPasswordHash,
          estado: "ACTIVO",
          esSuperadmin: true,
        },
        create: {
          nombre: "Superadmin Demo",
          email: superadminEmail,
          empresaId: null,
          passwordHash: superadminPasswordHash,
          esSuperadmin: true,
        },
      });

      return { plan, empresa, admin, superadmin };
    });

    console.log("Seed completado sin duplicar datos.");
    console.log(`  Plan:       ${result.plan.nombre}`);
    console.log(`  Empresa:    ${result.empresa.nombre} (${result.empresa.nif})`);
    console.log(`  Admin:      ${result.admin.email}`);
    console.log(`  Superadmin: ${result.superadmin.email}`);
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
