import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/authz/guards";
import { getCompanyBillingSettings } from "@/lib/empresa/configuracion";
import {
  formatTarifaInput,
  SERIE_FACTURA_MAX_LENGTH,
} from "@/lib/empresa/configuracion-validation";
import {
  ADDRESS_MAX_LENGTH,
  COMPANY_NAME_MAX_LENGTH,
} from "@/lib/superadmin/validation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Empresa · Central de avisos",
};

type FieldName =
  | "nombre"
  | "nif"
  | "direccionFiscal"
  | "emailFacturacion"
  | "serieFactura"
  | "tarifaHoraria"
  | "modoFiscal";

type ErrorInfo = {
  summary: string;
  /** Campos marcados con `aria-invalid` y su mensaje inline. */
  fields: Partial<Record<FieldName, string>>;
};

const ERRORS: Record<string, ErrorInfo> = {
  campos: {
    summary:
      "Revisa la razón social y la dirección fiscal: son obligatorias y tienen un límite de longitud.",
    fields: {
      nombre: `Obligatoria, hasta ${COMPANY_NAME_MAX_LENGTH} caracteres.`,
      direccionFiscal: `Obligatoria, hasta ${ADDRESS_MAX_LENGTH} caracteres.`,
    },
  },
  nif: {
    summary: "El NIF no tiene un formato válido. No se guardaron los cambios.",
    fields: {
      nif: "Escribe un NIF, NIE o CIF español, por ejemplo B12345678.",
    },
  },
  email: {
    summary: "El email de facturación no es válido. No se guardaron los cambios.",
    fields: {
      emailFacturacion: "Escribe un email completo, por ejemplo facturas@empresa.es.",
    },
  },
  serie: {
    summary: "La serie de factura no es válida. No se guardaron los cambios.",
    fields: {
      serieFactura:
        "Obligatoria, hasta 10 caracteres: letras sin tilde, números y guion, sin empezar por guion.",
    },
  },
  tarifa: {
    summary: "La tarifa horaria no es válida. No se guardaron los cambios.",
    fields: {
      tarifaHoraria:
        "Escribe un importe mayor que 0 y hasta 9999,99, con dos decimales como máximo.",
    },
  },
  modo: {
    summary:
      "Esta versión solo admite el modo NO-VERIFACTU. No se guardaron los cambios.",
    fields: {
      modoFiscal: "Selecciona NO-VERIFACTU.",
    },
  },
  "nif-duplicado": {
    summary: "Ese NIF ya está registrado en la plataforma.",
    fields: {},
  },
  servicio: {
    summary:
      "No se pudo guardar la configuración. Inténtalo de nuevo en unos minutos.",
    fields: {},
  },
};

const OK_MESSAGES: Record<string, string> = {
  guardado: "Configuración guardada.",
};

type SearchParams = Promise<{
  [key: string]: string | string[] | undefined;
}>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const cardClass = "rounded-lg border border-border bg-surface p-5 sm:p-8";
const legendClass = "text-lg font-semibold text-primary";
const labelClass = "text-sm font-medium text-text";
const helpClass = "text-xs leading-5 text-muted";
const fieldErrorClass = "text-sm leading-5 text-danger";

const inputBaseClass =
  "h-12 w-full rounded-md border bg-surface px-3 text-base text-text transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11";
const textareaBaseClass =
  "min-h-28 w-full rounded-md border bg-surface px-3 py-2 text-base text-text transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const radioClass =
  "h-5 w-5 shrink-0 border-border text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";
const buttonPrimaryClass =
  "inline-flex h-12 w-full items-center justify-center rounded-md bg-primary px-5 text-base font-medium text-white transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11 sm:w-auto";

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

