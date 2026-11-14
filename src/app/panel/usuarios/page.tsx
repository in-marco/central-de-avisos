import type { Metadata } from "next";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/authz/guards";
import { formatRoles, ROLE_LABELS, ROLES } from "@/lib/authz/permissions";
import { listCompanyUsers } from "@/lib/empresa/usuarios";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Usuarios · Central de avisos",
};

const ERROR_MESSAGES: Record<string, string> = {
  "sin-roles": "Selecciona al menos un rol para el usuario.",
  "rol-invalido": "Alguno de los roles enviados no existe. Revisa la selección.",
  "propio-admin": "No puedes quitarte el rol de administrador.",
  "no-encontrado": "No se encontró ese usuario en tu empresa.",
  "ultimo-admin":
    "La empresa debe conservar al menos un administrador activo. No se guardaron los cambios.",
  servicio: "No se pudieron guardar los roles. Inténtalo de nuevo en unos minutos.",
};

const OK_MESSAGES: Record<string, string> = {
  roles: "Roles actualizados.",
};

type SearchParams = Promise<{
  [key: string]: string | string[] | undefined;
}>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const buttonSecondaryClass =
  "inline-flex h-12 w-full items-center justify-center rounded-md border border-border bg-surface px-5 text-sm font-medium text-primary transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11 sm:w-auto";

const checkboxClass =
  "h-5 w-5 rounded border-border text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requirePermission("usuarios.gestionar", "/panel/usuarios");
  // `requirePermission` garantiza una sesión de empresa con permiso.
  const empresaId = session.empresa!.id;
  const usuarios = await listCompanyUsers(getDb(), empresaId);

  const query = await searchParams;
  const errorCode = firstValue(query.error);
  const okCode = firstValue(query.ok);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;
  const okMessage = okCode ? OK_MESSAGES[okCode] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
          Equipo
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
          Usuarios
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-7 text-muted">
          Asigna los roles de cada persona de {session.empresa!.nombre}. Los
          roles se combinan y sus permisos se suman. Los cambios se aplican en
          la siguiente petición del usuario, sin cerrar su sesión.
        </p>
      </div>

      {okMessage ? (
        <div
          className="rounded-md border border-success/40 bg-success/5 px-4 py-3 text-sm leading-6 text-success"
          role="status"
        >
          {okMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div
          className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm leading-6 text-danger"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}

      <ul className="flex flex-col gap-4">
        {usuarios.map((usuario) => {
          const esPropio = usuario.id === session.id;
          const legendId = `roles-${usuario.id}`;

          return (
            <li
              className="rounded-lg border border-border bg-surface p-5 sm:p-6"
              key={usuario.id}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-text">
                    {usuario.nombre}
                    {esPropio ? (
                      <span className="ml-2 text-sm font-normal text-muted">(tú)</span>
                    ) : null}
                  </p>
                  <p className="break-all text-sm text-muted">{usuario.email}</p>
                  <p className="mt-1 text-sm text-text">
                    {usuario.roles.length > 0
                      ? formatRoles(usuario.roles)
                      : "Sin roles asignados"}
                  </p>
                </div>
                {usuario.estado === "ACTIVO" ? (
                  <span className="inline-flex w-fit items-center rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
                    Activo
                  </span>
                ) : (
                  <span className="inline-flex w-fit items-center rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning">
                    Inactivo
                  </span>
                )}
              </div>

              <form
                action="/api/panel/usuarios/roles"
                className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
                method="post"
              >
                <input name="usuarioId" type="hidden" value={usuario.id} />
                <fieldset aria-describedby={esPropio ? `${legendId}-ayuda` : undefined}>
                  <legend className="text-sm font-medium text-text" id={legendId}>
                    Roles de {usuario.nombre}
                  </legend>
                  <div className="mt-1 flex flex-col sm:flex-row sm:flex-wrap sm:gap-x-6">
                    {ROLES.map((rol) => {
                      const checked = usuario.roles.includes(rol);
                      const bloqueado = esPropio && rol === "ADMINISTRADOR";

                      return (
                        <label
                          className="flex min-h-12 items-center gap-3 text-sm text-text"
                          key={rol}
                        >
                          <input
                            className={checkboxClass}
                            defaultChecked={checked || bloqueado}
                            disabled={bloqueado}
                            name="roles"
                            type="checkbox"
                            value={rol}
                          />
                          {ROLE_LABELS[rol]}
                        </label>
                      );
                    })}
                  </div>
                  {esPropio ? (
                    <>
                      {/* El checkbox deshabilitado no se envía: se mantiene el rol con un campo oculto. */}
                      <input name="roles" type="hidden" value="ADMINISTRADOR" />
                      <p className="text-sm text-muted" id={`${legendId}-ayuda`}>
                        No puedes quitarte el rol de administrador.
                      </p>
                    </>
                  ) : null}
                </fieldset>
                <button className={buttonSecondaryClass} type="submit">
                  Guardar roles
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
