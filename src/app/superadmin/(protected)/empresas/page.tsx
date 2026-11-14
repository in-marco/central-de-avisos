import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/client";
import { requireSuperadmin } from "@/lib/superadmin/authorization";
import { listCompaniesWithInvitations } from "@/lib/superadmin/companies";
import { getInvitationStatus } from "@/lib/superadmin/invitations";
import {
  buttonPrimaryClass,
  CompanyStatusChip,
  ErrorNotice,
  firstValue,
  formatCurrency,
  InvitationStatusChip,
  PageHeader,
  tableWrapperClass,
} from "../_components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Empresas · Proveedor · Central de avisos",
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

export default async function EmpresasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireSuperadmin("/superadmin/empresas");

  const params = await searchParams;
  const errorCode = firstValue(params.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;
  const empresas = await listCompaniesWithInvitations(getDb());
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <Link className={buttonPrimaryClass} href="/superadmin/empresas/nueva">
            Nueva empresa
          </Link>
        }
        description="Empresas de servicios registradas, su plan mensual y el estado de la invitación de su administrador."
        eyebrow="Proveedor"
        title="Empresas"
      />

      <ErrorNotice message={errorMessage} />

      {empresas.length === 0 ? (
        <section className="rounded-lg border border-border bg-surface p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-primary">
            Todavía no hay empresas
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Crea el primer plan si hace falta y da de alta una empresa con su
            administrador invitado.
          </p>
        </section>
      ) : (
        <div className={tableWrapperClass}>
          <table className="min-w-[920px] w-full border-collapse text-left text-sm">
            <caption className="sr-only">
              Listado de empresas con plan, estado e invitación
            </caption>
            <thead className="bg-background text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Empresa
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  NIF
                </th>
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
                  Administrador
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Invitación
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {empresas.map((empresa) => {
                const invitation = empresa.invitaciones[0];

                return (
                  <tr className="align-top" key={empresa.id}>
                    <td className="px-4 py-4">
                      <Link
                        className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        href={`/superadmin/empresas/${empresa.id}`}
                      >
                        {empresa.nombre}
                      </Link>
                    </td>
                    <td className="px-4 py-4 font-mono text-text">
                      {empresa.nif}
                    </td>
                    <td className="px-4 py-4 text-text">{empresa.plan.nombre}</td>
                    <td className="px-4 py-4 text-right font-mono tabular-nums text-text">
                      {formatCurrency(empresa.plan.importeMensual)}
                    </td>
                    <td className="px-4 py-4">
                      <CompanyStatusChip estado={empresa.estado} />
                    </td>
                    <td className="px-4 py-4">
                      {invitation ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-text">
                            {invitation.usuario.nombre}
                          </span>
                          <span className="break-all text-muted">
                            {invitation.usuario.email}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted">Sin invitación</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {invitation ? (
                        <InvitationStatusChip
                          status={getInvitationStatus(invitation, now)}
                        />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
