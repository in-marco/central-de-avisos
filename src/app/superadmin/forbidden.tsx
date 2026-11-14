import Link from "next/link";

export default function SuperadminForbidden() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-text">
      <section className="w-full max-w-lg rounded-lg border border-border bg-surface p-6 sm:p-10">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
          Acceso restringido
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
          403 · No autorizado
        </h1>
        <p className="mt-3 text-base leading-7 text-muted">
          Esta superficie está reservada al proveedor SaaS. Tu cuenta no tiene
          acceso al panel de superadmin.
        </p>
        <Link
          className="mt-6 inline-flex h-12 items-center justify-center rounded-md bg-primary px-5 text-base font-medium text-white transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11"
          href="/panel"
        >
          Volver a mi panel
        </Link>
      </section>
    </main>
  );
}
