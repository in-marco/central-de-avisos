import { afterAll, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { disconnectDb } from "@/db/client";
import { inRollback, uniqueSuffix } from "@/db/db-test-utils";
import { can, PERMISOS } from "@/lib/authz/permissions";
import { hashPassword } from "./password";
import {
  authenticateCredentials,
  createSession,
  getSessionByToken,
  revokeSessionByToken,
} from "./session";
import {
  hashSessionToken,
  SESSION_DURATION_MS,
} from "./session-token";

afterAll(async () => {
  await disconnectDb();
});

type FixtureOptions = {
  password?: string | null;
  estado?: "ACTIVO" | "INACTIVO";
  empresaEstado?: "ACTIVA" | "SUSPENDIDA";
  esSuperadmin?: boolean;
};

async function createFixture(
  tx: Prisma.TransactionClient,
  suffix: string,
  options: FixtureOptions = {},
) {
  const password = options.password === undefined ? "correcta" : options.password;
  const passwordHash = password === null ? null : await hashPassword(password);
  const email = options.esSuperadmin
    ? `superadmin-${suffix}@example.com`
    : `usuario-${suffix}@example.com`;

  if (options.esSuperadmin) {
    const usuario = await tx.usuario.create({
      data: {
        empresaId: null,
        email,
        nombre: "Proveedor SaaS",
        passwordHash,
        estado: options.estado ?? "ACTIVO",
        esSuperadmin: true,
      },
    });

    return { usuario, empresa: null, password };
  }

  const plan = await tx.plan.create({
    data: { nombre: `Plan auth ${suffix}`, importeMensual: "49.90" },
  });
  const empresa = await tx.empresa.create({
    data: {
      nombre: `Empresa auth ${suffix}`,
      nif: `A${suffix.toUpperCase()}`,
      emailFacturacion: `facturacion-auth-${suffix}@example.com`,
      planId: plan.id,
      estado: options.empresaEstado ?? "ACTIVA",
    },
  });
  const usuario = await tx.usuario.create({
    data: {
      empresaId: empresa.id,
      email,
      nombre: "Usuario Auth",
      passwordHash,
      estado: options.estado ?? "ACTIVO",
      roles: ["TECNICO", "ADMINISTRADOR"],
    },
  });

  return { usuario, empresa, password };
}

describe("autenticación con credenciales", () => {
  it("autentica a un usuario de empresa activo y crea una sesión con token hasheado", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const fixture = await createFixture(tx, suffix);
      const auth = await authenticateCredentials({
        db: tx,
        email: `  ${fixture.usuario.email.toUpperCase()}  `,
        password: fixture.password!,
      });

      if (!auth.ok) {
        throw new Error("Se esperaba autenticación correcta.");
      }

      const sesion = await tx.sesion.findUnique({
        where: { tokenHash: hashSessionToken(auth.token) },
      });
      const current = await getSessionByToken(tx, auth.token);

      return { fixture, auth, sesion, current };
    });

    expect(result.auth.user.email).toBe(result.fixture.usuario.email);
    expect(result.auth.user.nombre).toBe("Usuario Auth");
    expect(result.auth.user.empresa).toEqual({
      id: result.fixture.empresa?.id,
      nombre: result.fixture.empresa?.nombre,
    });
    expect(result.auth.user.esSuperadmin).toBe(false);
    expect(result.auth.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.sesion).not.toBeNull();
    expect(result.sesion?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.sesion?.tokenHash).not.toBe(result.auth.token);
    expect(result.sesion?.expiraEn.getTime()).toBe(
      result.auth.expiraEn.getTime(),
    );
    expect(
      result.auth.expiraEn.getTime() - Date.now(),
    ).toBeGreaterThan(SESSION_DURATION_MS - 10_000);
    expect(result.current?.id).toBe(result.fixture.usuario.id);
    // Roles normalizados al orden canónico, tanto en login como en sesión.
    expect(result.auth.user.roles).toEqual(["ADMINISTRADOR", "TECNICO"]);
    expect(result.current?.roles).toEqual(["ADMINISTRADOR", "TECNICO"]);
  });

  it("rechaza una contraseña incorrecta sin crear sesión", async () => {
    const suffix = uniqueSuffix();

    const { auth, sessionCount } = await inRollback(async (tx) => {
      const fixture = await createFixture(tx, suffix);
      const auth = await authenticateCredentials({
        db: tx,
        email: fixture.usuario.email,
        password: "incorrecta",
      });
      const sessionCount = await tx.sesion.count({
        where: { usuarioId: fixture.usuario.id },
      });

      return { auth, sessionCount };
    });

    expect(auth).toEqual({ ok: false, reason: "invalid" });
    expect(sessionCount).toBe(0);
  });

  it("rechaza un email inexistente sin revelar el motivo", async () => {
    const suffix = uniqueSuffix();

    const auth = await inRollback(async (tx) =>
      authenticateCredentials({
        db: tx,
        email: `no-existe-${suffix}@example.com`,
        password: "correcta",
      }),
    );

    expect(auth).toEqual({ ok: false, reason: "invalid" });
  });

  it("rechaza un usuario inactivo", async () => {
    const suffix = uniqueSuffix();

    const auth = await inRollback(async (tx) => {
      const fixture = await createFixture(tx, suffix, { estado: "INACTIVO" });
      return authenticateCredentials({
        db: tx,
        email: fixture.usuario.email,
        password: fixture.password!,
      });
    });

    expect(auth).toEqual({ ok: false, reason: "invalid" });
  });

  it("rechaza una empresa suspendida", async () => {
    const suffix = uniqueSuffix();

    const auth = await inRollback(async (tx) => {
      const fixture = await createFixture(tx, suffix, {
        empresaEstado: "SUSPENDIDA",
      });
      return authenticateCredentials({
        db: tx,
        email: fixture.usuario.email,
        password: fixture.password!,
      });
    });

    expect(auth).toEqual({ ok: false, reason: "invalid" });
  });

  it("rechaza a un usuario invitado sin contraseña", async () => {
    const suffix = uniqueSuffix();

    const auth = await inRollback(async (tx) => {
      const fixture = await createFixture(tx, suffix, { password: null });
      return authenticateCredentials({
        db: tx,
        email: fixture.usuario.email,
        password: "cualquiera",
      });
    });

    expect(auth).toEqual({ ok: false, reason: "invalid" });
  });

  it("autentica al superadmin sin empresa", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const fixture = await createFixture(tx, suffix, { esSuperadmin: true });
      const auth = await authenticateCredentials({
        db: tx,
        email: fixture.usuario.email,
        password: fixture.password!,
      });
      const current = auth.ok
        ? await getSessionByToken(tx, auth.token)
        : null;

      return { auth, current };
    });

    expect(result.auth.ok).toBe(true);
    if (result.auth.ok) {
      expect(result.auth.user.esSuperadmin).toBe(true);
      expect(result.auth.user.empresa).toBeNull();
    }
    expect(result.current?.esSuperadmin).toBe(true);
    expect(result.current?.empresa).toBeNull();
    expect(result.current?.roles).toEqual([]);
  });
});

