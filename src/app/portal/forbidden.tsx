import Link from "next/link";

/**
 * Boundary 403 del portal. Captura los `forbidden()` de `requirePortalSession`
 * (sesión que no es de cliente) y de una sede fuera del cliente de la sesión.
 * El texto es genérico: no revela si el recurso existe ni de quién es. El
 * enlace va a `/panel`, que lleva al usuario de cliente a `/portal` y al resto
 * a su panel.
 */
export default function PortalForbidden() {
  return (
    <section className="mx-auto w-full max-w-lg rounded-lg border border-border bg-surface p-6 sm:p-10">
      <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
        Acceso restringido
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
        403 · No autorizado
      </h1>
      <p className="mt-3 text-base leading-7 text-muted">
        No tienes acceso a esta página del portal de cliente. Solo puedes
        consultar los datos y las sedes de tu propia empresa.
      </p>
      <Link
        className="mt-6 inline-flex h-12 items-center justify-center rounded-md bg-primary px-5 text-base font-medium text-white transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11"
        href="/panel"
      >
        Volver al inicio
      </Link>
    </section>
  );
}
