import { afterAll, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { disconnectDb } from "@/db/client";
import { inRollback, uniqueSuffix } from "@/db/db-test-utils";
import { TenantContextError } from "@/db/tenant";
import {
  getCompanyBillingSettings,
  updateCompanyBillingSettings,
} from "./configuracion";
import { parseBillingSettingsForm } from "./configuracion-validation";

afterAll(async () => {
  await disconnectDb();
});

// NIF válidos y únicos por ejecución: 8 dígitos + letra.
function uniqueNif(): string {
  const digits = `${Date.now()}${Math.floor(Math.random() * 1e6)}`.slice(-8);
  return `${digits}T`;
}

async function createCompany(tx: Prisma.TransactionClient, suffix: string, tag: string) {
  const plan = await tx.plan.create({
    data: { nombre: `Plan facturación ${tag} ${suffix}`, importeMensual: "10.00" },
  });

  return tx.empresa.create({
    data: {
      nombre: `Empresa ${tag} ${suffix}`,
      nif: `${tag}${suffix}`.toUpperCase(),
      direccionFiscal: "Calle Original 1",
      emailFacturacion: `facturacion-${tag}-${suffix}@example.com`,
      planId: plan.id,
    },
  });
}

function validValues(nif: string) {
  const data = new FormData();
  data.set("nombre", "Instalaciones Norte SL");
  data.set("nif", nif.toLowerCase());
  data.set("direccionFiscal", "Calle Mayor 2, 28013 Madrid");
  data.set("emailFacturacion", "Facturas@Empresa.ES");
  data.set("serieFactura", "f-");
  data.set("tarifaHoraria", "42,5");
  data.set("modoFiscal", "NO_VERIFACTU");
  data.set("empresaId", "00000000-0000-4000-8000-000000000000");
  const parsed = parseBillingSettingsForm(data);
  if (!parsed.ok) {
    throw new Error(`Formulario de test inválido: ${parsed.error}`);
  }
  return parsed.value;
}

describe("configuración de facturación de la empresa", () => {
  it("una empresa nueva queda sin serie ni tarifa y en NO_VERIFACTU", async () => {
    const suffix = uniqueSuffix();

    const settings = await inRollback(async (tx) => {
      const empresa = await createCompany(tx, suffix, "n");
      return getCompanyBillingSettings(tx, empresa.id);
    });

    expect(settings).toMatchObject({
      serieFactura: null,
      tarifaHoraria: null,
      modoFiscal: "NO_VERIFACTU",
      direccionFiscal: "Calle Original 1",
    });
  });

  it("persiste los valores normalizados sin tocar plan ni estado", async () => {
    const suffix = uniqueSuffix();
    const nif = uniqueNif();

    const result = await inRollback(async (tx) => {
      const empresa = await createCompany(tx, suffix, "p");
      const update = await updateCompanyBillingSettings(
        tx,
        empresa.id,
        validValues(nif),
      );
      const settings = await getCompanyBillingSettings(tx, empresa.id);
      const despues = await tx.empresa.findUniqueOrThrow({
        where: { id: empresa.id },
      });
      return { empresa, update, settings, despues };
    });

    expect(result.update).toEqual({ ok: true });
    expect(result.settings).toEqual({
      nombre: "Instalaciones Norte SL",
      nif,
      direccionFiscal: "Calle Mayor 2, 28013 Madrid",
      emailFacturacion: "facturas@empresa.es",
      serieFactura: "F-",
      tarifaHoraria: "42.50",
      modoFiscal: "NO_VERIFACTU",
    });
    expect(result.despues.planId).toBe(result.empresa.planId);
    expect(result.despues.estado).toBe(result.empresa.estado);
  });

  it("guardar el mismo NIF que ya tiene la empresa no es un error", async () => {
    const suffix = uniqueSuffix();
    const nif = uniqueNif();

    const result = await inRollback(async (tx) => {
      const empresa = await createCompany(tx, suffix, "m");
      await tx.empresa.update({ where: { id: empresa.id }, data: { nif } });
      return updateCompanyBillingSettings(tx, empresa.id, validValues(nif));
    });

    expect(result).toEqual({ ok: true });
  });

  it("devuelve nif-duplicado sin cambios si el NIF es de otra empresa", async () => {
    const suffix = uniqueSuffix();
    const nif = uniqueNif();

    const result = await inRollback(async (tx) => {
      const empresaA = await createCompany(tx, suffix, "da");
      const empresaB = await createCompany(tx, suffix, "db");
      await tx.empresa.update({ where: { id: empresaB.id }, data: { nif } });

      const update = await updateCompanyBillingSettings(
        tx,
        empresaA.id,
        validValues(nif),
      );
      const aDespues = await tx.empresa.findUniqueOrThrow({
        where: { id: empresaA.id },
      });
      return { empresaA, update, aDespues };
    });

    expect(result.update).toEqual({ ok: false, error: "nif-duplicado" });
    expect(result.aDespues.nif).toBe(result.empresaA.nif);
    expect(result.aDespues.nombre).toBe(result.empresaA.nombre);
    expect(result.aDespues.serieFactura).toBeNull();
    expect(result.aDespues.tarifaHoraria).toBeNull();
  });

  it("exige contexto de empresa", async () => {
    await expect(
      inRollback((tx) => updateCompanyBillingSettings(tx, "", validValues(uniqueNif()))),
    ).rejects.toThrow(TenantContextError);
  });
});
