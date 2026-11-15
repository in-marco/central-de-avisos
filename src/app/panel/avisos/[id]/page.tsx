import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/authz/guards";
import { can } from "@/lib/authz/permissions";
import { getAvisoDetalle, type AvisoDetalle } from "@/lib/avisos/avisos";
import {
  isEstadoCancelable,
  MOTIVO_CANCELACION_MAX_LENGTH,
  ORIGEN_LABELS,
  PROBLEMA_VALIDACION_LABELS,
  problemasParaValidar,
} from "@/lib/avisos/validation";
import {
  buttonPrimaryClass,
  buttonSecondaryClass,
  cardClass,
  ErrorNotice,
  firstValue,
  helpClass,
  labelClass,
  OkNotice,
  PageHeader,
} from "../../_components/ui";
import { EstadoChip, PrioridadChip } from "../_components/chips";
import {
  avisoAccionError,
  avisoOkMessage,
  formatFecha,
  type AvisoAccionErrorField,
} from "../_components/mensajes";

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
  const accionError = avisoAccionError(firstValue(query.error));
  const puedeValidar = can(session, "avisos.validar");

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
      <ErrorNotice message={accionError?.summary} />

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

      {puedeValidar ? (
        <ValidacionYBolsa
          aviso={aviso}
          errorField={accionError?.field}
          errorFieldMessage={accionError?.fieldMessage}
        />
      ) : null}
    </div>
  );
}

const buttonDangerClass =
  "inline-flex h-12 items-center justify-center rounded-md bg-danger px-5 text-base font-medium text-white transition-colors hover:bg-danger/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11";
const fieldErrorClass = "text-sm leading-5 text-danger";

function describedBy(...ids: Array<string | false | undefined>): string | undefined {
  const value = ids.filter(Boolean).join(" ");
  return value === "" ? undefined : value;
}

function WarningIcon() {
  return (
    <svg
      aria-hidden
      className="mt-0.5 h-5 w-5 shrink-0 text-warning"
      fill="none"
      focusable={false}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 20 20"
    >
      <path d="M10 2.5 18 17H2z" />
      <path d="M10 8v4M10 14.5v.01" />
    </svg>
  );
}

/**
 * Sección «Validación y bolsa» del detalle (solo con `avisos.validar`):
 * - NUEVO: problemas de validación (warning), botón de validar y cancelación.
 * - PENDIENTE: quién y cuándo validó, «En la bolsa de pendientes» y cancelación.
 * - CANCELADO: motivo, quién y cuándo; sin formularios.
 * - Otros estados: sin acciones.
 * El servidor recalcula todo al recibir el POST: la interfaz solo orienta.
 */
