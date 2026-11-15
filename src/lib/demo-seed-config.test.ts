import { describe, expect, it } from "vitest";
import {
  describeDatabaseTarget,
  resolveDemoSeedConfig,
} from "../../prisma/seed/demo-config";

const STRONG = {
  SEED_ADMIN_PASSWORD: "Adm1n-aleatoria-xyz",
  SEED_SUPERADMIN_PASSWORD: "Sup3r-aleatoria-xyz",
  SEED_EQUIPO_PASSWORD: "Equ1po-aleatoria-xyz",
  SEED_CLIENTE_PASSWORD: "Cl1ente-aleatoria-xyz",
};

describe("resolveDemoSeedConfig (demo:seed)", () => {
  it("acepta contraseñas fuertes y usa los emails por defecto", () => {
    const config = resolveDemoSeedConfig(STRONG);
    expect(config.adminEmail).toBe("admin@demo.local");
    expect(config.superadminEmail).toBe("superadmin@demo.local");
    expect(config.clienteEmail).toBe("cliente@demo.local");
    expect(config.passwords.SEED_CLIENTE_PASSWORD).toBe(
      STRONG.SEED_CLIENTE_PASSWORD,
    );
  });

  it("normaliza los emails configurados", () => {
    const config = resolveDemoSeedConfig({
      ...STRONG,
      SEED_CLIENTE_EMAIL: " Presidenta@Demo.LOCAL ",
    });
    expect(config.clienteEmail).toBe("presidenta@demo.local");
  });

  it("rechaza NODE_ENV=production", () => {
    expect(() =>
      resolveDemoSeedConfig({ ...STRONG, NODE_ENV: "production" }),
    ).toThrow(/production/);
  });

  it.each([
    "SEED_ADMIN_PASSWORD",
    "SEED_SUPERADMIN_PASSWORD",
    "SEED_EQUIPO_PASSWORD",
    "SEED_CLIENTE_PASSWORD",
  ])("exige %s", (name) => {
    expect(() => resolveDemoSeedConfig({ ...STRONG, [name]: "" })).toThrow(
      new RegExp(`Falta ${name}`),
    );
  });

  it("rechaza contraseñas de menos de 12 caracteres sin mostrarlas", () => {
    expect(() =>
      resolveDemoSeedConfig({ ...STRONG, SEED_EQUIPO_PASSWORD: "corta-8c" }),
    ).toThrow(/al menos 12/);
    try {
      resolveDemoSeedConfig({ ...STRONG, SEED_EQUIPO_PASSWORD: "corta-8c" });
    } catch (error) {
      expect(String(error)).not.toContain("corta-8c");
    }
  });

  it("rechaza las contraseñas de ejemplo conocidas y las de los archivos", () => {
    expect(() =>
      resolveDemoSeedConfig({ ...STRONG, SEED_ADMIN_PASSWORD: "demo-admin-local" }),
    ).toThrow(/ejemplo/);
    expect(() =>
      resolveDemoSeedConfig(
        { ...STRONG, SEED_CLIENTE_PASSWORD: "otra-de-ejemplo-larga" },
        ["otra-de-ejemplo-larga"],
      ),
    ).toThrow(/ejemplo/);
  });
});

describe("describeDatabaseTarget", () => {
  it("muestra host y base sin credenciales", () => {
    const target = describeDatabaseTarget(
      "postgresql://usuario:secreto@ep-x-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require",
    );
    expect(target).toBe("ep-x-pooler.eu-central-1.aws.neon.tech/neondb");
    expect(target).not.toContain("secreto");
    expect(target).not.toContain("usuario");
  });

  it("no falla con URL ausente o inválida", () => {
    expect(describeDatabaseTarget(undefined)).toBe("(sin URL)");
    expect(describeDatabaseTarget("no es url")).toBe("(URL no válida)");
  });
});
