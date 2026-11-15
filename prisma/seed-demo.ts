import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { config as loadEnvFile, parse as parseEnv } from "dotenv";
import { getDb } from "../src/db/client";
import { hashPassword } from "../src/lib/auth/password";
import { describeSeedBase, equipoDemo, seedBase } from "./seed/base";
import {
  describeDatabaseTarget,
  resolveDemoSeedConfig,
} from "./seed/demo-config";
import { seedPresentacion } from "./seed/presentacion";

/**
 * Seed de presentación de la demo pública (`npm run demo:seed`). Crea de forma
 * idempotente los datos base de `db:seed` más tres clientes ficticios con sedes,
 * contactos, seis avisos NUEVO/OFICINA y un usuario de cliente con portal.
 *
 * Solo se ejecuta a través de `scripts/with-demo-env.sh`, que exporta
 * `DOTENV_PATH` con el archivo de demo (`.env.demo` o `DEMO_ENV_FILE`). Nunca
 * carga `.env`. Rechaza `NODE_ENV=production` y contraseñas débiles o de
 * ejemplo antes de abrir ninguna conexión. No imprime contraseñas ni URLs con
 * credenciales.
 */

function loadDemoEnv(): string {
  const file = process.env.DOTENV_PATH?.trim();

  if (!file) {
    throw new Error(
      "demo:seed se ejecuta con `npm run demo:seed` (scripts/with-demo-env.sh), que carga solo el archivo de demo.",
    );
  }

  if (path.basename(file) === ".env") {
    throw new Error("demo:seed nunca carga .env; usa .env.demo o DEMO_ENV_FILE.");
  }

  if (!existsSync(file)) {
    throw new Error("No existe el archivo de demo indicado en DOTENV_PATH.");
  }

  loadEnvFile({ path: file, quiet: true });
  return file;
}

/** Contraseñas que aparecen en los archivos de ejemplo versionados. */
function examplePasswordsFromRepo(): string[] {
  const values: string[] = [];

  for (const name of [".env.example", ".env.demo.example"]) {
    const file = path.resolve(import.meta.dirname, "..", name);

    if (!existsSync(file)) {
      continue;
    }

    const parsed = parseEnv(readFileSync(file, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (key.endsWith("_PASSWORD") && value.trim()) {
        values.push(value.trim());
      }
    }
  }

  return values;
}

/** Entorno sin valores vacíos, para que `SEED_*_EMAIL=""` use el valor por defecto. */
function nonEmptyEnv(): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value?.trim()),
  );
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "demo:seed está prohibido con NODE_ENV=production; se lanza solo desde local.",
    );
  }

  loadDemoEnv();
  const env = nonEmptyEnv();
  const config = resolveDemoSeedConfig(env, examplePasswordsFromRepo());

  if (!env.DATABASE_URL) {
    throw new Error("El archivo de demo no define DATABASE_URL.");
  }

  console.log(`Destino: ${describeDatabaseTarget(env.DATABASE_URL)}`);

  const [
    adminPasswordHash,
    superadminPasswordHash,
    equipoPasswordHash,
    clientePasswordHash,
  ] = await Promise.all([
    hashPassword(config.passwords.SEED_ADMIN_PASSWORD),
    hashPassword(config.passwords.SEED_SUPERADMIN_PASSWORD),
    hashPassword(config.passwords.SEED_EQUIPO_PASSWORD),
    hashPassword(config.passwords.SEED_CLIENTE_PASSWORD),
  ]);

  const db = getDb();

  try {
    const result = await db.$transaction(
      async (tx) => {
        const base = await seedBase(tx, {
          adminEmail: config.adminEmail,
          superadminEmail: config.superadminEmail,
          equipo: equipoDemo(env),
          adminPasswordHash,
          superadminPasswordHash,
          equipoPasswordHash,
        });

        const oficina = base.miembros.find(
          (miembro) =>
            miembro.roles.includes("OFICINA") &&
            !miembro.roles.includes("ADMINISTRADOR"),
        );

        if (!oficina) {
          throw new Error("El equipo demo no tiene un usuario de oficina.");
        }

        const presentacion = await seedPresentacion(tx, {
          empresaId: base.empresa.id,
          creadoPorId: oficina.id,
          clienteEmail: config.clienteEmail,
          clienteNombre: "Lucía Ferrer",
          clientePasswordHash,
        });

        return { base, presentacion };
      },
      // Neon (UE) desde local: muchas consultas pequeñas con latencia de red.
      { maxWait: 10_000, timeout: 60_000 },
    );

    const empresaId = result.base.empresa.id;
    const [usuarios, clientes, sedes, contactos, avisos] = await Promise.all([
      db.usuario.count({ where: { empresaId } }),
      db.cliente.count({ where: { empresaId } }),
      db.sede.count({ where: { empresaId } }),
      db.contacto.count({ where: { empresaId } }),
      db.aviso.count({ where: { empresaId } }),
    ]);

    console.log("Seed de presentación completado sin duplicar datos.");
    for (const line of describeSeedBase(result.base)) {
      console.log(line);
    }
    console.log(
      `  Cliente:    ${result.presentacion.usuarioCliente.email} (portal de ${result.presentacion.clientes[0]?.razonSocial ?? "?"})`,
    );
    console.log(
      `  Empresa Demo: ${usuarios} usuarios, ${clientes} clientes, ${sedes} sedes, ${contactos} contactos, ${avisos} avisos (+1 superadmin sin empresa)`,
    );
    console.log(
      "Las contraseñas no se muestran; vienen de SEED_* en el archivo de demo.",
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? `Seed de demo fallido: ${error.message}`
      : "Seed de demo fallido.",
  );
  process.exitCode = 1;
});
