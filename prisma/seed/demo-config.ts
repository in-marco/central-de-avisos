import { normalizeSeedEmail } from "./base";

/**
 * Configuración y validación del seed de presentación (`npm run demo:seed`).
 * Puro: recibe el entorno ya cargado desde el archivo de demo y no toca la
 * base. Todo rechazo ocurre antes de abrir ninguna conexión.
 */

type EnvLike = Record<string, string | undefined>;

export const MIN_DEMO_PASSWORD_LENGTH = 12;

/** Contraseñas de ejemplo conocidas (`.env.example`); nunca valen en la demo. */
export const EXAMPLE_PASSWORDS = [
  "demo-admin-local",
  "demo-superadmin-local",
  "demo-equipo-local",
  "demo-cliente-local",
] as const;

export const DEMO_PASSWORD_VARS = [
  "SEED_ADMIN_PASSWORD",
  "SEED_SUPERADMIN_PASSWORD",
  "SEED_EQUIPO_PASSWORD",
  "SEED_CLIENTE_PASSWORD",
] as const;

export type DemoSeedConfig = {
  adminEmail: string;
  superadminEmail: string;
  clienteEmail: string;
  passwords: Record<(typeof DEMO_PASSWORD_VARS)[number], string>;
};

const DEMO_HINT =
  "Configúrala en el archivo de demo (.env.demo, ver .env.demo.example).";

/**
 * Valida el entorno de la demo. Lanza un error sin mostrar ningún valor si:
 * - `NODE_ENV=production`,
 * - falta una contraseña,
 * - una contraseña tiene menos de 12 caracteres,
 * - una contraseña es una de las de ejemplo (`extraExamples` añade las que
 *   aparezcan en `.env.example` o `.env.demo.example`).
 */
export function resolveDemoSeedConfig(
  env: EnvLike,
  extraExamples: Iterable<string> = [],
): DemoSeedConfig {
  if (env.NODE_ENV === "production") {
    throw new Error(
      "demo:seed está prohibido con NODE_ENV=production; se lanza solo desde local.",
    );
  }

  const examples = new Set<string>([...EXAMPLE_PASSWORDS, ...extraExamples]);
  const passwords = {} as DemoSeedConfig["passwords"];

  for (const name of DEMO_PASSWORD_VARS) {
    const value = env[name]?.trim();

    if (!value) {
      throw new Error(`Falta ${name}. ${DEMO_HINT}`);
    }

    if (value.length < MIN_DEMO_PASSWORD_LENGTH) {
      throw new Error(
        `${name} debe tener al menos ${MIN_DEMO_PASSWORD_LENGTH} caracteres.`,
      );
    }

    if (examples.has(value)) {
      throw new Error(
        `${name} es una contraseña de ejemplo; genera una aleatoria (p. ej. openssl rand -base64 18).`,
      );
    }

    passwords[name] = value;
  }

  return {
    adminEmail: normalizeSeedEmail(env.SEED_ADMIN_EMAIL || "admin@demo.local"),
    superadminEmail: normalizeSeedEmail(
      env.SEED_SUPERADMIN_EMAIL || "superadmin@demo.local",
    ),
    clienteEmail: normalizeSeedEmail(
      env.SEED_CLIENTE_EMAIL || "cliente@demo.local",
    ),
    passwords,
  };
}

/** Host y base de una URL de PostgreSQL, sin usuario ni contraseña. */
export function describeDatabaseTarget(url: string | undefined): string {
  if (!url) {
    return "(sin URL)";
  }

  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return "(URL no válida)";
  }
}