describe("sesiones revocables", () => {
  it("trata una sesión caducada como no autenticada", async () => {
    const suffix = uniqueSuffix();

    const { token, current } = await inRollback(async (tx) => {
      const fixture = await createFixture(tx, suffix);
      const { token } = await createSession(tx, {
        usuarioId: fixture.usuario.id,
      });
      const current = await getSessionByToken(
        tx,
        token,
        new Date(Date.now() + SESSION_DURATION_MS + 1_000),
      );

      return { token, current };
    });

    expect(token).not.toBe("");
    expect(current).toBeNull();
  });

  it("trata una sesión revocada como no autenticada", async () => {
    const suffix = uniqueSuffix();

    const { revoked, current, revocadaEn } = await inRollback(async (tx) => {
      const fixture = await createFixture(tx, suffix);
      const { token } = await createSession(tx, {
        usuarioId: fixture.usuario.id,
      });
      const revoked = await revokeSessionByToken(tx, token);
      const sesion = await tx.sesion.findUnique({
        where: { tokenHash: hashSessionToken(token) },
      });
      const current = await getSessionByToken(tx, token);

      return { revoked, current, revocadaEn: sesion?.revocadaEn ?? null };
    });

    expect(revoked).toBe(true);
    expect(revocadaEn).toBeInstanceOf(Date);
    expect(current).toBeNull();
  });

  it("permite sesiones concurrentes y el logout solo revoca la actual", async () => {
    const suffix = uniqueSuffix();

    const { firstRevoked, firstCurrent, secondCurrent } = await inRollback(
      async (tx) => {
        const fixture = await createFixture(tx, suffix);
        const first = await createSession(tx, {
          usuarioId: fixture.usuario.id,
        });
        const second = await createSession(tx, {
          usuarioId: fixture.usuario.id,
        });

        const firstRevoked = await revokeSessionByToken(tx, first.token);

        return {
          firstRevoked,
          firstCurrent: await getSessionByToken(tx, first.token),
          secondCurrent: await getSessionByToken(tx, second.token),
        };
      },
    );

    expect(firstRevoked).toBe(true);
    expect(firstCurrent).toBeNull();
    expect(secondCurrent?.id).toBeTruthy();
  });

  it("invalida una sesión existente si el usuario pasa a INACTIVO", async () => {
    const suffix = uniqueSuffix();

    const current = await inRollback(async (tx) => {
      const fixture = await createFixture(tx, suffix);
      const { token } = await createSession(tx, {
        usuarioId: fixture.usuario.id,
      });
      await tx.usuario.update({
        where: { id: fixture.usuario.id },
        data: { estado: "INACTIVO" },
      });

      return getSessionByToken(tx, token);
    });

    expect(current).toBeNull();
  });

  it("invalida una sesión existente si la empresa se suspende", async () => {
    const suffix = uniqueSuffix();

    const current = await inRollback(async (tx) => {
      const fixture = await createFixture(tx, suffix);
      const { token } = await createSession(tx, {
        usuarioId: fixture.usuario.id,
      });
      await tx.empresa.update({
        where: { id: fixture.empresa!.id },
        data: { estado: "SUSPENDIDA" },
      });

      return getSessionByToken(tx, token);
    });

    expect(current).toBeNull();
  });

  it("no autentica con un token desconocido y no guarda el token crudo", async () => {
    const suffix = uniqueSuffix();

    const { current, sesiones } = await inRollback(async (tx) => {
      const fixture = await createFixture(tx, suffix);
      await createSession(tx, { usuarioId: fixture.usuario.id });
      const current = await getSessionByToken(tx, "token-inventado");
      const sesiones = await tx.sesion.findMany({
        where: { usuarioId: fixture.usuario.id },
      });

      return { current, sesiones };
    });

    expect(current).toBeNull();
    expect(sesiones).toHaveLength(1);
    expect(sesiones[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(sesiones[0]?.tokenHash).not.toBe("token-inventado");
  });
});

describe("sesión de usuario de cliente (portal)", () => {
  async function createClienteUser(tx: Prisma.TransactionClient, suffix: string) {
    const fixture = await createFixture(tx, suffix);
    const cliente = await tx.cliente.create({
      data: {
        empresaId: fixture.empresa!.id,
        razonSocial: "Cliente Portal SL",
        nif: "B12345678",
        direccionFacturacion: "Calle Portal 1",
      },
    });
    const usuario = await tx.usuario.create({
      data: {
        empresaId: fixture.empresa!.id,
        clienteId: cliente.id,
        email: `cliente-${suffix}@example.com`,
        nombre: "Usuario Cliente",
        passwordHash: await hashPassword("correcta"),
        estado: "ACTIVO",
        roles: [],
      },
    });

    return { ...fixture, cliente, usuario };
  }

  it("login y sesión exponen el cliente, sin roles ni permisos de empresa", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const fixture = await createClienteUser(tx, suffix);
      const auth = await authenticateCredentials({
        db: tx,
        email: fixture.usuario.email,
        password: "correcta",
      });
      const current = auth.ok ? await getSessionByToken(tx, auth.token) : null;
      return { fixture, auth, current };
    });

    expect(result.auth.ok).toBe(true);
    if (result.auth.ok) {
      expect(result.auth.user.cliente).toEqual({
        id: result.fixture.cliente.id,
        razonSocial: "Cliente Portal SL",
      });
      expect(result.auth.user.roles).toEqual([]);
    }
    expect(result.current?.cliente?.id).toBe(result.fixture.cliente.id);
    expect(result.current?.empresa?.id).toBe(result.fixture.empresa!.id);
    expect(result.current?.roles).toEqual([]);
    for (const permiso of PERMISOS) {
      expect(can(result.current, permiso), permiso).toBe(false);
    }
  });

  it("los usuarios de empresa tienen cliente nulo", async () => {
    const suffix = uniqueSuffix();
    const current = await inRollback(async (tx) => {
      const fixture = await createFixture(tx, suffix);
      const { token } = await createSession(tx, { usuarioId: fixture.usuario.id });
      return getSessionByToken(tx, token);
    });

    expect(current?.cliente).toBeNull();
  });

  it("la sesión de cliente deja de valer si la empresa se suspende", async () => {
    const suffix = uniqueSuffix();
    const current = await inRollback(async (tx) => {
      const fixture = await createClienteUser(tx, suffix);
      const { token } = await createSession(tx, { usuarioId: fixture.usuario.id });
      await tx.empresa.update({
        where: { id: fixture.empresa!.id },
        data: { estado: "SUSPENDIDA" },
      });
      return getSessionByToken(tx, token);
    });

    expect(current).toBeNull();
  });
});
