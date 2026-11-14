import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/client";
import { requireSuperadmin } from "@/lib/superadmin/authorization";
import { listActivePlans } from "@/lib/superadmin/plans";
import {
  buttonPrimaryClass,
  buttonSecondaryClass,
  cardClass,
  ErrorNotice,
  firstValue,
  formatCurrency,
  inputClass,
  PageHeader,
  selectClass,
  textareaClass,
} from "../../_components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nueva empresa · Proveedor · Central de avisos",
};

const ERROR_MESSAGES: Record<string, string> = {
  campos: "Revisa los campos obligatorios del alta de empresa.",
  nif: "El NIF no es válido o ya está registrado por otra empresa.",
  email:
    "El email del administrador no es válido o ya pertenece a otra cuenta.",
  plan: "Selecciona un plan activo para la empresa.",
  servicio: "No se pudo completar el alta. Inténtalo de nuevo en unos minutos.",
};

type SearchParams = Promise<{
  [key: string]: string | string[] | undefined;
}>;

const labelClass = "text-sm font-medium text-text";
const helpClass = "text-xs leading-5 text-muted";

export default async function NuevaEmpresaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireSuperadmin("/superadmin/empresas/nueva");

  const params = await searchParams;
  const errorCode = firstValue(params.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;
  const planes = await listActivePlans(getDb());

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <Link
            className={buttonSecondaryClass}
            href="/superadmin/empresas"
          >
            Volver al listado
          </Link>
        }
        description="El alta crea la empresa, el usuario administrador invitado sin contraseña y una invitación de 7 días en una sola transacción."
        eyebrow="Proveedor"
        title="Nueva empresa"
      />

      <ErrorNotice message={errorMessage} />

      {planes.length === 0 ? (
        <section className={cardClass}>
          <h2 className="text-lg font-semibold text-primary">
            No hay planes activos
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Crea un plan activo antes de dar de alta una empresa. Los planes
            inactivos no se ofrecen en el alta.
          </p>
          <Link
            className={`${buttonPrimaryClass} mt-5`}
            href="/superadmin/planes"
          >
            Ir a planes
          </Link>
        </section>
      ) : (
        <form
          action="/api/superadmin/empresas"
          className="flex flex-col gap-6"
          method="post"
        >
          <section className={cardClass}>
            <h2 className="text-lg font-semibold text-primary">
              Datos de la empresa
            </h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-2 sm:col-span-2">
                <label className={labelClass} htmlFor="nombre">
                  Razón social
                </label>
                <input
                  autoComplete="organization"
                  className={inputClass}
                  id="nombre"
                  maxLength={160}
                  name="nombre"
                  required
                  type="text"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className={labelClass} htmlFor="nif">
                  NIF
                </label>
                <input
                  autoComplete="off"
                  className={`${inputClass} font-mono uppercase`}
                  id="nif"
                  maxLength={20}
                  name="nif"
                  required
                  type="text"
                />
                <p className={helpClass}>
                  Se guarda en mayúsculas y sin espacios. No se valida el dígito
                  de control.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <label className={labelClass} htmlFor="emailFacturacion">
                  Email de facturación
                </label>
                <input
                  autoComplete="email"
                  className={inputClass}
                  id="emailFacturacion"
                  maxLength={254}
                  name="emailFacturacion"
                  required
                  type="email"
                />
              </div>

              <div className="flex flex-col gap-2 sm:col-span-2">
                <label className={labelClass} htmlFor="direccionFiscal">
                  Dirección fiscal
                </label>
                <textarea
                  className={textareaClass}
                  id="direccionFiscal"
                  maxLength={240}
                  name="direccionFiscal"
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className={labelClass} htmlFor="planId">
                  Plan mensual
                </label>
                <select
                  className={selectClass}
                  defaultValue=""
                  id="planId"
                  name="planId"
                  required
                >
                  <option disabled value="">
                    Selecciona un plan activo
                  </option>
                  {planes.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.nombre} — {formatCurrency(plan.importeMensual)}/mes
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className={labelClass} htmlFor="estado">
                  Estado inicial
                </label>
                <select
                  className={selectClass}
                  defaultValue="ACTIVA"
                  id="estado"
                  name="estado"
                  required
                >
                  <option value="ACTIVA">Activa</option>
                  <option value="SUSPENDIDA">Suspendida</option>
                </select>
              </div>
            </div>
          </section>

          <section className={cardClass}>
            <h2 className="text-lg font-semibold text-primary">
              Administrador invitado
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              El usuario se crea inactivo y sin contraseña. La aceptación de la
              invitación pertenece al siguiente paso del producto.
            </p>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className={labelClass} htmlFor="adminNombre">
                  Nombre del administrador
                </label>
                <input
                  autoComplete="name"
                  className={inputClass}
                  id="adminNombre"
                  maxLength={120}
                  name="adminNombre"
                  required
                  type="text"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className={labelClass} htmlFor="adminEmail">
                  Email del administrador
                </label>
                <input
                  autoComplete="email"
                  className={inputClass}
                  id="adminEmail"
                  maxLength={254}
                  name="adminEmail"
                  required
                  type="email"
                />
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button className={buttonPrimaryClass} type="submit">
              Crear empresa e invitar
            </button>
            <Link className={buttonSecondaryClass} href="/superadmin/empresas">
              Cancelar
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
