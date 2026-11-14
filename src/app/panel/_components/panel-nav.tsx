"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavItemActive, type NavItem } from "@/lib/authz/navigation";

/**
 * Navegación del panel. Recibe del servidor las entradas ya filtradas por
 * permisos (`visibleNavItems`); aquí solo se marca la activa. Ocultar una
 * entrada no protege nada: cada ruta tiene su guard de servidor.
 */
export function PanelNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Secciones" className="border-b border-border bg-surface">
      <ul className="mx-auto flex max-w-5xl flex-wrap gap-x-2 gap-y-1 px-4 py-1 sm:px-8">
        {items.map((item) => {
          const active = isNavItemActive(item, pathname);

          return (
            <li key={item.href}>
              <Link
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-12 items-center rounded-sm border-b-2 px-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted hover:text-primary"
                }`}
                href={item.href}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
