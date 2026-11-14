import { describe, expect, it } from "vitest";
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  isEmailLengthValid,
  isPasswordLengthValid,
  normalizeEmail,
  PASSWORD_MAX_LENGTH,
  verifyPassword,
} from "./password";

describe("normalización de identidad", () => {
  it("normaliza email con trim y minúsculas", () => {
    expect(normalizeEmail("  Admin@Demo.LOCAL  ")).toBe("admin@demo.local");
  });

  it("limita email y contraseña", () => {
    expect(isEmailLengthValid("a".repeat(254))).toBe(true);
    expect(isEmailLengthValid("a".repeat(255))).toBe(false);
    expect(isEmailLengthValid("")).toBe(false);
    expect(isPasswordLengthValid("x")).toBe(true);
    expect(isPasswordLengthValid("x".repeat(PASSWORD_MAX_LENGTH))).toBe(true);
    expect(isPasswordLengthValid("x".repeat(PASSWORD_MAX_LENGTH + 1))).toBe(
      false,
    );
    expect(isPasswordLengthValid("")).toBe(false);
  });
});

describe("hash scrypt versionado", () => {
  it("genera el formato versionado con salt y hash base64url", async () => {
    const hash = await hashPassword("contraseña-de-prueba");

    expect(hash).toMatch(
      /^scrypt\$v=1\$N=131072,r=8,p=1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/,
    );
  });

  it("verifica la contraseña correcta y rechaza la incorrecta", async () => {
    const hash = await hashPassword("contraseña-de-prueba");

    await expect(verifyPassword("contraseña-de-prueba", hash)).resolves.toBe(
      true,
    );
    await expect(verifyPassword("otra-contraseña", hash)).resolves.toBe(false);
  });

  it("rechaza hashes malformados o con parámetros fuera de rango", async () => {
    await expect(verifyPassword("x", "no-es-un-hash")).resolves.toBe(false);
    await expect(
      verifyPassword(
        "x",
        "scrypt$v=1$N=999999999,r=8,p=1$c2FsdA$aGFzaA",
      ),
    ).resolves.toBe(false);
    await expect(
      verifyPassword("x", "argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA"),
    ).resolves.toBe(false);
  });

  it("el hash dummy es válido y no coincide con contraseñas arbitrarias", async () => {
    await expect(
      verifyPassword("dummy-password-not-used", DUMMY_PASSWORD_HASH),
    ).resolves.toBe(true);
    await expect(verifyPassword("otra", DUMMY_PASSWORD_HASH)).resolves.toBe(
      false,
    );
  });

  it("rechaza contraseñas vacías o demasiado largas al crear el hash", async () => {
    await expect(hashPassword("")).rejects.toThrow();
    await expect(
      hashPassword("x".repeat(PASSWORD_MAX_LENGTH + 1)),
    ).rejects.toThrow();
  });
});
