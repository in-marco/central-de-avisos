import { afterAll, describe, expect, it } from "vitest";
import { disconnectDb, getDb } from "@/db/client";
import { uniqueSuffix } from "@/db/db-test-utils";
import {
  clearLoginAttemptsOnSuccess,
  rateLimitKeys,
  registerLoginAttempt,
  type RateLimitKeys,
} from "./rate-limit";

const WINDOW = 900;
const createdKeys = new Set<string>();

function keysFor(email: string, ip?: string): RateLimitKeys {
  const headers = new Headers(ip ? { "x-real-ip": ip } : {});
  const keys = rateLimitKeys(email, headers);
  createdKeys.add(keys.email);
  if (keys.ip) createdKeys.add(keys.ip);
  return keys;
}

async function counter(clave: string): Promise<number | null> {
  const row = await getDb().limiteLogin.findUnique({ where: { clave } });
  return row ? row.intentos : null;
}

async function register(keys: RateLimitKeys) {
  return registerLoginAttempt(getDb(), keys, WINDOW);
}

afterAll(async () => {
  await getDb().limiteLogin.deleteMany({
    where: { clave: { in: [...createdKeys] } },
  });
  await disconnectDb();
});

describe("limites_login: límite por email", () => {
  it.each([
    ["existente", true],
    ["inexistente", false],
  ])("bloquea el 6.º intento con email %s igual", async (_label, exists) => {
    const email = `rl-${uniqueSuffix()}@demo.invalid`;
    const usuario = exists
      ? await getDb().usuario.create({
          data: {
            email,
            nombre: "Proveedor rate limit",
            empresaId: null,
            esSuperadmin: true,
            passwordHash: null,
          },
        })
      : null;

    const keys = keysFor(email);
    const results = [];
    try {
      for (let i = 0; i < 6; i += 1) {
        results.push(await register(keys));
      }
    } finally {
      if (usuario) {
        await getDb().usuario.delete({ where: { id: usuario.id } });
      }
    }

    expect(results.map((r) => r.intentosEmail)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(results.map((r) => r.bloqueado)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(results[5].intentosIp).toBeNull();
  });

  it("guarda solo hashes", async () => {
    const email = `hash-${uniqueSuffix()}@demo.invalid`;
    const keys = keysFor(email, "198.51.100.23");
    await register(keys);

    const rows = await getDb().$queryRaw<Array<{ clave: string }>>`
      SELECT "clave" FROM "limites_login"
      WHERE "clave" LIKE ${"%" + email + "%"} OR "clave" LIKE '%198.51.100.23%'
    `;
    expect(rows).toEqual([]);
    expect(await counter(keys.email)).toBe(1);
    expect(await counter(keys.ip as string)).toBe(1);
  });

  it("un login correcto antes del bloqueo borra el contador del email", async () => {
    const keys = keysFor(`ok-${uniqueSuffix()}@demo.invalid`);
    for (let i = 0; i < 4; i += 1) await register(keys);
    expect(await counter(keys.email)).toBe(4);

    await clearLoginAttemptsOnSuccess(getDb(), keys);
    expect(await counter(keys.email)).toBeNull();

    const next = await register(keys);
    expect(next.intentosEmail).toBe(1);
  });

  it("pasada la ventana el contador vuelve a 1 y desbloquea", async () => {
    const keys = keysFor(`ventana-${uniqueSuffix()}@demo.invalid`);
    for (let i = 0; i < 6; i += 1) await register(keys);
    expect(await counter(keys.email)).toBe(6);

    await getDb().$executeRaw`
      UPDATE "limites_login"
      SET "ventana_inicio" = now() - make_interval(secs => ${WINDOW + 1}::int)
      WHERE "clave" = ${keys.email}
    `;

    const after = await register(keys);
    expect(after.intentosEmail).toBe(1);
    expect(after.bloqueado).toBe(false);

    const row = await getDb().$queryRaw<Array<{ reciente: boolean }>>`
      SELECT "ventana_inicio" > now() - interval '1 minute' AS reciente
      FROM "limites_login" WHERE "clave" = ${keys.email}
    `;
    expect(row[0].reciente).toBe(true);
  });

  it("dentro de la ventana no se reinicia", async () => {
    const keys = keysFor(`dentro-${uniqueSuffix()}@demo.invalid`);
    await register(keys);
    await getDb().$executeRaw`
      UPDATE "limites_login"
      SET "ventana_inicio" = now() - make_interval(secs => ${WINDOW - 30}::int)
      WHERE "clave" = ${keys.email}
    `;

    expect((await register(keys)).intentosEmail).toBe(2);
  });
});

describe("limites_login: límite por IP", () => {
  it("bloquea cualquier email con más de 50 intentos desde la misma IP", async () => {
    const ip = `192.0.2.${Math.floor(Math.random() * 200) + 1}-${uniqueSuffix()}`;
    const ipKey = keysFor("x@demo.invalid", ip).ip as string;

    await getDb().$executeRaw`
      INSERT INTO "limites_login" ("clave", "intentos", "ventana_inicio")
      VALUES (${ipKey}, 49, now())
    `;

    const fiftieth = await register(keysFor(`ip1-${uniqueSuffix()}@demo.invalid`, ip));
    expect(fiftieth.intentosIp).toBe(50);
    expect(fiftieth.bloqueado).toBe(false);

    const blocked = await register(keysFor(`ip2-${uniqueSuffix()}@demo.invalid`, ip));
    expect(blocked.intentosEmail).toBe(1);
    expect(blocked.intentosIp).toBe(51);
    expect(blocked.bloqueado).toBe(true);
  });

  it("un login correcto descuenta su intento del contador de IP", async () => {
    const ip = `198.51.100.${uniqueSuffix()}`;
    const keys = keysFor(`desc-${uniqueSuffix()}@demo.invalid`, ip);

    await register(keys);
    await register(keysFor(`otro-${uniqueSuffix()}@demo.invalid`, ip));
    expect(await counter(keys.ip as string)).toBe(2);

    await clearLoginAttemptsOnSuccess(getDb(), keys);
    expect(await counter(keys.ip as string)).toBe(1);

    await clearLoginAttemptsOnSuccess(getDb(), keys);
    await clearLoginAttemptsOnSuccess(getDb(), keys);
    expect(await counter(keys.ip as string)).toBe(0);
  });
});

describe("limites_login: atomicidad y limpieza", () => {
  it("10 registros concurrentes dan contadores 1..10 sin huecos", async () => {
    const keys = keysFor(`conc-${uniqueSuffix()}@demo.invalid`);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => register(keys)),
    );

    expect(results.map((r) => r.intentosEmail).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(await counter(keys.email)).toBe(10);
  });

  it("borra las filas con ventana de más de un día", async () => {
    const stale = keysFor(`viejo-${uniqueSuffix()}@demo.invalid`);
    const fresh = keysFor(`nuevo-${uniqueSuffix()}@demo.invalid`);

    await getDb().$executeRaw`
      INSERT INTO "limites_login" ("clave", "intentos", "ventana_inicio")
      VALUES (${stale.email}, 3, now() - interval '25 hours')
    `;
    expect(await counter(stale.email)).toBe(3);

    await register(fresh);

    expect(await counter(stale.email)).toBeNull();
    expect(await counter(fresh.email)).toBe(1);
  });
});
