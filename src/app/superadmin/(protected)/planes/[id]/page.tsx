import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { requireSuperadmin } from "@/lib/superadmin/authorization";
import { getPlan } from "@/lib/superadmin/plans";
import { isUuid } from "@/lib/superadmin/validation";
import {
  buttonPrimaryClass,
  buttonSecondaryClass,
  cardClass,
  ErrorNotice,
  firstValue,
  inputClass,
  PageHeader,
} from "../../_components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Editar plan · Proveedor · Central de avisos",
};

const ERROR_MESSAGES: Record<string, string> = {
  campos:
    "Revisa el nombre del plan. El nombre es obligatorio y debe ser único.",
  importe:
    "El importe debe ser un número entre 0 y 9999999999,99 con hasta dos decimales.",
  servicio: "No se pudo guardar el plan. Inténtalo de nuevo en unos minutos.",
};

type SearchParams = Promise<{
  [key: string]: string | string[] | undefined;
}>;

const labelClass = "text-sm font-medium text-text";

export default async function EditarPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  await requireSuperadmin("/superadmin/planes");

  const { id } = await params;

  if (!isUuid(id)) {
    notFound();
  }

  const plan = await getPlan(getDb(), id);

  if (!plan) {
    notFound();
  }

  const query = await searchParams;
  const errorCode = firstValue(query.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <Link className={buttonSecondaryClass} href="/superadmin/planes">
            Volver a planes
          </Link>
        }
        description="El nombre es único. Los planes no se borran; desactivarlos deja de ofrecerlos en nuevas empresas."
        eyebrow="Plan"
        title={`Editar ${plan.nombre}`}
      />

      <ErrorNotice message={errorMessage} />

      <form
        action="/api/superadmin/planes"
        className={`${cardClass} flex flex-col gap-5`}
        method="post"
      >
        <input name="planId" type="hidden" value={plan.id} />

        <div className="flex flex-col gap-2">
          <label className={labelClass} htmlFor="nombre">
            Nombre
          </label>
          <input
            className={inputClass}
            defaultValue={plan.nombre}
            id="nombre"
            maxLength={120}
            name="nombre"
            required
            type="text"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className={labelClass} htmlFor="importeMensual">
            Importe mensual (EUR)
          </label>
          <input
            className={`${inputClass} font-mono tabular-nums`}
            defaultValue={plan.importeMensual.toFixed(2)}
            id="importeMensual"
            inputMode="decimal"
            name="importeMensual"
            required
            type="text"
          />
        </div>

        <label className="flex min-h-12 items-center gap-3 text-sm font-medium text-text sm:min-h-0">
          <input
            className="h-5 w-5 rounded border-border text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            defaultChecked={plan.activo}
            name="activo"
            type="checkbox"
            value="1"
          />
          Activo
        </label>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button className={buttonPrimaryClass} type="submit">
            Guardar cambios
          </button>
          <Link className={buttonSecondaryClass} href="/superadmin/planes">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