export default async function EmpresaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requirePermission("empresa.configurar", "/panel/empresa");
  // `requirePermission` garantiza una sesión de empresa con permiso.
  const settings = await getCompanyBillingSettings(getDb(), session.empresa!.id);

  if (!settings) {
    notFound();
  }

  const query = await searchParams;
  const errorCode = firstValue(query.error);
  const okCode = firstValue(query.ok);
  const error = errorCode ? ERRORS[errorCode] : undefined;
  const okMessage = okCode ? OK_MESSAGES[okCode] : undefined;
  const fieldErrors = error?.fields ?? {};
  const pendiente = settings.serieFactura === null || settings.tarifaHoraria === null;

  const invalid = (field: FieldName) => fieldErrors[field] !== undefined;
  const errorId = (field: FieldName) => `${field}-error`;
  const ariaInvalid = (field: FieldName) => (invalid(field) ? true : undefined);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
          Configuración
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
          Empresa
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-7 text-muted">
          Datos fiscales, serie de factura, modo fiscal y tarifa horaria por
          defecto de {session.empresa!.nombre}. Las facturas de trabajos usarán
          estos valores.
        </p>
      </div>

      {okMessage ? (
        <div
          className="rounded-md border border-success/40 bg-success/5 px-4 py-3 text-sm leading-6 text-success"
          role="status"
        >
          {okMessage}
        </div>
      ) : null}

      {error ? (
        <div
          className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm leading-6 text-danger"
          role="alert"
        >
          {error.summary}
        </div>
      ) : null}

      {pendiente ? (
        <div
          className="rounded-md border border-warning/40 bg-warning/5 px-4 py-3 text-sm leading-6 text-text"
          role="status"
        >
          <span className="font-semibold">Pendiente de configurar.</span> Falta
          la serie de factura o la tarifa horaria; sin ellas no se podrá
          facturar.
        </div>
      ) : null}

      <form
        action="/api/panel/empresa"
        className="flex flex-col gap-6"
        method="post"
      >
        <fieldset className={cardClass}>
          <legend className={`${legendClass} float-left w-full`}>
            Datos fiscales
          </legend>
          <div className="clear-both grid gap-5 pt-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2 sm:col-span-2">
              <label className={labelClass} htmlFor="nombre">
                Razón social
              </label>
              <input
                aria-describedby={describedBy(invalid("nombre") && errorId("nombre"))}
                aria-invalid={ariaInvalid("nombre")}
                autoComplete="organization"
                className={`${inputBaseClass} ${borderFor(invalid("nombre"))}`}
                defaultValue={settings.nombre}
                id="nombre"
                maxLength={COMPANY_NAME_MAX_LENGTH}
                name="nombre"
                required
                type="text"
              />
              <FieldError id={errorId("nombre")} message={fieldErrors.nombre} />
            </div>

            <div className="flex flex-col gap-2">
              <label className={labelClass} htmlFor="nif">
                NIF
              </label>
              <input
                aria-describedby={describedBy(
                  "nif-ayuda",
                  invalid("nif") && errorId("nif"),
                )}
                aria-invalid={ariaInvalid("nif")}
                autoCapitalize="characters"
                autoComplete="off"
                className={`${inputBaseClass} ${borderFor(invalid("nif"))} font-mono uppercase`}
                defaultValue={settings.nif}
                id="nif"
                maxLength={20}
                name="nif"
                required
                spellCheck={false}
                type="text"
              />
              <p className={helpClass} id="nif-ayuda">
                NIF, NIE o CIF. Se guarda en mayúsculas y sin espacios.
              </p>
              <FieldError id={errorId("nif")} message={fieldErrors.nif} />
            </div>

            <div className="flex flex-col gap-2">
              <label className={labelClass} htmlFor="emailFacturacion">
                Email de facturación
              </label>
              <input
                aria-describedby={describedBy(
                  invalid("emailFacturacion") && errorId("emailFacturacion"),
                )}
                aria-invalid={ariaInvalid("emailFacturacion")}
                autoComplete="email"
                className={`${inputBaseClass} ${borderFor(invalid("emailFacturacion"))}`}
                defaultValue={settings.emailFacturacion}
                id="emailFacturacion"
                maxLength={254}
                name="emailFacturacion"
                required
                type="email"
              />
              <FieldError
                id={errorId("emailFacturacion")}
                message={fieldErrors.emailFacturacion}
              />
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <label className={labelClass} htmlFor="direccionFiscal">
                Dirección fiscal
              </label>
              <textarea
                aria-describedby={describedBy(
                  invalid("direccionFiscal") && errorId("direccionFiscal"),
                )}
                aria-invalid={ariaInvalid("direccionFiscal")}
                autoComplete="street-address"
                className={`${textareaBaseClass} ${borderFor(invalid("direccionFiscal"))}`}
                defaultValue={settings.direccionFiscal ?? ""}
                id="direccionFiscal"
                maxLength={ADDRESS_MAX_LENGTH}
                name="direccionFiscal"
                required
              />
              <FieldError
                id={errorId("direccionFiscal")}
                message={fieldErrors.direccionFiscal}
              />
            </div>
          </div>
        </fieldset>

        <fieldset className={cardClass}>
          <legend className={`${legendClass} float-left w-full`}>Facturación</legend>
          <div className="clear-both grid gap-5 pt-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className={labelClass} htmlFor="serieFactura">
                Serie de factura
              </label>
              <input
                aria-describedby={describedBy(
                  "serieFactura-ayuda",
                  invalid("serieFactura") && errorId("serieFactura"),
                )}
                aria-invalid={ariaInvalid("serieFactura")}
                autoCapitalize="characters"
                autoComplete="off"
                className={`${inputBaseClass} ${borderFor(invalid("serieFactura"))} font-mono uppercase tabular-nums`}
                defaultValue={settings.serieFactura ?? ""}
                id="serieFactura"
                maxLength={SERIE_FACTURA_MAX_LENGTH}
                name="serieFactura"
                required
                spellCheck={false}
                type="text"
              />
              <p className={helpClass} id="serieFactura-ayuda">
                Hasta 10 caracteres: letras, números y guion.
              </p>
              <FieldError
                id={errorId("serieFactura")}
                message={fieldErrors.serieFactura}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className={labelClass} htmlFor="tarifaHoraria">
                Tarifa horaria por defecto
              </label>
              <div className="relative">
                <input
                  aria-describedby={describedBy(
                    "tarifaHoraria-ayuda",
                    invalid("tarifaHoraria") && errorId("tarifaHoraria"),
                  )}
                  aria-invalid={ariaInvalid("tarifaHoraria")}
                  autoComplete="off"
                  className={`${inputBaseClass} ${borderFor(invalid("tarifaHoraria"))} pr-14 text-right font-mono tabular-nums`}
                  defaultValue={formatTarifaInput(settings.tarifaHoraria)}
                  id="tarifaHoraria"
                  inputMode="decimal"
                  maxLength={10}
                  name="tarifaHoraria"
                  required
                  type="text"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted"
                >
                  €/h
                </span>
              </div>
              <p className={helpClass} id="tarifaHoraria-ayuda">
                En euros por hora, sin IVA. Ejemplo: 42,50.
              </p>
              <FieldError
                id={errorId("tarifaHoraria")}
                message={fieldErrors.tarifaHoraria}
              />
            </div>
          </div>
        </fieldset>

        <fieldset className={cardClass}>
          <legend className={`${legendClass} float-left w-full`} id="modoFiscal-legend">
            Modo fiscal
          </legend>
          <div
            aria-describedby={describedBy(
              "modoFiscal-ayuda",
              invalid("modoFiscal") && errorId("modoFiscal"),
            )}
            aria-invalid={ariaInvalid("modoFiscal")}
            aria-labelledby="modoFiscal-legend"
            className="clear-both flex flex-col gap-1 pt-4"
            role="radiogroup"
          >
            <label className="flex min-h-12 items-center gap-3 text-sm text-text">
              <input
                className={radioClass}
                defaultChecked={settings.modoFiscal === "NO_VERIFACTU"}
                name="modoFiscal"
                required
                type="radio"
                value="NO_VERIFACTU"
              />
              NO-VERIFACTU (registro firmado)
            </label>
            <label className="flex min-h-12 items-center gap-3 text-sm text-muted">
              <input
                className={radioClass}
                disabled
                name="modoFiscal"
                type="radio"
                value="VERIFACTU"
              />
              VERIFACTU · No disponible en esta versión
            </label>
            <p className={helpClass} id="modoFiscal-ayuda">
              Las facturas se emiten con registro firmado y sin envío a la
              Agencia Tributaria. VERIFACTU llegará en una versión posterior.
            </p>
            <FieldError id={errorId("modoFiscal")} message={fieldErrors.modoFiscal} />
          </div>
        </fieldset>

        <div>
          <button className={buttonPrimaryClass} type="submit">
            Guardar configuración
          </button>
        </div>
      </form>
    </div>
  );
}
