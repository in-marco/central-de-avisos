import {
  DIRECCION_MAX_LENGTH,
  EMAIL_INPUT_MAX_LENGTH,
  NIF_INPUT_MAX_LENGTH,
  NOMBRE_MAX_LENGTH,
  RAZON_SOCIAL_MAX_LENGTH,
  TELEFONO_MAX_LENGTH,
} from "@/lib/clientes/validation";
import {
  checkboxClass,
  helpClass,
  inputClass,
  labelClass,
  selectClass,
  textareaClass,
} from "../../_components/ui";

/**
 * Campos de los formularios de clientes. Son componentes de servidor sin
 * estado: el alta y el detalle los reutilizan con distintos prefijos de `id`
 * (únicos en la página) y de `name` (los que lee `src/lib/clientes/validation.ts`).
 */

function fieldName(prefix: string | undefined, name: string): string {
  return prefix ? `${prefix}${name.charAt(0).toUpperCase()}${name.slice(1)}` : name;
}

export function ClienteFields({
  idPrefix,
  defaults,
}: {
  idPrefix: string;
  defaults?: {
    razonSocial: string;
    nif: string;
    direccionFacturacion: string;
    tarifaHoraria: string;
  };
}) {
  return (
    <div className="mt-5 grid gap-5 sm:grid-cols-2">
      <div className="flex flex-col gap-2 sm:col-span-2">
        <label className={labelClass} htmlFor={`${idPrefix}-razonSocial`}>
          Razón social
        </label>
        <input
          autoComplete="organization"
          className={inputClass}
          defaultValue={defaults?.razonSocial}
          id={`${idPrefix}-razonSocial`}
          maxLength={RAZON_SOCIAL_MAX_LENGTH}
          name="razonSocial"
          required
          type="text"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className={labelClass} htmlFor={`${idPrefix}-nif`}>
          NIF
        </label>
        <input
          aria-describedby={`${idPrefix}-nif-ayuda`}
          autoComplete="off"
          className={`${inputClass} font-mono uppercase`}
          defaultValue={defaults?.nif}
          id={`${idPrefix}-nif`}
          maxLength={NIF_INPUT_MAX_LENGTH}
          name="nif"
          required
          type="text"
        />
        <p className={helpClass} id={`${idPrefix}-nif-ayuda`}>
          Obligatorio. Se guarda en mayúsculas y sin espacios.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className={labelClass} htmlFor={`${idPrefix}-tarifaHoraria`}>
          Tarifa horaria acordada (€/h, opcional)
        </label>
        <input
          aria-describedby={`${idPrefix}-tarifa-ayuda`}
          autoComplete="off"
          className={`${inputClass} tabular-nums`}
          defaultValue={defaults?.tarifaHoraria}
          id={`${idPrefix}-tarifaHoraria`}
          inputMode="decimal"
          maxLength={14}
          name="tarifaHoraria"
          type="text"
        />
        <p className={helpClass} id={`${idPrefix}-tarifa-ayuda`}>
          Vacía: se usará la tarifa de la empresa al facturar.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:col-span-2">
        <label className={labelClass} htmlFor={`${idPrefix}-direccionFacturacion`}>
          Dirección de facturación
        </label>
        <textarea
          className={textareaClass}
          defaultValue={defaults?.direccionFacturacion}
          id={`${idPrefix}-direccionFacturacion`}
          maxLength={DIRECCION_MAX_LENGTH}
          name="direccionFacturacion"
          required
        />
      </div>
    </div>
  );
}

export function SedeFields({
  idPrefix,
  namePrefix,
  defaults,
}: {
  idPrefix: string;
  namePrefix?: string;
  defaults?: { nombre: string; direccion: string };
}) {
  return (
    <div className="mt-5 grid gap-5 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <label className={labelClass} htmlFor={`${idPrefix}-nombre`}>
          Nombre de la sede
        </label>
        <input
          className={inputClass}
          defaultValue={defaults?.nombre}
          id={`${idPrefix}-nombre`}
          maxLength={NOMBRE_MAX_LENGTH}
          name={fieldName(namePrefix, "nombre")}
          required
          type="text"
        />
      </div>

      <div className="flex flex-col gap-2 sm:col-span-2">
        <label className={labelClass} htmlFor={`${idPrefix}-direccion`}>
          Dirección de la sede
        </label>
        <textarea
          autoComplete="street-address"
          className={textareaClass}
          defaultValue={defaults?.direccion}
          id={`${idPrefix}-direccion`}
          maxLength={DIRECCION_MAX_LENGTH}
          name={fieldName(namePrefix, "direccion")}
          required
        />
      </div>
    </div>
  );
}

export function ContactoFields({
  idPrefix,
  namePrefix,
  defaults,
  sedes,
  enPrimeraSede = false,
}: {
  idPrefix: string;
  namePrefix?: string;
  defaults?: {
    nombre: string;
    telefono: string | null;
    email: string | null;
    sedeId: string | null;
  };
  /** Sedes del cliente para el `select`; sin ellas no se muestra. */
  sedes?: ReadonlyArray<{ id: string; nombre: string }>;
  /** Alta: casilla para vincular el contacto a la primera sede. */
  enPrimeraSede?: boolean;
}) {
  return (
    <div className="mt-5 grid gap-5 sm:grid-cols-2">
      <div className="flex flex-col gap-2 sm:col-span-2">
        <label className={labelClass} htmlFor={`${idPrefix}-nombre`}>
          Nombre del contacto
        </label>
        <input
          autoComplete="off"
          className={inputClass}
          defaultValue={defaults?.nombre}
          id={`${idPrefix}-nombre`}
          maxLength={NOMBRE_MAX_LENGTH}
          name={fieldName(namePrefix, "nombre")}
          required
          type="text"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className={labelClass} htmlFor={`${idPrefix}-telefono`}>
          Teléfono
        </label>
        <input
          autoComplete="off"
          className={inputClass}
          defaultValue={defaults?.telefono ?? undefined}
          id={`${idPrefix}-telefono`}
          inputMode="tel"
          maxLength={TELEFONO_MAX_LENGTH}
          name={fieldName(namePrefix, "telefono")}
          type="tel"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className={labelClass} htmlFor={`${idPrefix}-email`}>
          Email
        </label>
        <input
          autoComplete="off"
          className={inputClass}
          defaultValue={defaults?.email ?? undefined}
          id={`${idPrefix}-email`}
          maxLength={EMAIL_INPUT_MAX_LENGTH}
          name={fieldName(namePrefix, "email")}
          type="email"
        />
      </div>

      {sedes ? (
        <div className="flex flex-col gap-2 sm:col-span-2">
          <label className={labelClass} htmlFor={`${idPrefix}-sedeId`}>
            Sede del contacto
          </label>
          <select
            className={selectClass}
            defaultValue={defaults?.sedeId ?? ""}
            id={`${idPrefix}-sedeId`}
            name={fieldName(namePrefix, "sedeId")}
          >
            <option value="">Todo el cliente</option>
            {sedes.map((sede) => (
              <option key={sede.id} value={sede.id}>
                {sede.nombre}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {enPrimeraSede ? (
        <label
          className="flex min-h-12 items-center gap-3 text-sm text-text sm:col-span-2"
          htmlFor={`${idPrefix}-enSede`}
        >
          <input
            className={checkboxClass}
            id={`${idPrefix}-enSede`}
            name={fieldName(namePrefix, "enSede")}
            type="checkbox"
            value="1"
          />
          Vincular este contacto a la primera sede (si no, es de todo el cliente)
        </label>
      ) : null}
    </div>
  );
}
