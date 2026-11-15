import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/authz/guards";
import {
  getClienteParaAviso,
  listClientesParaAviso,
  type ClienteParaAviso,
} from "@/lib/avisos/avisos";
import {
  DESCRIPCION_MAX_LENGTH,
  PRIORIDAD_LABELS,
  PRIORIDADES,
} from "@/lib/avisos/validation";
import {
  buttonPrimaryClass,
  buttonSecondaryClass,
  cardClass,
  ErrorNotice,
  firstValue,
  helpClass,
  labelClass,
  PageHeader,
} from "../../_components/ui";
import { avisoError, type AvisoErrorField } from "../_components/mensajes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nuevo aviso · Central de avisos",
};

type SearchParams = Promise<{
  [key: string]: string | string[] | undefined;
}>;

const NUEVO_PATH = "/panel/avisos/nuevo";

const controlBase =
  "w-full rounded-md border bg-surface px-3 text-base text-text transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const selectBase = `${controlBase} h-12`;
const textareaBase = `${controlBase} min-h-36 py-2`;
const radioClass =
  "h-5 w-5 shrink-0 border-border text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const fieldErrorClass = "text-sm leading-5 text-danger";
const legendClass = "text-sm font-medium text-text";

function borderFor(invalid: boolean): string {
  return invalid ? "border-danger" : "border-border";
}

function describedBy(...ids: Array<string | false | undefined>): string | undefined {
  const value = ids.filter(Boolean).join(" ");
  return value === "" ? undefined : value;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <p className={fieldErrorClass} id={id}>
      {message}
    </p>
  );
}

export default async function NuevoAvisoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requirePermission("avisos.crear", NUEVO_PATH);
  // `requirePermission` garantiza una sesión de empresa con permiso.
  const empresaId = session.empresa!.id;
  const db = getDb();

  const query = await searchParams;
  const clienteParam = firstValue(query.clienteId);
  const error = avisoError(firstValue(query.error));

  if (clienteParam === undefined) {
    const clientes = await listClientesParaAviso(db, empresaId);
    return <PasoCliente clientes={clientes} errorMessage={error?.summary} />;
  }

  // Un clienteId vacío, no UUID, inexistente o de otra empresa vuelve al
  // paso 1 sin mostrar datos de nadie.
  const cliente = await getClienteParaAviso(db, empresaId, clienteParam);

  if (!cliente) {
    redirect(`${NUEVO_PATH}?error=no-encontrado`);
  }

  return (
    <PasoDatos
      cliente={cliente}
      errorField={error?.field}
      errorFieldMessage={error?.fieldMessage}
      errorMessage={error?.summary}
    />
  );
}

function PasoCliente({
  clientes,
  errorMessage,
}: {
  clientes: ReadonlyArray<{ id: string; razonSocial: string; nif: string }>;
  errorMessage?: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <Link className={buttonSecondaryClass} href="/panel/avisos">
            Volver al listado
          </Link>
        }
        description="Paso 1 de 2. Elige el cliente que comunica la avería; después indicarás la sede, el contacto y la prioridad."
        eyebrow="Avisos"
        title="Nuevo aviso"
      />

      <ErrorNotice message={errorMessage} />

      {clientes.length === 0 ? (
        <section className={cardClass}>
          <h2 className="text-lg font-semibold text-primary">Todavía no hay clientes</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Para registrar un aviso necesitas al menos un cliente con una sede y
            un contacto.
          </p>
          <Link className={`${buttonPrimaryClass} mt-5`} href="/panel/clientes/nuevo">
            Dar de alta un cliente
          </Link>
        </section>
      ) : (
        <form action={NUEVO_PATH} className={cardClass} method="get">
          <div className="flex flex-col gap-2">
            <label className={labelClass} htmlFor="aviso-clienteId">
              Cliente
            </label>
            <select
              className={`${selectBase} border-border`}
              defaultValue=""
              id="aviso-clienteId"
              name="clienteId"
              required
            >
              <option disabled value="">
                Elige un cliente
              </option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {`${cliente.razonSocial} · ${cliente.nif}`}
                </option>
              ))}
            </select>
          </div>
          <button className={`${buttonPrimaryClass} mt-5 w-full sm:w-auto`} type="submit">
            Continuar
          </button>
        </form>
      )}
    </div>
  );
}

