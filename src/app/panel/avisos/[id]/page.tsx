import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/authz/guards";
import { getAvisoDetalle } from "@/lib/avisos/avisos";
import { ORIGEN_LABELS } from "@/lib/avisos/validation";
import {
  buttonPrimaryClass,
  buttonSecondaryClass,
  cardClass,
  firstValue,
  OkNotice,
  PageHeader,
} from "../../_components/ui";
import { EstadoChip, PrioridadChip } from "../_components/chips";
import { avisoOkMessage, formatFecha } from "../_components/mensajes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Aviso · Central de avisos",
};

type SearchParams = Promise<{
  [key: string]: string | string[] | undefined;
}>;

const dtClass = "text-sm font-medium text-muted";
const ddClass = "mt-1 break-words text-base text-text";
const linkClass =
  "rounded-sm font-medium text-primary underline underline-offset-4 hover:text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export default async function AvisoDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const session = await requirePermission(
    "avisos.crear",
    `/panel/avisos/${encodeURIComponent(id)}`,
  );
  // Un id ajeno, inexistente o que no es un UUID se trata igual: 404 sin datos.
  const aviso = await getAvisoDetalle(getDb(), session.empresa!.id, id);

  if (!aviso) {
    notFound();
  }

  const query = await searchParams;
  const okMessage = avisoOkMessage(firstValue(query.ok));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <>
            <Link className={buttonSecondaryClass} href="/panel/avisos">
              Volver al listado
            </Link>
            <Link className={buttonPrimaryClass} href="/panel/avisos/nuevo">
              Nuevo aviso
            </Link>
          </>
        }
        description={`${aviso.sede.nombre} · creado el ${formatFecha(aviso.creadoEn)}`}
        eyebrow="Aviso"
        title={aviso.cliente.razonSocial}
      />

      <OkNotice message={okMessage} />

      <section aria-labelledby="titulo-estado" className={cardClass}>
        <h2 className="text-lg font-semibold text-primary" id="titulo-estado">
          Estado del aviso
        </h2>
        <dl className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className={dtClass}>Estado</dt>
            <dd className="mt-1">
              <EstadoChip estado={aviso.estado} />
            </dd>
          </div>
          <div>
            <dt className={dtClass}>Prioridad</dt>
            <dd className="mt-1">
              <PrioridadChip prioridad={aviso.prioridad} />
            </dd>
          </div>
          <div>
            <dt className={dtClass}>Origen</dt>
            <dd className={ddClass}>{ORIGEN_LABELS[aviso.origen]}</dd>
          </div>
          <div>
            <dt className={dtClass}>Creado</dt>
            <dd className={ddClass}>
              <time className="tabular-nums" dateTime={aviso.creadoEn.toISOString()}>
                {formatFecha(aviso.creadoEn)}
              </time>{" "}
              por {aviso.creadoPor.nombre}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="titulo-descripcion" className={cardClass}>
        <h2 className="text-lg font-semibold text-primary" id="titulo-descripcion">
          Descripción de la avería
        </h2>
        <p className="mt-3 whitespace-pre-line break-words text-base leading-7 text-text">
          {aviso.descripcion}
        </p>
      </section>

      <section aria-labelledby="titulo-cliente" className={cardClass}>
        <h2 className="text-lg font-semibold text-primary" id="titulo-cliente">
          Cliente, sede y contacto
        </h2>
        <dl className="mt-4 grid gap-5 sm:grid-cols-3">
          <div>
            <dt className={dtClass}>Cliente</dt>
            <dd className={ddClass}>
              <Link className={linkClass} href={`/panel/clientes/${aviso.cliente.id}`}>
                {aviso.cliente.razonSocial}
              </Link>
              <span className="block font-mono text-sm text-muted">{aviso.cliente.nif}</span>
            </dd>
          </div>
          <div>
            <dt className={dtClass}>Sede</dt>
            <dd className={ddClass}>
              <span className="block font-medium">{aviso.sede.nombre}</span>
              <span className="block whitespace-pre-line text-sm text-muted">
                {aviso.sede.direccion}
              </span>
            </dd>
          </div>
          <div>
            <dt className={dtClass}>Contacto</dt>
            <dd className={ddClass}>
              <span className="block font-medium">{aviso.contacto.nombre}</span>
              {aviso.contacto.telefono ? (
                <span className="block text-sm">
                  Teléfono:{" "}
                  <a className={linkClass} href={`tel:${aviso.contacto.telefono.replace(/\s+/g, "")}`}>
                    {aviso.contacto.telefono}
                  </a>
                </span>
              ) : null}
              {aviso.contacto.email ? (
                <span className="block text-sm">
                  Email:{" "}
                  <a className={linkClass} href={`mailto:${aviso.contacto.email}`}>
                    {aviso.contacto.email}
                  </a>
                </span>
              ) : null}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
