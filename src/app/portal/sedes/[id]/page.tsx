import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { getDb } from "@/db/client";
import { requirePortalSession } from "@/lib/portal/guards";
import { getPortalSede } from "@/lib/portal/portal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sede · Portal de cliente · Central de avisos",
  robots: { index: false, follow: false },
};

export default async function PortalSedePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session, scope } = await requirePortalSession(
    `/portal/sedes/${encodeURIComponent(id)}`,
  );
  // 403 uniforme: una sede de otro cliente, de otra empresa, inexistente o con
  // un id mal formado reciben el mismo `forbidden()` sin datos (excepción
  // nombrada en CONSTRAINTS.md, limitada a /portal).
  const sede = await getPortalSede(getDb(), scope, id);

  if (!sede) {
    forbidden();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
          Sede
        </p>
        <h1 className="mt-2 break-words text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
          {sede.nombre}
        </h1>
        <p className="mt-2 break-words text-base leading-7 text-muted">
          {session.cliente?.razonSocial}
        </p>
      </div>

      <section
        aria-labelledby="titulo-sede"
        className="rounded-lg border border-border bg-surface p-5 sm:p-8"
      >
        <h2 className="text-lg font-semibold text-primary" id="titulo-sede">
          Datos de la sede
        </h2>
        <dl className="mt-4 grid gap-4 text-sm">
          <div>
            <dt className="font-medium text-muted">Nombre</dt>
            <dd className="mt-1 break-words text-base text-text">{sede.nombre}</dd>
          </div>
          <div>
            <dt className="font-medium text-muted">Dirección</dt>
            <dd className="mt-1 whitespace-pre-line break-words text-base text-text">
              {sede.direccion}
            </dd>
          </div>
        </dl>
      </section>

      <Link
        className="inline-flex h-12 w-full items-center justify-center rounded-md border border-border bg-surface px-5 text-sm font-medium text-primary transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11 sm:w-auto sm:self-start"
        href="/portal"
      >
        Volver al portal
      </Link>
    </div>
  );
}
