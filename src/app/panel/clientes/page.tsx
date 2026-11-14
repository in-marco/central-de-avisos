import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/authz/guards";
import { listClientes } from "@/lib/clientes/clientes";
import {
  buttonPrimaryClass,
  ErrorNotice,
  firstValue,
  PageHeader,
} from "../_components/ui";
import { CLIENTE_ERROR_MESSAGES, pluralize } from "./_components/mensajes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Clientes · Central de avisos",
};

type SearchParams = Promise<{
  [key: string]: string | string[] | undefined;
}>;

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requirePermission("clientes.gestionar", "/panel/clientes");
  // `requirePermission` garantiza una sesión de empresa con permiso.
  const clientes = await listClientes(getDb(), session.empresa!.id);

  const query = await searchParams;
  const errorCode = firstValue(query.error);
  const errorMessage = errorCode ? CLIENTE_ERROR_MESSAGES[errorCode] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <Link className={buttonPrimaryClass} href="/panel/clientes/nuevo">
            Nuevo cliente
          </Link>
        }
        description={`Clientes de ${session.empresa!.nombre} con sus datos de facturación, sedes y contactos.`}
        eyebrow="Oficina"
        title="Clientes"
      />

      <ErrorNotice message={errorMessage} />

      {clientes.length === 0 ? (
        <section className="rounded-lg border border-border bg-surface p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-primary">
            Todavía no hay clientes
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Da de alta el primer cliente con sus datos de facturación, una sede
            y una persona de contacto.
          </p>
        </section>
      ) : (
        <ul aria-label="Listado de clientes" className="flex flex-col gap-3">
          {clientes.map((cliente) => (
            <li key={cliente.id}>
              <Link
                className="flex min-h-12 flex-col gap-1 rounded-lg border border-border bg-surface px-5 py-4 transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                href={`/panel/clientes/${cliente.id}`}
              >
                <span className="min-w-0">
                  <span className="block break-words text-base font-semibold text-primary">
                    {cliente.razonSocial}
                  </span>
                  <span className="block font-mono text-sm text-muted">
                    {cliente.nif}
                  </span>
                </span>
                <span className="text-sm text-text sm:shrink-0">
                  {pluralize(cliente.sedes, "sede", "sedes")} ·{" "}
                  {pluralize(cliente.contactos, "contacto", "contactos")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
