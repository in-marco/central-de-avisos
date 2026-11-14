import { afterAll, describe, expect, it } from "vitest";
import { disconnectDb, getDb } from "@/db/client";
import { inRollback, uniqueSuffix } from "@/db/db-test-utils";
import {
  createPlan,
  getPlan,
  listActivePlans,
  listPlans,
  updatePlan,
} from "./plans";

afterAll(async () => {
  await disconnectDb();
});

describe("planes de superadmin", () => {
  it("crea, lista y edita un plan sin borrarlo", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const created = await createPlan(tx, {
        nombre: `Plan ${suffix}`,
        importeMensual: "49.90",
        activo: true,
      });

      if (!created.ok) {
        throw new Error("Se esperaba crear el plan.");
      }

      const before = await getPlan(tx, created.planId);
      const updated = await updatePlan(tx, created.planId, {
        nombre: `Plan ${suffix} actualizado`,
        importeMensual: "59.95",
        activo: false,
      });
      const after = await getPlan(tx, created.planId);
      const active = await listActivePlans(tx);
      const all = await listPlans(tx);

      return { created, before, updated, after, active, all };
    });

    expect(result.before?.importeMensual.toString()).toBe("49.9");
    expect(result.before?.activo).toBe(true);
    expect(result.updated).toEqual({
      ok: true,
      planId: result.created.planId,
    });
    expect(result.after?.nombre).toBe(`Plan ${suffix} actualizado`);
    expect(result.after?.importeMensual.toString()).toBe("59.95");
    expect(result.after?.activo).toBe(false);
    expect(
      result.active.some((plan) => plan.id === result.created.planId),
    ).toBe(false);
    expect(result.all.some((plan) => plan.id === result.created.planId)).toBe(
      true,
    );
  });

  it("rechaza un nombre de plan duplicado y no lo actualiza", async () => {
    const db = getDb();
    const suffix = uniqueSuffix();
    const nombre = `Plan duplicado ${suffix}`;
    const first = await db.plan.create({
      data: { nombre, importeMensual: "10.00" },
    });

    try {
      const duplicate = await createPlan(db, {
        nombre,
        importeMensual: "20.00",
        activo: true,
      });

      expect(duplicate).toEqual({ ok: false, error: "campos" });
      expect(
        await db.plan.count({ where: { nombre } }),
      ).toBe(1);
      expect(first.nombre).toBe(nombre);
    } finally {
      await db.plan.deleteMany({ where: { nombre } });
    }
  });

  it("devuelve null al editar un plan inexistente", async () => {
    const result = await inRollback((tx) =>
      updatePlan(tx, "00000000-0000-4000-8000-000000000000", {
        nombre: `Plan inexistente ${uniqueSuffix()}`,
        importeMensual: "10.00",
        activo: true,
      }),
    );

    expect(result).toBeNull();
  });
});
