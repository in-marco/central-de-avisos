import Link from "next/link";
import type { ReactNode } from "react";
import { getCurrentSession } from "@/lib/auth/current-session";
import { visibleNavItems } from "@/lib/authz/navigation";
import { PanelNav } from "./_components/panel-nav";

export const dynamic = "force-dynamic";

/**
 * Cabecera y navegación del panel. El layout NO es la frontera de seguridad:
 * Next renderiza la página aunque el layout no lo haga, así que cada página de
 * `/panel` llama a `requireSession` o `requirePermission` (lo comprueba
 * `src/lib/authz/panel-guards.test.ts`).
 *
 * Sin sesión, el layout no muestra nada propio y deja que la página redirija
 * al login con su propio `next` (p. ej. `/login?next=%2Fpanel%2Fusuarios`).
 * Tampoco lanza `forbidden()`: no lo capturaría `src/app/panel/forbidden.tsx`,
 * que queda por debajo de este layout.
 */
export default async function PanelLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const session = await getCurrentSession();

  if (!session) {
    return <>{children}</>;
  }

  const ambito =
    session.cliente?.razonSocial ?? session.empresa?.nombre ?? "Proveedor SaaS";

  return (
    <div className="min-h-screen bg-background text-text">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Link
            className="inline-flex min-h-12 w-fit items-center rounded-sm text-base font-semibold tracking-tight text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-0"
            href="/panel"
          >
            Central de avisos
          </Link>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <div className="min-w-0 text-sm leading-6">
              <p className="truncate font-medium text-text">{session.nombre}</p>
              <p className="truncate text-muted">
                {session.email} · {ambito}
              </p>
            </div>
            <form action="/api/auth/logout" method="post">
              <button
                className="h-12 w-full rounded-md border border-border bg-surface px-4 text-sm font-medium text-primary transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11 sm:w-auto"
                type="submit"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      </header>

      <PanelNav items={visibleNavItems(session)} />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
        {children}
      </main>
    </div>
  );
}