function ValidacionYBolsa({
  aviso,
  errorField,
  errorFieldMessage,
}: {
  aviso: AvisoDetalle;
  errorField?: AvisoAccionErrorField;
  errorFieldMessage?: string;
}) {
  const problemas =
    aviso.estado === "NUEVO"
      ? problemasParaValidar({ sedeId: aviso.sede.id, contacto: aviso.contacto })
      : [];
  const cancelable = isEstadoCancelable(aviso.estado);
  const invalid = (field: AvisoAccionErrorField) => errorField === field;
  const errorId = (field: AvisoAccionErrorField) => `cancelacion-${field}-error`;

  return (
    <>
      <section aria-labelledby="titulo-validacion" className={cardClass}>
        <h2 className="text-lg font-semibold text-primary" id="titulo-validacion">
          Validación y bolsa
        </h2>

        {aviso.estado === "NUEVO" ? (
          <>
            <p className="mt-2 text-sm leading-6 text-muted">
              Revisa los datos del aviso. Al validarlo pasa a Pendiente y entra en la bolsa de
              pendientes de la empresa.
            </p>
            {problemas.length > 0 ? (
              <div
                className="mt-4 flex gap-3 rounded-md border border-warning/60 bg-warning/10 px-4 py-3 text-sm leading-6 text-text"
                id="validacion-problemas"
              >
                <WarningIcon />
                <div>
                  <p>
                    <span className="font-semibold">Para validar este aviso, revisa: </span>
                    {problemas.map((problema) => PROBLEMA_VALIDACION_LABELS[problema]).join("; ")}.
                  </p>
                  <p className="mt-1">
                    <Link className={linkClass} href={`/panel/clientes/${aviso.cliente.id}`}>
                      Abrir la ficha del cliente
                    </Link>
                  </p>
                </div>
              </div>
            ) : null}
            <form action="/api/panel/avisos/validar" className="mt-5" method="post">
              <input name="avisoId" type="hidden" value={aviso.id} />
              <button
                aria-describedby={problemas.length > 0 ? "validacion-problemas" : undefined}
                className={`${buttonPrimaryClass} w-full sm:w-auto`}
                type="submit"
              >
                Validar y publicar en la bolsa
              </button>
            </form>
          </>
        ) : null}

        {aviso.validadoEn && aviso.validadoPor ? (
          <dl className="mt-4 grid gap-5 sm:grid-cols-2">
            <div>
              <dt className={dtClass}>Validado</dt>
              <dd className={ddClass}>
                Validado el{" "}
                <time className="tabular-nums" dateTime={aviso.validadoEn.toISOString()}>
                  {formatFecha(aviso.validadoEn)}
                </time>{" "}
                por {aviso.validadoPor.nombre}
              </dd>
            </div>
            {aviso.estado === "PENDIENTE" ? (
              <div>
                <dt className={dtClass}>Bolsa</dt>
                <dd className={ddClass}>En la bolsa de pendientes</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {aviso.estado === "CANCELADO" && aviso.canceladoEn && aviso.canceladoPor ? (
          <dl className="mt-4 grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className={dtClass}>Motivo de la cancelación</dt>
              <dd className={`${ddClass} whitespace-pre-line leading-7`}>
                {aviso.motivoCancelacion}
              </dd>
            </div>
            <div>
              <dt className={dtClass}>Cancelado</dt>
              <dd className={ddClass}>
                Cancelado el{" "}
                <time className="tabular-nums" dateTime={aviso.canceladoEn.toISOString()}>
                  {formatFecha(aviso.canceladoEn)}
                </time>{" "}
                por {aviso.canceladoPor.nombre}
              </dd>
            </div>
          </dl>
        ) : null}

        {aviso.estado !== "NUEVO" && aviso.estado !== "PENDIENTE" && aviso.estado !== "CANCELADO" ? (
          <p className="mt-2 text-sm leading-6 text-muted">
            No hay acciones de validación disponibles en este estado.
          </p>
        ) : null}
      </section>

      {cancelable ? (
        <section aria-labelledby="titulo-cancelacion" className={cardClass}>
          <h2 className="text-lg font-semibold text-primary" id="titulo-cancelacion">
            Cancelar el aviso
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            El aviso pasará a Cancelado
            {aviso.estado === "PENDIENTE" ? " y saldrá de la bolsa de pendientes" : ""}. Esta
            acción no se puede deshacer.
          </p>
          <form action="/api/panel/avisos/cancelar" className="mt-5 flex flex-col gap-4" method="post">
            <input name="avisoId" type="hidden" value={aviso.id} />
            <div className="flex flex-col gap-2">
              <label className={labelClass} htmlFor="cancelacion-motivo">
                Motivo de la cancelación
              </label>
              <textarea
                aria-describedby={describedBy(
                  "cancelacion-motivo-ayuda",
                  invalid("motivo") && errorId("motivo"),
                )}
                aria-invalid={invalid("motivo") ? true : undefined}
                className={`min-h-28 w-full rounded-md border bg-surface px-3 py-2 text-base text-text transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  invalid("motivo") ? "border-danger" : "border-border"
                }`}
                id="cancelacion-motivo"
                maxLength={MOTIVO_CANCELACION_MAX_LENGTH}
                name="motivo"
                required
              />
              <p className={helpClass} id="cancelacion-motivo-ayuda">
                Por qué no se ejecutará (por ejemplo, duplicado o resuelto por el cliente). Máximo{" "}
                {MOTIVO_CANCELACION_MAX_LENGTH} caracteres.
              </p>
              {invalid("motivo") && errorFieldMessage ? (
                <p className={fieldErrorClass} id={errorId("motivo")}>
                  {errorFieldMessage}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <label className="flex min-h-12 items-center gap-3 text-base text-text">
                <input
                  aria-describedby={describedBy(
                    invalid("confirmacion") && errorId("confirmacion"),
                  )}
                  aria-invalid={invalid("confirmacion") ? true : undefined}
                  className="h-5 w-5 shrink-0 rounded border-border text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  name="confirmar"
                  required
                  type="checkbox"
                  value="si"
                />
                Confirmo que este aviso no se ejecutará
              </label>
              {invalid("confirmacion") && errorFieldMessage ? (
                <p className={fieldErrorClass} id={errorId("confirmacion")}>
                  {errorFieldMessage}
                </p>
              ) : null}
            </div>
            <div>
              <button className={`${buttonDangerClass} w-full sm:w-auto`} type="submit">
                Cancelar aviso
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </>
  );
}
