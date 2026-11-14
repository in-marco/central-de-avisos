import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/client";
import { requireSuperadmin } from "@/lib/superadmin/authorization";
import { listPlans } from "@/lib/superadmin/plans";
import {
  buttonPrimaryClass,
  cardClass,
  ErrorNotice,
  firstValue,
  formatCurrency,
  inputClass,
  PageHeader,
  StatusChip,
  tableWrapperClass,
} from "../_components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Planes · Proveedor · Central de avisos",
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

export default async function PlanesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireSuperadmin("/superadmin/planes");

  const params = await searchParams;
  const errorCode = firstValue(params.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;
  const planes = await listPlans(getDb());

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Catálogo global de planes mensuales. No se borran planes; se pueden desactivar para dejar de ofrecerlos en nuevas empresas."
        eyebrow="Proveedor"
        title="Planes"
      />

      <ErrorNotice message={errorMessage} />

      <section className={cardClass}>
        <h2 className="text-lg font-semibold text-primary">Nuevo plan</h2>
        <form
          action="/api/superadmin/planes"
          className="mt-5 grid gap-5 sm:grid-cols-[1fr_220px_auto] sm:items-end"
          method="post"
        >
          <div className="flex flex-col gap-2">
            <label className={labelClass} htmlFor="nombre">
              Nombre
            </label>
            <input
              className={inputClass}
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
              id="importeMensual"
              inputMode="decimal"
              name="importeMensual"
              placeholder="49,90"
              required
              type="text"
            />
          </div>

          <div className="flex flex-col gap-3">
            <label className="flex min-h-12 items-center gap-3 text-sm font-medium text-text sm:min-h-11">
              <input
                className="h-5 w-5 rounded border-border text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                defaultChecked
                name="activo"
                type="checkbox"
                value="1"
              />
              Activo
            </label>
            <button className={buttonPrimaryClass} type="submit">
              Crear plan
            </button>
          </div>
        </form>
      </section>

      {planes.length === 0 ? (
        <section className={cardClass}>
          <h2 className="text-lg font-semibold text-primary">
            Todavía no hay planes
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Crea un plan para poder asignarlo a nuevas empresas.
          </p>
        </section>
      ) : (
        <div className={tableWrapperClass}>
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <caption className="sr-only">
              Listado de planes con nombre, importe y estado
            </caption>
            <thead className="bg-background text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Plan
                </th>
                <th className="px-4 py-3 text-right font-semibold" scope="col">
                  Importe mensual
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Estado
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {planes.map((plan) => (
                <tr key={plan.id}>
                  <td className="px-4 py-4 font-medium text-text">
                    {plan.nombre}
                  </td>
                  <td className="px-4 py-4 text-right font-mono tabular-nums text-text">
                    {formatCurrency(plan.importeMensual)}
                  </td>
                  <td className="px-4 py-4">
                    {plan.activo ? (
                      <StatusChip tone="success">Activo</StatusChip>
                    ) : (
                      <StatusChip tone="warning">Inactivo</StatusChip>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <Link
                      className="inline-flex min-h-12 items-center rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-0"
                      href={`/superadmin/planes/${plan.id}`}
                    >
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
