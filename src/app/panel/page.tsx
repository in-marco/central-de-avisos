import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/current-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Panel · Central de avisos",
};

export default async function PanelPage() {
  const session = await requireSession("/panel");
  const ambito = session.empresa?.nombre ?? "Proveedor SaaS";
  const caducidad = new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(session.expiraEn);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
          Panel
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
          Sesión iniciada
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-7 text-muted">
          Ya puedes operar en la central de avisos. Las próximas pantallas de
          avisos, partes y facturación aparecerán en este panel.
        </p>
      </div>

      <section className="rounded-lg border border-border bg-surface p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-primary">Tu cuenta</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-muted">Nombre</dt>
            <dd className="mt-1 text-base text-text">{session.nombre}</dd>
          </div>
          <div>
            <dt className="font-medium text-muted">Email</dt>
            <dd className="mt-1 break-all text-base text-text">
              {session.email}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-muted">
              {session.empresa ? "Empresa" : "Ámbito"}
            </dt>
            <dd className="mt-1 text-base text-text">{ambito}</dd>
          </div>
          <div>
            <dt className="font-medium text-muted">Sesión válida hasta</dt>
            <dd className="mt-1 text-base text-text">{caducidad}</dd>
          </div>
        </dl>
      </section>

      {session.esSuperadmin ? (
        <section className="rounded-lg border border-border bg-surface p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-primary">
            Herramientas de proveedor
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Gestiona el catálogo de planes y da de alta empresas con su
            administrador invitado.
          </p>
          <Link
            className="mt-4 inline-flex h-12 items-center justify-center rounded-md bg-primary px-5 text-base font-medium text-white transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11"
            href="/superadmin"
          >
            Abrir panel de proveedor
          </Link>
        </section>
      ) : null}
    </div>
  );
}
