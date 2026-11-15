import { can, type AuthzSubject, type Permiso } from "./permissions";

/**
 * Navegación del panel derivada de permisos. Ocultar una entrada es solo
 * comodidad: la frontera de seguridad es el guard de servidor de cada ruta.
 *
 * - `permiso`: visible si `can(session, permiso)`.
 * - `"superadmin"`: visible solo para el superadmin (es_superadmin y
 *   empresa_id nulo).
 * - `null`: visible para cualquier sesión.
 *
 * Las features futuras añaden aquí sus entradas junto con su guard.
 */
export type NavRequirement = Permiso | "superadmin" | null;

export type NavItem = {
  href: string;
  label: string;
  requiere: NavRequirement;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/panel", label: "Inicio", requiere: null },
  { href: "/panel/avisos", label: "Avisos", requiere: "avisos.crear" },
  { href: "/panel/clientes", label: "Clientes", requiere: "clientes.gestionar" },
  { href: "/panel/usuarios", label: "Usuarios", requiere: "usuarios.gestionar" },
  { href: "/panel/empresa", label: "Empresa", requiere: "empresa.configurar" },
  { href: "/superadmin", label: "Panel de proveedor", requiere: "superadmin" },
];

function isSuperadminSubject(session: AuthzSubject): boolean {
  return session.esSuperadmin && session.empresa === null;
}

export function visibleNavItems(
  session: AuthzSubject | null | undefined,
  items: readonly NavItem[] = NAV_ITEMS,
): NavItem[] {
  // El usuario de cliente no usa la navegación del panel: su superficie es
  // /portal (y /panel le redirige allí).
  if (!session || session.cliente) {
    return [];
  }

  return items.filter((item) => {
    if (item.requiere === null) {
      return true;
    }

    if (item.requiere === "superadmin") {
      return isSuperadminSubject(session);
    }

    return can(session, item.requiere);
  });
}

/** Indica si una entrada corresponde a la ruta actual (para `aria-current`). */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/panel") {
    return pathname === "/panel";
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
