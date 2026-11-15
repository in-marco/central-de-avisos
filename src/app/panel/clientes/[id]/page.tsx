import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { CopyInvitationLink } from "@/app/_components/copy-invitation-link";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/authz/guards";
import { getClienteDetalle } from "@/lib/clientes/clientes";
import {
  findFlashPortalInvitation,
  listPortalAccess,
  PORTAL_INVITATION_FLASH_COOKIE_NAME,
  type PortalAccessStatus,
} from "@/lib/portal/invitaciones";
import {
  INVITATION_FLASH_MAX_AGE_SECONDS,
  invitationPath,
} from "@/lib/superadmin/invitations";
import {
  buttonPrimaryClass,
  buttonSecondaryClass,
  cardClass,
  ErrorNotice,
  firstValue,
  OkNotice,
  PageHeader,
  StatusChip,
} from "../../_components/ui";
import {
  ClienteFields,
  ContactoFields,
  SedeFields,
} from "../_components/campos";
import {
  CLIENTE_ERROR_MESSAGES,
  CLIENTE_OK_MESSAGES,
  messageFor,
  pluralize,
} from "../_components/mensajes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cliente · Central de avisos",
};

type SearchParams = Promise<{
  [key: string]: string | string[] | undefined;
}>;

const subCardClass = "rounded-lg border border-border bg-background p-4 sm:p-5";

