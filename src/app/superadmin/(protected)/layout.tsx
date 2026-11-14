import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireSuperadmin } from "@/lib/superadmin/authorization";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Proveedor · Central de avisos",
};

const navLinkClass =
  "inline-flex min-h-12 items-center rounded-sm px-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-0";

export default async function SuperadminLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const session = await requireSuperadmin("/superadmin");

  return (
    <div className="min-h-screen bg-background text-text">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="min-w-0">
            <Link
              className="inline-flex min-h-12 w-fit items-center rounded-sm text-base font-semibold tracking-tight text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-0"
              href="/superadmin"
            >
              Central de avisos
            </Link>
            <p className="text-sm text-muted">Panel de proveedor</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
            <nav
              aria-label="Navegación de proveedor"
              className="flex flex-wrap items-center gap-x-4 gap-y-1"
            >
              <Link className={navLinkClass} href="/superadmin/empresas">
                Empresas
              </Link>
              <Link className={navLinkClass} href="/superadmin/planes">
                Planes
              </Link>
              <Link className={navLinkClass} href="/panel">
                Panel
              </Link>
              <form action="/api/auth/logout" method="post">
                <button
                  className="inline-flex min-h-12 items-center rounded-sm px-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-0"
                  type="submit"
                >
                  Cerrar sesión
                </button>
              </form>
            </nav>
            <p className="max-w-full truncate text-sm text-muted">
              {session.email}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
        {children}
      </main>
    </div>
  );
}
