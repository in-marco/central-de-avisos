import "dotenv/config";
import { getDb } from "../src/db/client";
import type { RolUsuario } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/auth/password";

/**
 * Seed mínimo e idempotente para probar el login y los roles. Cada ejecución
 * restaura los roles demo (admin, oficina, técnico y encargado
 * ADMINISTRADOR+TECNICO) y deja al superadmin sin roles.
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
  const equipoPassword = requireEnv("SEED_EQUIPO_PASSWORD");

  // Equipo demo de Empresa Demo, uno por combinación de roles relevante.
  const equipo: Array<{ email: string; nombre: string; roles: RolUsuario[] }> = [
    {
      email: normalizeEmail(process.env.SEED_OFICINA_EMAIL ?? "oficina@demo.local"),
      nombre: "Oficina Demo",
      roles: ["OFICINA"],
    },
    {
      email: normalizeEmail(process.env.SEED_TECNICO_EMAIL ?? "tecnico@demo.local"),
      nombre: "Técnico Demo",
      roles: ["TECNICO"],
    },
    {
      email: normalizeEmail(
        process.env.SEED_ENCARGADO_EMAIL ?? "encargado@demo.local",
      ),
      nombre: "Encargado Demo",
      roles: ["ADMINISTRADOR", "TECNICO"],
    },
  ];

  const [adminPasswordHash, superadminPasswordHash, equipoPasswordHash] =
    await Promise.all([
      hashPassword(adminPassword),
      hashPassword(superadminPassword),
      hashPassword(equipoPassword),
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
          roles: ["ADMINISTRADOR"],
        },
        create: {
          nombre: "Administradora Demo",
          email: adminEmail,
          empresaId: empresa.id,
          passwordHash: adminPasswordHash,
          roles: ["ADMINISTRADOR"],
        },
      });

      const miembros = [];
      for (const miembro of equipo) {
        miembros.push(
          await tx.usuario.upsert({
            where: { email: miembro.email },
            update: {
              nombre: miembro.nombre,
              empresaId: empresa.id,
              passwordHash: equipoPasswordHash,
              estado: "ACTIVO",
              esSuperadmin: false,
              roles: miembro.roles,
            },
            create: {
              nombre: miembro.nombre,
              email: miembro.email,
              empresaId: empresa.id,
              passwordHash: equipoPasswordHash,
              roles: miembro.roles,
            },
          }),
        );
      }

      const superadmin = await tx.usuario.upsert({
        where: { email: superadminEmail },
        update: {
          nombre: "Superadmin Demo",
          empresaId: null,
          passwordHash: superadminPasswordHash,
          estado: "ACTIVO",
          esSuperadmin: true,
          roles: [],
        },
        create: {
          nombre: "Superadmin Demo",
          email: superadminEmail,
          empresaId: null,
          passwordHash: superadminPasswordHash,
          esSuperadmin: true,
          roles: [],
        },
      });

      return { plan, empresa, admin, superadmin, miembros };
    });

    console.log("Seed completado sin duplicar datos.");
    console.log(`  Plan:       ${result.plan.nombre}`);
    console.log(`  Empresa:    ${result.empresa.nombre} (${result.empresa.nif})`);
    console.log(`  Admin:      ${result.admin.email} (${result.admin.roles.join("+")})`);
    for (const miembro of result.miembros) {
      console.log(`  Equipo:     ${miembro.email} (${miembro.roles.join("+")})`);
    }
    console.log(`  Superadmin: ${result.superadmin.email} (sin roles)`);
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
