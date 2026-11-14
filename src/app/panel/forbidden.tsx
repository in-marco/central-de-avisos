import Link from "next/link";

/**
 * Boundary 403 del panel. Captura los `forbidden()` que lanzan
 * `requirePermission` en las páginas hijas de `/panel`. Se renderiza dentro
 * de `src/app/panel/layout.tsx`, así que la cabecera y la navegación siguen
 * visibles. Un `forbidden()` en el propio layout no llegaría aquí.
 */
export default function PanelForbidden() {
  return (
    <section className="mx-auto w-full max-w-lg rounded-lg border border-border bg-surface p-6 sm:p-10">
      <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
        Acceso restringido
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
        403 · No autorizado
      </h1>
      <p className="mt-3 text-base leading-7 text-muted">
        Tu rol no permite acceder a esta sección. Si crees que lo necesitas,
        pide a un administrador de tu empresa que revise tus roles.
      </p>
      <Link
        className="mt-6 inline-flex h-12 items-center justify-center rounded-md bg-primary px-5 text-base font-medium text-white transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11"
        href="/panel"
      >
        Volver a mi panel
      </Link>
    </section>
  );
}
