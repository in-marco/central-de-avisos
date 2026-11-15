/**
 * Matriz de permisos por rol de empresa.
 *
 * Reproduce las columnas Administrador, Oficina y Técnico de
 * `docs/user-and-access-model.md`. Si hay discrepancia, manda el documento de
 * dominio y se corrige este archivo. Módulo puro: no importa Prisma ni Next.
 *
 * Los roles son combinables y sus permisos se suman. Un usuario de empresa sin
 * roles no tiene ningún permiso. El superadmin no tiene permisos de empresa:
 * su única regla es `es_superadmin` con `empresa_id` nulo (`requireSuperadmin`).
 */

export const ROLES = ["ADMINISTRADOR", "OFICINA", "TECNICO"] as const;

export type Rol = (typeof ROLES)[number];

export const PERMISOS = [
  "panel.ver",
  "empresa.configurar",
  "usuarios.gestionar",
  "usuarios.desactivar",
  "clientes.gestionar",
  "avisos.crear",
  "avisos.validar",
  "avisos.asignar",
  "avisos.tomar",
  "partes.editar_propios",
  "partes.editar_cualquiera",
  "partes.aprobar",
  "facturas.ver",
  "facturas.emitir",
  "auditoria.ver",
] as const;

export type Permiso = (typeof PERMISOS)[number];

export const ROLE_PERMISSIONS: Readonly<Record<Rol, readonly Permiso[]>> = {
  ADMINISTRADOR: [
    "panel.ver",
    "empresa.configurar",
    "usuarios.gestionar",
    "usuarios.desactivar",
    "clientes.gestionar",
    "avisos.crear",
    "avisos.validar",
    "avisos.asignar",
    "partes.aprobar",
    "facturas.ver",
    "facturas.emitir",
    "auditoria.ver",
  ],
  OFICINA: [
    "panel.ver",
    "clientes.gestionar",
    "avisos.crear",
    "avisos.validar",
    "avisos.asignar",
    "partes.editar_cualquiera",
    "partes.aprobar",
    "facturas.ver",
    "facturas.emitir",
    "auditoria.ver",
  ],
  TECNICO: ["panel.ver", "avisos.tomar", "partes.editar_propios"],
};

export const ROLE_LABELS: Readonly<Record<Rol, string>> = {
  ADMINISTRADOR: "Administrador",
  OFICINA: "Oficina",
  TECNICO: "Técnico",
};

export function isRol(value: unknown): value is Rol {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Unión de los permisos de todos los roles indicados. */
export function permissionsFor(roles: readonly Rol[]): Set<Permiso> {
  const permisos = new Set<Permiso>();

  for (const rol of roles) {
    for (const permiso of ROLE_PERMISSIONS[rol] ?? []) {
      permisos.add(permiso);
    }
  }

  return permisos;
}

/** Datos mínimos de sesión que necesita `can`. */
export type AuthzSubject = {
  esSuperadmin: boolean;
  empresa: { id: string } | null;
  roles: readonly Rol[];
  /** Usuario de cliente (portal): nunca tiene permisos de empresa. */
  cliente?: { id: string } | null;
};

/**
 * Decide en servidor si la sesión tiene un permiso de empresa. Por defecto se
 * deniega: sin sesión, superadmin, sin empresa o usuario de cliente → `false`.
 */
export function can(
  session: AuthzSubject | null | undefined,
  permiso: Permiso,
): boolean {
  if (!session || session.esSuperadmin || !session.empresa || session.cliente) {
    return false;
  }

  return permissionsFor(session.roles).has(permiso);
}

export type NormalizeRolesResult =
  | { ok: true; roles: Rol[] }
  | { ok: false; error: "rol-invalido" };

/**
 * Valida contra el enum, deduplica y ordena en el orden canónico de `ROLES`.
 * No exige un mínimo: una lista vacía es válida aquí y la regla de "al menos
 * un rol" se aplica donde corresponde.
 */
export function normalizeRoles(input: readonly unknown[]): NormalizeRolesResult {
  const seen = new Set<Rol>();

  for (const value of input) {
    const rol = typeof value === "string" ? value.trim() : value;

    if (!isRol(rol)) {
      return { ok: false, error: "rol-invalido" };
    }

    seen.add(rol);
  }

  return { ok: true, roles: ROLES.filter((rol) => seen.has(rol)) };
}

/** Etiquetas en español unidas con « · », p. ej. «Administrador · Técnico». */
export function formatRoles(roles: readonly Rol[]): string {
  return ROLES.filter((rol) => roles.includes(rol))
    .map((rol) => ROLE_LABELS[rol])
    .join(" · ");
}