function PasoDatos({
  cliente,
  errorMessage,
  errorField,
  errorFieldMessage,
}: {
  cliente: ClienteParaAviso;
  errorMessage?: string;
  errorField?: AvisoErrorField;
  errorFieldMessage?: string;
}) {
  const sedesPorId = new Map(cliente.sedes.map((sede) => [sede.id, sede.nombre]));
  const unaSede = cliente.sedes.length === 1;
  const invalid = (field: AvisoErrorField) => errorField === field;
  const ariaInvalid = (field: AvisoErrorField) => (invalid(field) ? true : undefined);
  const errorId = (field: AvisoErrorField) => `aviso-${field}-error`;
  const fieldMessage = (field: AvisoErrorField) =>
    invalid(field) ? errorFieldMessage : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <Link className={buttonSecondaryClass} href="/panel/avisos">
            Volver al listado
          </Link>
        }
        description="Paso 2 de 2. Indica la sede afectada, la persona de contacto, la avería y la prioridad."
        eyebrow="Avisos"
        title="Nuevo aviso"
      />

      <ErrorNotice message={errorMessage} />

      <section aria-labelledby="titulo-cliente" className={cardClass}>
        <p className="text-sm font-medium text-muted" id="titulo-cliente">
          Cliente
        </p>
        <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 break-words text-lg font-semibold text-primary">
            {cliente.razonSocial}{" "}
            <span className="font-mono text-sm font-normal text-muted">{cliente.nif}</span>
          </p>
          <Link className={buttonSecondaryClass} href={NUEVO_PATH}>
            Cambiar cliente
          </Link>
        </div>
      </section>

      <form action="/api/panel/avisos" className={cardClass} method="post">
        <input name="clienteId" type="hidden" value={cliente.id} />

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className={labelClass} htmlFor="aviso-sedeId">
              Sede
            </label>
            <select
              aria-describedby={describedBy(invalid("sede") && errorId("sede"))}
              aria-invalid={ariaInvalid("sede")}
              className={`${selectBase} ${borderFor(invalid("sede"))}`}
              defaultValue={unaSede ? cliente.sedes[0]!.id : ""}
              id="aviso-sedeId"
              name="sedeId"
              required
            >
              {unaSede ? null : (
                <option disabled value="">
                  Elige una sede
                </option>
              )}
              {cliente.sedes.map((sede) => (
                <option key={sede.id} value={sede.id}>
                  {`${sede.nombre} · ${sede.direccion.replace(/\s+/g, " ")}`}
                </option>
              ))}
            </select>
            <FieldError id={errorId("sede")} message={fieldMessage("sede")} />
          </div>

          <div className="flex flex-col gap-2">
            <label className={labelClass} htmlFor="aviso-contactoId">
              Contacto
            </label>
            <select
              aria-describedby={describedBy(
                "aviso-contacto-ayuda",
                invalid("contacto") && errorId("contacto"),
              )}
              aria-invalid={ariaInvalid("contacto")}
              className={`${selectBase} ${borderFor(invalid("contacto"))}`}
              defaultValue=""
              id="aviso-contactoId"
              name="contactoId"
              required
            >
              <option disabled value="">
                Elige un contacto
              </option>
              {cliente.contactos.map((contacto) => (
                <option key={contacto.id} value={contacto.id}>
                  {`${contacto.nombre} · ${
                    contacto.sedeId
                      ? `Sede ${sedesPorId.get(contacto.sedeId) ?? ""}`
                      : "Todo el cliente"
                  }`}
                </option>
              ))}
            </select>
            <p className={helpClass} id="aviso-contacto-ayuda">
              Elige un contacto de todo el cliente o de la sede elegida.
            </p>
            <FieldError id={errorId("contacto")} message={fieldMessage("contacto")} />
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <label className={labelClass} htmlFor="aviso-descripcion">
              Descripción de la avería
            </label>
            <textarea
              aria-describedby={describedBy(
                "aviso-descripcion-ayuda",
                invalid("descripcion") && errorId("descripcion"),
              )}
              aria-invalid={ariaInvalid("descripcion")}
              className={`${textareaBase} ${borderFor(invalid("descripcion"))}`}
              id="aviso-descripcion"
              maxLength={DESCRIPCION_MAX_LENGTH}
              name="descripcion"
              required
            />
            <p className={helpClass} id="aviso-descripcion-ayuda">
              Qué ocurre, dónde y desde cuándo. Máximo {DESCRIPCION_MAX_LENGTH} caracteres.
            </p>
            <FieldError id={errorId("descripcion")} message={fieldMessage("descripcion")} />
          </div>

          <fieldset className="sm:col-span-2">
            <legend className={legendClass} id="aviso-prioridad-legend">
              Prioridad
            </legend>
            <div
              aria-describedby={describedBy(invalid("prioridad") && errorId("prioridad"))}
              aria-invalid={ariaInvalid("prioridad")}
              aria-labelledby="aviso-prioridad-legend"
              className="mt-1 flex flex-col gap-1 sm:flex-row sm:gap-6"
              role="radiogroup"
            >
              {PRIORIDADES.map((prioridad) => (
                <label
                  className="flex min-h-12 items-center gap-3 text-base text-text"
                  key={prioridad}
                >
                  <input
                    className={radioClass}
                    defaultChecked={prioridad === "NORMAL"}
                    name="prioridad"
                    required
                    type="radio"
                    value={prioridad}
                  />
                  {PRIORIDAD_LABELS[prioridad]}
                </label>
              ))}
            </div>
            <FieldError id={errorId("prioridad")} message={fieldMessage("prioridad")} />
          </fieldset>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button className={buttonPrimaryClass} type="submit">
            Crear aviso
          </button>
          <Link className={buttonSecondaryClass} href="/panel/avisos">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
