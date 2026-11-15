import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { getDb } from "@/db/client";
import { requirePortalSession } from "@/lib/portal/guards";
import { getPortalCliente } from "@/lib/portal/portal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Portal de cliente · Central de avisos",
  robots: { index: false, follow: false },
};

const labelClass = "font-medium text-muted";
const valueClass = "mt-1 break-words text-base text-text";

export default async function PortalPage() {
  const { session, scope } = await requirePortalSession("/portal");
  const cliente = await getPortalCliente(getDb(), scope);

  if (!cliente) {
    forbidden();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
          Portal de cliente
        </p>
        <h1 className="mt-2 break-words text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
          Hola, {session.nombre}
        </h1>
        <p className="mt-2 text-base leading-7 text-muted">
          Estos son los datos de {cliente.razonSocial} y sus sedes en{" "}
          {session.empresa?.nombre}.
        </p>
      </div>

      <section
        aria-labelledby="titulo-cliente"
        className="rounded-lg border border-border bg-surface p-5 sm:p-8"
      >
        <h2 className="text-lg font-semibold text-primary" id="titulo-cliente">
          Tu empresa
        </h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className={labelClass}>Razón social</dt>
            <dd className={valueClass}>{cliente.razonSocial}</dd>
          </div>
          <div>
            <dt className={labelClass}>NIF</dt>
            <dd className={`${valueClass} font-mono`}>{cliente.nif}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className={labelClass}>Dirección de facturación</dt>
            <dd className={`${valueClass} whitespace-pre-line`}>
              {cliente.direccionFacturacion}
            </dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="titulo-sedes"
        className="rounded-lg border border-border bg-surface p-5 sm:p-8"
      >
        <h2 className="text-lg font-semibold text-primary" id="titulo-sedes">
          Tus sedes ({cliente.sedes.length})
        </h2>
        {cliente.sedes.length === 0 ? (
          <p className="mt-3 text-sm leading-6 text-muted">
            Todavía no hay sedes registradas.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {cliente.sedes.map((sede) => (
              <li key={sede.id}>
                <Link
                  className="flex min-h-12 flex-col justify-center rounded-md border border-border bg-background px-4 py-3 transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  href={`/portal/sedes/${sede.id}`}
                >
                  <span className="break-words text-base font-medium text-primary">
                    {sede.nombre}
                  </span>
                  <span className="mt-1 break-words text-sm text-muted">
                    {sede.direccion}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
