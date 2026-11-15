import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getCurrentSession } from "@/lib/auth/current-session";
import { isPortalSession } from "@/lib/portal/scope";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Portal de cliente · Central de avisos",
  robots: { index: false, follow: false },
};

/**
 * Shell del portal de cliente: más simple que el panel (sin navegación de
 * oficina), mobile-first. El layout NO es la frontera de seguridad: no
 * redirige ni deniega. Cada página llama a `requirePortalSession` (lo
 * comprueba `src/lib/portal/portal-guards.test.ts`) y el 403 lo pinta
 * `src/app/portal/forbidden.tsx`, por debajo de este layout.
 *
 * Solo una sesión de cliente ve su nombre y su cliente en la cabecera; a otras
 * sesiones (empresa o superadmin, que reciben 403) no se les muestra nada
 * propio del portal.
 */
export default async function PortalLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const session = await getCurrentSession();

  if (!session) {
    return <>{children}</>;
  }

  const portal = isPortalSession(session) ? session : null;

  return (
    <div className="min-h-screen bg-background text-text">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="min-w-0">
            <Link
              className="inline-flex min-h-12 w-fit items-center rounded-sm text-base font-semibold tracking-tight text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-0"
              href="/portal"
            >
              Central de avisos
            </Link>
            <p className="text-sm text-muted">Portal de cliente</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            {portal ? (
              <div className="min-w-0 text-sm leading-6">
                <p className="truncate font-medium text-text">{portal.nombre}</p>
                <p className="truncate text-muted">
                  {portal.email} · {portal.cliente.razonSocial}
                </p>
              </div>
            ) : null}
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

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-8 sm:py-12">
        {children}
      </main>
    </div>
  );
}
