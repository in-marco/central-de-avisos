import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/authz/guards";
import { getClienteDetalle } from "@/lib/clientes/clientes";
import {
  buttonPrimaryClass,
  buttonSecondaryClass,
  cardClass,
  ErrorNotice,
  firstValue,
  OkNotice,
  PageHeader,
} from "../../_components/ui";
import {
  ClienteFields,
  ContactoFields,
  SedeFields,
} from "../_components/campos";
import {
  CLIENTE_ERROR_MESSAGES,
  CLIENTE_OK_MESSAGES,
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
  const errorMessage = errorCode ? CLIENTE_ERROR_MESSAGES[errorCode] : undefined;
  const okMessage = okCode ? CLIENTE_OK_MESSAGES[okCode] : undefined;
  const sedesPorId = new Map(cliente.sedes.map((sede) => [sede.id, sede.nombre]));

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
