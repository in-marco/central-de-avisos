import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/client";
import { requireSuperadmin } from "@/lib/superadmin/authorization";
import {
  countActivePlans,
  countCompanies,
  countPendingInvitations,
} from "@/lib/superadmin/companies";
import { buttonPrimaryClass, buttonSecondaryClass, cardClass } from "./_components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Proveedor · Central de avisos",
};

export default async function SuperadminPage() {
  await requireSuperadmin("/superadmin");

  const db = getDb();
  const [empresas, planesActivos, invitacionesPendientes] = await Promise.all([
    countCompanies(db),
    countActivePlans(db),
    countPendingInvitations(db),
  ]);

  const metrics = [
    { label: "Empresas", value: empresas, href: "/superadmin/empresas" },
    { label: "Planes activos", value: planesActivos, href: "/superadmin/planes" },
    {
      label: "Invitaciones pendientes",
      value: invitacionesPendientes,
      href: "/superadmin/empresas",
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
          Proveedor SaaS
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
          Administración de empresas y planes
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-7 text-muted">
          Da de alta empresas de servicios, asigna su plan mensual e invita a
          su administrador. El enlace de invitación se muestra una sola vez en
          pantalla.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {metrics.map((metric) => (
          <Link
            className={`${cardClass} transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
            href={metric.href}
            key={metric.label}
          >
            <p className="text-sm font-medium text-muted">{metric.label}</p>
            <p className="mt-3 font-mono text-3xl font-semibold tabular-nums text-primary">
              {metric.value}
            </p>
          </Link>
        ))}
      </div>

      <section className={cardClass}>
        <h2 className="text-lg font-semibold text-primary">Acciones</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Los planes son globales. Las empresas pertenecen a su propio tenant y
          solo se gestionan desde esta superficie.
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Link className={buttonPrimaryClass} href="/superadmin/empresas/nueva">
            Nueva empresa
          </Link>
          <Link className={buttonSecondaryClass} href="/superadmin/planes">
            Gestionar planes
          </Link>
        </div>
      </section>
    </div>
  );
}
