import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/authz/guards";
import { countAvisosPorVista, listAvisos } from "@/lib/avisos/avisos";
import { parseVista, VISTA_LABELS, VISTAS, type Vista } from "@/lib/avisos/validation";
import { buttonPrimaryClass, ErrorNotice, firstValue, PageHeader } from "../_components/ui";
import { EstadoChip, PrioridadChip } from "./_components/chips";
import { avisoListadoError, formatFecha, resumenDescripcion } from "./_components/mensajes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Avisos · Central de avisos",
};

type SearchParams = Promise<{
  [key: string]: string | string[] | undefined;
}>;

const linkClass =
  "inline-flex min-h-11 items-center rounded-sm font-medium text-primary underline underline-offset-4 hover:text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const VISTA_DESCRIPCIONES: Record<Vista, (empresa: string) => string> = {
  todos: (empresa) => `Avisos de ${empresa}, del más reciente al más antiguo.`,
  "por-validar": () =>
    "Avisos nuevos pendientes de revisar, por prioridad y antigüedad (el más antiguo primero).",
  bolsa: () =>
    "Avisos validados y sin asignar, por prioridad y antigüedad (el más antiguo primero).",
  cancelados: () => "Avisos cancelados, del más reciente al más antiguo.",
};

const VISTA_VACIA: Record<Exclude<Vista, "todos">, { titulo: string; texto: string }> = {
  "por-validar": {
    titulo: "No hay avisos por validar",
    texto: "Cuando entre un aviso nuevo aparecerá aquí para que lo revises.",
  },
  bolsa: {
    titulo: "La bolsa de pendientes está vacía",
    texto: "Los avisos que valides aparecerán aquí hasta que se asignen a un técnico.",
  },
  cancelados: {
    titulo: "No hay avisos cancelados",
    texto: "Los avisos que canceles aparecerán aquí con su motivo.",
  },
};

function vistaHref(vista: Vista): string {
  return vista === "todos" ? "/panel/avisos" : `/panel/avisos?vista=${vista}`;
}

const tabBase =
  "inline-flex min-h-12 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const tabActive = "border-primary bg-primary text-white";
const tabInactive = "border-border bg-surface text-primary hover:bg-background";

export default async function AvisosPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requirePermission("avisos.crear", "/panel/avisos");
  // `requirePermission` garantiza una sesión de empresa con permiso.
  const empresaId = session.empresa!.id;
  const query = await searchParams;
  const vista = parseVista(firstValue(query.vista));
  const errorMessage = avisoListadoError(firstValue(query.error));
  const db = getDb();
  const [avisos, recuento] = await Promise.all([
    listAvisos(db, empresaId, vista),
    countAvisosPorVista(db, empresaId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <Link className={buttonPrimaryClass} href="/panel/avisos/nuevo">
            Nuevo aviso
          </Link>
        }
        description={VISTA_DESCRIPCIONES[vista](session.empresa!.nombre)}
        eyebrow="Oficina"
        title="Avisos"
      />

      <ErrorNotice message={errorMessage} />

      {/* `relative`: los `sr-only` (absolutos) quedan dentro del scroll propio. */}
      <nav aria-label="Vistas de avisos" className="relative -mx-1 overflow-x-auto px-1 py-1">
        <ul className="flex gap-2">
          {VISTAS.map((item) => {
            const activa = item === vista;
            return (
              <li className="shrink-0" key={item}>
                <Link
                  aria-current={activa ? "page" : undefined}
                  className={`${tabBase} ${activa ? tabActive : tabInactive}`}
                  href={vistaHref(item)}
                >
                  {VISTA_LABELS[item]}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                      activa ? "bg-white/15 text-white" : "bg-background text-text"
                    }`}
                  >
                    <span className="sr-only">: </span>
                    {recuento[item]}
                    <span className="sr-only"> avisos</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {avisos.length === 0 && vista !== "todos" ? (
        <section className="rounded-lg border border-border bg-surface p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-primary">{VISTA_VACIA[vista].titulo}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{VISTA_VACIA[vista].texto}</p>
        </section>
      ) : avisos.length === 0 ? (
        <section className="rounded-lg border border-border bg-surface p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-primary">Todavía no hay avisos</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Cuando un cliente llame para comunicar una avería, registra el aviso
            con su sede, la persona de contacto y la prioridad.
          </p>
          <Link className={`${buttonPrimaryClass} mt-5`} href="/panel/avisos/nuevo">
            Nuevo aviso
          </Link>
        </section>
      ) : (
        <>
          {/* Escritorio: tabla con scroll horizontal controlado. */}
          <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface md:block">
            <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
              <caption className="sr-only">{`Listado de avisos: ${VISTA_LABELS[vista]}`}</caption>
              <thead className="border-b border-border bg-background text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold" scope="col">Prioridad</th>
                  <th className="px-4 py-3 font-semibold" scope="col">Estado</th>
                  <th className="px-4 py-3 font-semibold" scope="col">Cliente</th>
                  <th className="px-4 py-3 font-semibold" scope="col">Sede</th>
                  <th className="px-4 py-3 font-semibold" scope="col">Descripción</th>
                  <th className="px-4 py-3 font-semibold" scope="col">Creado</th>
                  <th className="px-4 py-3 font-semibold" scope="col">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {avisos.map((aviso) => (
                  <tr className="border-b border-border last:border-b-0" key={aviso.id}>
                    <td className="px-4 py-3 align-top">
                      <PrioridadChip prioridad={aviso.prioridad} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <EstadoChip estado={aviso.estado} />
                    </td>
                    <td className="px-4 py-3 align-top font-medium text-text">{aviso.cliente}</td>
                    <td className="px-4 py-3 align-top text-text">{aviso.sede}</td>
                    <td className="max-w-xs px-4 py-3 align-top text-muted">
                      {resumenDescripcion(aviso.descripcion, 70)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-top tabular-nums text-text">
                      <time dateTime={aviso.creadoEn.toISOString()}>
                        {formatFecha(aviso.creadoEn)}
                      </time>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-top">
                      <Link className={linkClass} href={`/panel/avisos/${aviso.id}`}>
                        Ver aviso
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Móvil: tarjetas pulsables. */}
          <ul aria-label={`Listado de avisos: ${VISTA_LABELS[vista]}`} className="flex flex-col gap-3 md:hidden">
            {avisos.map((aviso) => (
              <li key={aviso.id}>
                <Link
                  className="flex min-h-12 flex-col gap-2 rounded-lg border border-border bg-surface px-4 py-4 transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  href={`/panel/avisos/${aviso.id}`}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <PrioridadChip prioridad={aviso.prioridad} />
                    <EstadoChip estado={aviso.estado} />
                  </span>
                  <span className="break-words text-base font-semibold text-primary">
                    {aviso.cliente}
                  </span>
                  <span className="break-words text-sm text-text">{aviso.sede}</span>
                  <span className="break-words text-sm text-muted">
                    {resumenDescripcion(aviso.descripcion)}
                  </span>
                  <time
                    className="text-xs tabular-nums text-muted"
                    dateTime={aviso.creadoEn.toISOString()}
                  >
                    {formatFecha(aviso.creadoEn)}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
