import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/authz/guards";
import {
  buttonPrimaryClass,
  buttonSecondaryClass,
  cardClass,
  ErrorNotice,
  firstValue,
  PageHeader,
} from "../../_components/ui";
import {
  ClienteFields,
  ContactoFields,
  SedeFields,
} from "../_components/campos";
import { CLIENTE_ERROR_MESSAGES } from "../_components/mensajes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nuevo cliente · Central de avisos",
};

type SearchParams = Promise<{
  [key: string]: string | string[] | undefined;
}>;

export default async function NuevoClientePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requirePermission("clientes.gestionar", "/panel/clientes/nuevo");

  const query = await searchParams;
  const errorCode = firstValue(query.error);
  const errorMessage = errorCode ? CLIENTE_ERROR_MESSAGES[errorCode] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <Link className={buttonSecondaryClass} href="/panel/clientes">
            Volver al listado
          </Link>
        }
        description="El alta guarda los datos de facturación, la primera sede y el primer contacto a la vez. Después podrás añadir más sedes y contactos."
        eyebrow="Clientes"
        title="Nuevo cliente"
      />

      <ErrorNotice message={errorMessage} />

      <form action="/api/panel/clientes" className="flex flex-col gap-6" method="post">
        <section aria-labelledby="titulo-facturacion" className={cardClass}>
          <h2 className="text-lg font-semibold text-primary" id="titulo-facturacion">
            Datos de facturación
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Las facturas se emiten a este cliente, no a la sede.
          </p>
          <ClienteFields idPrefix="nuevo" />
        </section>

        <section aria-labelledby="titulo-sede" className={cardClass}>
          <h2 className="text-lg font-semibold text-primary" id="titulo-sede">
            Primera sede
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Lugar donde se hacen las intervenciones. No lleva datos fiscales.
          </p>
          <SedeFields idPrefix="nuevo-sede" namePrefix="sede" />
        </section>

        <section aria-labelledby="titulo-contacto" className={cardClass}>
          <h2 className="text-lg font-semibold text-primary" id="titulo-contacto">
            Primer contacto
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Indica al menos un teléfono o un email.
          </p>
          <ContactoFields
            enPrimeraSede
            idPrefix="nuevo-contacto"
            namePrefix="contacto"
          />
        </section>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button className={buttonPrimaryClass} type="submit">
            Crear cliente
          </button>
          <Link className={buttonSecondaryClass} href="/panel/clientes">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
