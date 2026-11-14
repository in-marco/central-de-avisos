import Link from "next/link";

/**
 * 404 del detalle de cliente. Se muestra igual para un id inexistente, uno que
 * no es un UUID o uno de otra empresa, y no incluye ningún dato del recurso.
 */
export default function ClienteNotFound() {
  return (
    <section className="mx-auto w-full max-w-lg rounded-lg border border-border bg-surface p-6 sm:p-10">
      <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
        Clientes
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
        404 · Cliente no encontrado
      </h1>
      <p className="mt-3 text-base leading-7 text-muted">
        Este cliente no existe o no pertenece a tu empresa. Revisa el enlace o
        vuelve al listado.
      </p>
      <Link
        className="mt-6 inline-flex h-12 items-center justify-center rounded-md bg-primary px-5 text-base font-medium text-white transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11"
        href="/panel/clientes"
      >
        Volver a clientes
      </Link>
    </section>
  );
}
