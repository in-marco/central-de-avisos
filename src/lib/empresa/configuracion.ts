import { requireEmpresaId } from "@/db/tenant";
import { isUniqueViolation } from "@/lib/superadmin/db-errors";
import type { BillingSettingsValues, ModoFiscal } from "./configuracion-validation";
import type { EmpresaDb } from "./usuarios";

/**
 * Configuración fiscal y de facturación de la empresa de la sesión. Se lee y
 * se escribe solo por `id = empresaId` (que sale siempre de la sesión) y la
 * escritura nunca toca `plan_id` ni `estado`, que gestiona el superadmin.
 */

export type CompanyBillingSettings = {
  nombre: string;
  nif: string;
  direccionFiscal: string | null;
  emailFacturacion: string;
  serieFactura: string | null;
  /** Cadena con dos decimales («45.00») o `null` si no está configurada. */
  tarifaHoraria: string | null;
  modoFiscal: ModoFiscal;
};

export async function getCompanyBillingSettings(
  db: EmpresaDb,
  empresaId: string,
): Promise<CompanyBillingSettings | null> {
  const empresa = await db.empresa.findUnique({
    where: { id: requireEmpresaId(empresaId) },
    select: {
      nombre: true,
      nif: true,
      direccionFiscal: true,
      emailFacturacion: true,
      serieFactura: true,
      tarifaHoraria: true,
      modoFiscal: true,
    },
  });

  if (!empresa) {
    return null;
  }

  return {
    ...empresa,
    tarifaHoraria: empresa.tarifaHoraria ? empresa.tarifaHoraria.toFixed(2) : null,
  };
}

export type UpdateBillingSettingsResult =
  | { ok: true }
  | { ok: false; error: "nif-duplicado" };

/**
 * Guarda la configuración ya validada por `parseBillingSettingsForm`. Si el
 * NIF pertenece a otra empresa devuelve `nif-duplicado` sin cambios; el mismo
 * NIF que ya tiene la empresa no es un error. La violación de unicidad por
 * carrera se traduce al mismo código.
 */
export async function updateCompanyBillingSettings(
  db: EmpresaDb,
  empresaId: string,
  values: BillingSettingsValues,
): Promise<UpdateBillingSettingsResult> {
  const id = requireEmpresaId(empresaId);

  const otra = await db.empresa.findFirst({
    where: { nif: values.nif, NOT: { id } },
    select: { id: true },
  });

  if (otra) {
    return { ok: false, error: "nif-duplicado" };
  }

  try {
    await db.empresa.update({
      where: { id },
      data: {
        nombre: values.nombre,
        nif: values.nif,
        direccionFiscal: values.direccionFiscal,
        emailFacturacion: values.emailFacturacion,
        serieFactura: values.serieFactura,
        tarifaHoraria: values.tarifaHoraria,
        modoFiscal: values.modoFiscal,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "nif-duplicado" };
    }
    throw error;
  }

  return { ok: true };
}
