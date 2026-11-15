/**
 * Contrato de alcance del portal de cliente.
 *
 * OBLIGATORIO para toda consulta del portal (sedes hoy; avisos y facturas del
 * portal en `client-aviso-creation` y `client-invoice-access`): el `where` se
 * construye con `clienteFilter(clienteScope(session))`, que fija a la vez
 * `empresaId` y `clienteId` de la sesión. Nunca se filtra por ids recibidos en
 * la petición. Las features futuras añaden su caso a
 * `src/lib/portal/portal.db.test.ts`.
 *
 * Módulo puro: no importa Prisma ni Next.
 */

/** Datos mínimos de sesión que necesita el portal. */
export type PortalSubject = {
  esSuperadmin: boolean;
  empresa: { id: string } | null;
  cliente: { id: string } | null;
};

export type ClienteScope = {
  readonly empresaId: string;
  readonly clienteId: string;
};

export class PortalScopeError extends Error {
  constructor(message = "La sesión no es de un usuario de cliente.") {
    super(message);
    this.name = "PortalScopeError";
  }
}

/** Usuario de cliente: no superadmin, con empresa y con cliente. */
export function isPortalSession(
  session: PortalSubject | null | undefined,
): session is PortalSubject & {
  empresa: { id: string };
  cliente: { id: string };
} {
  return (
    !!session &&
    !session.esSuperadmin &&
    !!session.empresa &&
    typeof session.empresa.id === "string" &&
    session.empresa.id.trim() !== "" &&
    !!session.cliente &&
    typeof session.cliente.id === "string" &&
    session.cliente.id.trim() !== ""
  );
}

/** Alcance de la sesión de portal. Lanza si la sesión no es de cliente. */
export function clienteScope(
  session: PortalSubject | null | undefined,
): ClienteScope {
  if (!isPortalSession(session)) {
    throw new PortalScopeError();
  }

  return Object.freeze({
    empresaId: session.empresa.id,
    clienteId: session.cliente.id,
  });
}

/**
 * Filtro Prisma del portal (`{ empresaId, clienteId }`). Revalida el alcance
 * para que un objeto construido a mano con valores vacíos nunca llegue a la
 * base de datos sin filtro.
 */
export function clienteFilter(scope: ClienteScope): {
  empresaId: string;
  clienteId: string;
} {
  if (
    !scope ||
    typeof scope.empresaId !== "string" ||
    scope.empresaId.trim() === "" ||
    typeof scope.clienteId !== "string" ||
    scope.clienteId.trim() === ""
  ) {
    throw new PortalScopeError("Falta el alcance de cliente (empresa y cliente).");
  }

  return { empresaId: scope.empresaId, clienteId: scope.clienteId };
}
