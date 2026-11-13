/**
 * Contrato de aislamiento multiempresa.
 *
 * Toda consulta a una tabla de tenant debe construirse con `tenantFilter` o
 * validar el contexto con `requireEmpresaId`. No se permite consultar una
 * tabla operable sin `empresa_id` salvo para el superadmin, que no usa estas
 * funciones. RLS queda diferida; ver CONSTRAINTS.md.
 */

export class TenantContextError extends Error {
  constructor(message = "Falta el contexto de empresa (empresa_id).") {
    super(message);
    this.name = "TenantContextError";
  }
}

export class TenantAccessError extends Error {
  constructor(message = "El recurso pertenece a otra empresa.") {
    super(message);
    this.name = "TenantAccessError";
  }
}

export type TenantFilter = {
  empresaId: string;
};

/**
 * Exige un `empresa_id` no vacío. Lanza antes de llegar a la base de datos.
 */
export function requireEmpresaId(
  value: string | null | undefined,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TenantContextError();
  }

  return value.trim();
}

/**
 * Filtro Prisma obligatorio para tablas de tenant.
 */
export function tenantFilter(
  empresaId: string | null | undefined,
): TenantFilter {
  return { empresaId: requireEmpresaId(empresaId) };
}

/**
 * Comprueba que un recurso cargado pertenece a la empresa del contexto.
 */
export function assertTenantAccess(
  recursoEmpresaId: string | null | undefined,
  contextoEmpresaId: string | null | undefined,
): void {
  const contexto = requireEmpresaId(contextoEmpresaId);

  if (recursoEmpresaId !== contexto) {
    throw new TenantAccessError();
  }
}
