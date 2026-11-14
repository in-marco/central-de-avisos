import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { requireSuperadmin } from "@/lib/superadmin/authorization";
import { getCompanyDetail } from "@/lib/superadmin/companies";
import {
  getInvitationStatus,
  hashInvitationToken,
  INVITATION_FLASH_COOKIE_NAME,
  INVITATION_FLASH_MAX_AGE_SECONDS,
  invitationPath,
} from "@/lib/superadmin/invitations";
import { isUuid } from "@/lib/superadmin/validation";
import {
  buttonSecondaryClass,
  cardClass,
  CompanyStatusChip,
  formatCurrency,
  formatDate,
  InvitationStatusChip,
  PageHeader,
  StatusChip,
} from "../../_components/ui";
import { CopyInvitationLink } from "./copy-link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Detalle de empresa · Proveedor · Central de avisos",
};

const labelClass = "font-medium text-muted";
const valueClass = "mt-1 text-base text-text";

export default async function EmpresaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperadmin("/superadmin/empresas");

  const { id } = await params;

  if (!isUuid(id)) {
    notFound();
  }

  const empresa = await getCompanyDetail(getDb(), id);

  if (!empresa) {
    notFound();
  }

  const cookieStore = await cookies();
  const flashToken = cookieStore.get(INVITATION_FLASH_COOKIE_NAME)?.value;
  const tokenInvitation = flashToken
    ? empresa.invitaciones.find(
        (invitation) =>
          invitation.tokenHash === hashInvitationToken(flashToken),
      )
    : undefined;
  const flashLink = tokenInvitation && flashToken ? invitationPath(flashToken) : null;
  const invitation = empresa.invitaciones[0];
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <Link className={buttonSecondaryClass} href="/superadmin/empresas">
            Volver al listado
          </Link>
        }
        description="Datos fiscales, plan contratado y estado de la invitación del administrador."
        eyebrow="Empresa"
        title={empresa.nombre}
      />

      {flashLink && invitation ? (
        <section className="rounded-lg border border-accent/50 bg-surface p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-primary">
            Enlace de invitación
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Copia el enlace ahora: no se enviará por email y no se podrá
            recuperar cuando caduque esta vista temporal ({" "}
            {INVITATION_FLASH_MAX_AGE_SECONDS} s). La invitación caduca en 7
            días.
          </p>
          <div className="mt-4">
            <CopyInvitationLink value={flashLink} />
          </div>
          <p className="mt-3 break-all font-mono text-sm text-text">
            {flashLink}
          </p>
        </section>
      ) : (
        <section className="rounded-lg border border-border bg-background p-4 text-sm leading-6 text-muted">
          El enlace temporal de invitación ya no está disponible. No se envía
          por email y no se puede recuperar; esta feature tampoco reenvía
          invitaciones.
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={cardClass}>
          <h2 className="text-lg font-semibold text-primary">
            Datos de la empresa
          </h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className={labelClass}>NIF</dt>
              <dd className={`${valueClass} font-mono`}>{empresa.nif}</dd>
            </div>
            <div>
              <dt className={labelClass}>Estado</dt>
              <dd className="mt-1">
                <CompanyStatusChip estado={empresa.estado} />
              </dd>
            </div>
            <div>
              <dt className={labelClass}>Email de facturación</dt>
              <dd className={`${valueClass} break-all`}>
                {empresa.emailFacturacion}
              </dd>
            </div>
            <div>
              <dt className={labelClass}>Alta</dt>
              <dd className={valueClass}>{formatDate(empresa.creadoEn)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className={labelClass}>Dirección fiscal</dt>
              <dd className={`${valueClass} whitespace-pre-line`}>
                {empresa.direccionFiscal ?? "Sin dirección registrada"}
              </dd>
            </div>
          </dl>
        </section>

        <section className={cardClass}>
          <h2 className="text-lg font-semibold text-primary">Plan mensual</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className={labelClass}>Plan</dt>
              <dd className={valueClass}>{empresa.plan.nombre}</dd>
            </div>
            <div>
              <dt className={labelClass}>Importe</dt>
              <dd className={`${valueClass} font-mono tabular-nums`}>
                {formatCurrency(empresa.plan.importeMensual)}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className={labelClass}>Estado del plan</dt>
              <dd className="mt-1">
                {empresa.plan.activo ? (
                  <StatusChip tone="success">Activo</StatusChip>
                ) : (
                  <StatusChip tone="warning">Inactivo</StatusChip>
                )}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section className={cardClass}>
        <h2 className="text-lg font-semibold text-primary">
          Administrador invitado
        </h2>
        {invitation ? (
          <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className={labelClass}>Nombre</p>
              <p className={valueClass}>{invitation.usuario.nombre}</p>
            </div>
            <div>
              <p className={labelClass}>Email</p>
              <p className={`${valueClass} break-all`}>
                {invitation.usuario.email}
              </p>
            </div>
            <div>
              <p className={labelClass}>Estado de la invitación</p>
              <p className="mt-1">
                <InvitationStatusChip
                  status={getInvitationStatus(invitation, now)}
                />
              </p>
            </div>
            <div>
              <p className={labelClass}>Expira</p>
              <p className={valueClass}>{formatDate(invitation.expiraEn)}</p>
            </div>
            <div>
              <p className={labelClass}>Usuario</p>
              <p className={valueClass}>
                {invitation.usuario.estado === "INACTIVO"
                  ? "Inactivo, sin contraseña"
                  : "Activo"}
              </p>
            </div>
            <div>
              <p className={labelClass}>Aceptada</p>
              <p className={valueClass}>
                {invitation.aceptadaEn
                  ? formatDate(invitation.aceptadaEn)
                  : "Todavía no"}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Esta empresa no tiene una invitación de administrador registrada.
          </p>
        )}
      </section>
    </div>
  );
}
