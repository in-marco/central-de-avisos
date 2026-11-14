import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16 text-text">
      <section className="w-full max-w-xl rounded-lg border border-border bg-surface p-10">
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-primary">
          Herramienta operativa
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-primary sm:text-4xl">
          Central de avisos
        </h1>
        <p className="mt-4 max-w-md text-base leading-7 text-muted">
          Base técnica de la central de avisos para empresas de servicios con
          técnicos de campo.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-white transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11"
            href="/login"
          >
            Iniciar sesión
          </Link>
          <Link
            className="inline-flex h-12 items-center justify-center rounded-md border border-border px-5 text-sm font-medium text-primary transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11"
            href="/health"
          >
            Ver estado del servicio
          </Link>
        </div>
      </section>
    </main>
  );
}