function formatFecha(value: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

/** Chip con el estado del acceso al portal (texto, no solo color). */
function PortalAccessChip({ acceso }: { acceso: PortalAccessStatus }) {
  switch (acceso.estado) {
    case "activo":
      return <StatusChip tone="success">Acceso activo</StatusChip>;
    case "pendiente":
      return (
        <StatusChip tone="warning">
          Invitación pendiente hasta {formatFecha(acceso.expiraEn)}
        </StatusChip>
      );
    case "caducada":
      return <StatusChip tone="danger">Invitación caducada</StatusChip>;
    default:
      return <StatusChip tone="neutral">Sin acceso al portal</StatusChip>;
  }
}

/**
 * Estado del acceso al portal de un contacto y su acción: «Invitar al portal»
 * (sin acceso) o «Generar nuevo enlace» (pendiente o caducada). Sin email no
 * hay botón; con acceso activo tampoco.
 */
function PortalAccess({
  acceso,
  clienteId,
  contacto,
}: {
  acceso: PortalAccessStatus;
  clienteId: string;
  contacto: { id: string; nombre: string; email: string | null };
}) {
  const puedeInvitar = acceso.estado === "sin-acceso" && contacto.email !== null;
  const puedeRegenerar = acceso.estado === "pendiente" || acceso.estado === "caducada";

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-md border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-medium text-text">Portal de cliente</p>
        <div>
          <PortalAccessChip acceso={acceso} />
        </div>
        {acceso.estado === "sin-acceso" && contacto.email === null ? (
          <p className="text-xs leading-5 text-muted">
            Añade un email al contacto para poder invitarlo.
          </p>
        ) : null}
      </div>
      {puedeInvitar || puedeRegenerar ? (
        <form action="/api/panel/clientes/portal" method="post">
          <input name="clienteId" type="hidden" value={clienteId} />
          <input name="contactoId" type="hidden" value={contacto.id} />
          <button
            aria-label={`${puedeInvitar ? "Invitar al portal" : "Generar nuevo enlace"}: ${contacto.nombre}`}
            className={`${buttonSecondaryClass} w-full sm:w-auto`}
            type="submit"
          >
            {puedeInvitar ? "Invitar al portal" : "Generar nuevo enlace"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

export default async function ClienteDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const session = await requirePermission(
    "clientes.gestionar",
    `/panel/clientes/${encodeURIComponent(id)}`,
  );
  // Un id ajeno, inexistente o que no es un UUID se trata igual: 404 sin datos.
  const cliente = await getClienteDetalle(getDb(), session.empresa!.id, id);

  if (!cliente) {
    notFound();
  }

  const query = await searchParams;
  const errorCode = firstValue(query.error);
  const okCode = firstValue(query.ok);
  const errorMessage = messageFor(CLIENTE_ERROR_MESSAGES, errorCode);
  const okMessage = messageFor(CLIENTE_OK_MESSAGES, okCode);
  const sedesPorId = new Map(cliente.sedes.map((sede) => [sede.id, sede.nombre]));

  const empresaId = session.empresa!.id;
  const now = new Date();
  const accesos = await listPortalAccess(getDb(), empresaId, cliente.id, now);
  // El enlace solo se muestra si la cookie flash corresponde a una invitación
  // pendiente de un usuario de este cliente.
  const flashToken = (await cookies()).get(PORTAL_INVITATION_FLASH_COOKIE_NAME)?.value;
  const flash = await findFlashPortalInvitation(
    getDb(),
    empresaId,
    cliente.id,
    flashToken,
    now,
  );
  const flashLink = flash && flashToken ? invitationPath(flashToken) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <Link className={buttonSecondaryClass} href="/panel/clientes">
            Volver al listado
          </Link>
        }
        description={`NIF ${cliente.nif} · ${pluralize(cliente.sedes.length, "sede", "sedes")} · ${pluralize(cliente.contactos.length, "contacto", "contactos")}`}
        eyebrow="Cliente"
        title={cliente.razonSocial}
      />

      <OkNotice message={okMessage} />
      <ErrorNotice message={errorMessage} />

      {flash && flashLink ? (
        <section
          aria-labelledby="titulo-enlace-portal"
          className="rounded-lg border border-accent/50 bg-surface p-5 sm:p-8"
        >
          <h2 className="text-lg font-semibold text-primary" id="titulo-enlace-portal">
            Enlace de invitación al portal
          </h2>
          <p className="mt-2 break-words text-sm leading-6 text-muted">
            Enlace para {flash.contactoNombre}. Cópialo ahora: no se envía por
            email y no se podrá recuperar cuando caduque esta vista temporal (
            {INVITATION_FLASH_MAX_AGE_SECONDS} s). La invitación caduca en 7
            días; si se pierde, genera un enlace nuevo.
          </p>
          <div className="mt-4">
            <CopyInvitationLink value={flashLink} />
          </div>
          <p className="mt-3 break-all font-mono text-sm text-text">{flashLink}</p>
        </section>
      ) : null}

      <section aria-labelledby="titulo-facturacion" className={cardClass}>
        <h2 className="text-lg font-semibold text-primary" id="titulo-facturacion">
          Datos de facturación
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Las facturas se emiten a este cliente, no a la sede.
        </p>
        <form action="/api/panel/clientes/datos" method="post">
          <input name="clienteId" type="hidden" value={cliente.id} />
          <ClienteFields
            defaults={{
              razonSocial: cliente.razonSocial,
              nif: cliente.nif,
              direccionFacturacion: cliente.direccionFacturacion,
              tarifaHoraria: cliente.tarifaHoraria?.toFixed(2) ?? "",
            }}
            idPrefix="cliente"
          />
          <button className={`${buttonPrimaryClass} mt-5 w-full sm:w-auto`} type="submit">
            Guardar datos de facturación
          </button>
        </form>
      </section>

      <section aria-labelledby="titulo-sedes" className={cardClass}>
        <h2 className="text-lg font-semibold text-primary" id="titulo-sedes">
          Sedes ({cliente.sedes.length})
        </h2>
        <ul className="mt-4 flex flex-col gap-4">
          {cliente.sedes.map((sede) => (
            <li className={subCardClass} key={sede.id}>
              <h3 className="break-words text-base font-semibold text-text">
                {sede.nombre}
              </h3>
              <form action="/api/panel/clientes/sedes" method="post">
                <input name="clienteId" type="hidden" value={cliente.id} />
                <input name="sedeId" type="hidden" value={sede.id} />
                <SedeFields
                  defaults={{ nombre: sede.nombre, direccion: sede.direccion }}
                  idPrefix={`sede-${sede.id}`}
                />
                <button
                  className={`${buttonSecondaryClass} mt-5 w-full sm:w-auto`}
                  type="submit"
                >
                  Guardar sede
                </button>
              </form>
            </li>
          ))}
        </ul>

        <div className="mt-6 border-t border-border pt-6">
          <h3 className="text-base font-semibold text-primary">Añadir sede</h3>
          <form action="/api/panel/clientes/sedes" method="post">
            <input name="clienteId" type="hidden" value={cliente.id} />
            <SedeFields idPrefix="sede-nueva" />
            <button className={`${buttonPrimaryClass} mt-5 w-full sm:w-auto`} type="submit">
              Añadir sede
            </button>
          </form>
        </div>
      </section>

      <section aria-labelledby="titulo-contactos" className={cardClass}>
        <h2 className="text-lg font-semibold text-primary" id="titulo-contactos">
          Contactos ({cliente.contactos.length})
        </h2>
        <ul className="mt-4 flex flex-col gap-4">
          {cliente.contactos.map((contacto) => (
            <li className={subCardClass} key={contacto.id}>
              <h3 className="break-words text-base font-semibold text-text">
                {contacto.nombre}
              </h3>
              <p className="mt-1 break-words text-sm text-muted">
                {contacto.sedeId
                  ? `Sede: ${sedesPorId.get(contacto.sedeId) ?? "—"}`
                  : "Todo el cliente"}
              </p>
              <PortalAccess
                acceso={accesos.get(contacto.id) ?? { estado: "sin-acceso" }}
                clienteId={cliente.id}
                contacto={contacto}
              />
              <form action="/api/panel/clientes/contactos" method="post">
                <input name="clienteId" type="hidden" value={cliente.id} />
                <input name="contactoId" type="hidden" value={contacto.id} />
                <ContactoFields
                  defaults={contacto}
                  idPrefix={`contacto-${contacto.id}`}
                  sedes={cliente.sedes}
                />
                <button
                  className={`${buttonSecondaryClass} mt-5 w-full sm:w-auto`}
                  type="submit"
                >
                  Guardar contacto
                </button>
              </form>
            </li>
          ))}
        </ul>

        <div className="mt-6 border-t border-border pt-6">
          <h3 className="text-base font-semibold text-primary">Añadir contacto</h3>
          <p className="mt-1 text-sm text-muted">
            Indica al menos un teléfono o un email.
          </p>
          <form action="/api/panel/clientes/contactos" method="post">
            <input name="clienteId" type="hidden" value={cliente.id} />
            <ContactoFields idPrefix="contacto-nuevo" sedes={cliente.sedes} />
            <button className={`${buttonPrimaryClass} mt-5 w-full sm:w-auto`} type="submit">
              Añadir contacto
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
