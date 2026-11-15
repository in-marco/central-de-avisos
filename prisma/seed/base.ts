import type {
  Empresa,
  Plan,
  Prisma,
  RolUsuario,
  Usuario,
} from "../../src/generated/prisma/client";

/**
 * Datos base comunes a `db:seed` (local) y `demo:seed` (demo pública): plan,
 * Empresa Demo con su facturación (serie F, 45,00 €/h, NO_VERIFACTU), la
 * administradora, el equipo (oficina, técnico y encargado
 * ADMINISTRADOR+TECNICO) y el superadmin sin roles. Idempotente (upserts) y
 * sin efectos fuera de la transacción recibida. No lee variables de entorno ni
 * imprime nada: eso lo hacen los puntos de entrada.
 */

export type SeedBaseConfig = {
  adminEmail: string;
  superadminEmail: string;
  equipo: Array<{ email: string; nombre: string; roles: RolUsuario[] }>;
  adminPasswordHash: string;
  superadminPasswordHash: string;
  equipoPasswordHash: string;
};

export type SeedBaseResult = {
  plan: Plan;
  empresa: Empresa;
  admin: Usuario;
  superadmin: Usuario;
  miembros: Usuario[];
};

export function normalizeSeedEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function requireSeedEnv(
  name: string,
  env: Record<string, string | undefined> = process.env,
  hint = "Configura las variables SEED_* en .env (ver .env.example).",
): string {
  const value = env[name]?.trim();

  if (!value) {
    throw new Error(`Falta ${name}. ${hint}`);
  }

  return value;
}

/** Equipo demo de Empresa Demo, uno por combinación de roles relevante. */
export function equipoDemo(
  env: Record<string, string | undefined> = process.env,
): SeedBaseConfig["equipo"] {
  return [
    {
      email: normalizeSeedEmail(env.SEED_OFICINA_EMAIL ?? "oficina@demo.local"),
      nombre: "Oficina Demo",
      roles: ["OFICINA"],
    },
    {
      email: normalizeSeedEmail(env.SEED_TECNICO_EMAIL ?? "tecnico@demo.local"),
      nombre: "Técnico Demo",
      roles: ["TECNICO"],
    },
    {
      email: normalizeSeedEmail(
        env.SEED_ENCARGADO_EMAIL ?? "encargado@demo.local",
      ),
      nombre: "Encargado Demo",
      roles: ["ADMINISTRADOR", "TECNICO"],
    },
  ];
}

export async function seedBase(
  tx: Prisma.TransactionClient,
  config: SeedBaseConfig,
): Promise<SeedBaseResult> {
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
      serieFactura: "F",
      tarifaHoraria: "45.00",
      modoFiscal: "NO_VERIFACTU",
    },
    create: {
      nombre: "Empresa Demo",
      nif: "B12345678",
      direccionFiscal: "Calle Mayor 1, 28013 Madrid",
      emailFacturacion: "facturacion@demo.local",
      planId: plan.id,
      serieFactura: "F",
      tarifaHoraria: "45.00",
      modoFiscal: "NO_VERIFACTU",
    },
  });

  const admin = await tx.usuario.upsert({
    where: { email: config.adminEmail },
    update: {
      nombre: "Administradora Demo",
      empresaId: empresa.id,
      passwordHash: config.adminPasswordHash,
      estado: "ACTIVO",
      esSuperadmin: false,
      roles: ["ADMINISTRADOR"],
    },
    create: {
      nombre: "Administradora Demo",
      email: config.adminEmail,
      empresaId: empresa.id,
      passwordHash: config.adminPasswordHash,
      roles: ["ADMINISTRADOR"],
    },
  });

  const miembros: Usuario[] = [];
  for (const miembro of config.equipo) {
    miembros.push(
      await tx.usuario.upsert({
        where: { email: miembro.email },
        update: {
          nombre: miembro.nombre,
          empresaId: empresa.id,
          passwordHash: config.equipoPasswordHash,
          estado: "ACTIVO",
          esSuperadmin: false,
          roles: miembro.roles,
        },
        create: {
          nombre: miembro.nombre,
          email: miembro.email,
          empresaId: empresa.id,
          passwordHash: config.equipoPasswordHash,
          roles: miembro.roles,
        },
      }),
    );
  }

  const superadmin = await tx.usuario.upsert({
    where: { email: config.superadminEmail },
    update: {
      nombre: "Superadmin Demo",
      empresaId: null,
      passwordHash: config.superadminPasswordHash,
      estado: "ACTIVO",
      esSuperadmin: true,
      roles: [],
    },
    create: {
      nombre: "Superadmin Demo",
      email: config.superadminEmail,
      empresaId: null,
      passwordHash: config.superadminPasswordHash,
      esSuperadmin: true,
      roles: [],
    },
  });

  return { plan, empresa, admin, superadmin, miembros };
}

/** Líneas de resumen de la parte base, sin contraseñas. */
export function describeSeedBase(result: SeedBaseResult): string[] {
  const lines = [
    `  Plan:       ${result.plan.nombre}`,
    `  Empresa:    ${result.empresa.nombre} (${result.empresa.nif})`,
    `  Facturación: serie ${result.empresa.serieFactura}, tarifa ${result.empresa.tarifaHoraria?.toFixed(2)} €/h, ${result.empresa.modoFiscal}`,
    `  Admin:      ${result.admin.email} (${result.admin.roles.join("+")})`,
  ];
  for (const miembro of result.miembros) {
    lines.push(`  Equipo:     ${miembro.email} (${miembro.roles.join("+")})`);
  }
  lines.push(`  Superadmin: ${result.superadmin.email} (sin roles)`);
  return lines;
}
