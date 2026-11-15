import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDb } from "@/db/client";
import {
  NEW_PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "@/lib/auth/password";
import {
  findInvitationByToken,
  isWellFormedInvitationToken,
  type InvitationLookup,
} from "@/lib/onboarding/invitation-acceptance";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Activar cuenta · Central de avisos",
  robots: { index: false, follow: false },
};

const ERROR_MESSAGES: Record<string, string> = {
  corta: `La contraseña debe tener al menos ${NEW_PASSWORD_MIN_LENGTH} caracteres.`,
  larga: `La contraseña no puede superar ${PASSWORD_MAX_LENGTH} caracteres.`,
  distinta: "Las dos contraseñas no coinciden.",
  servicio:
    "No se pudo activar la cuenta. Inténtalo de nuevo en unos minutos.",
};

const inputClass =
  "h-12 rounded-md border border-border bg-surface px-3 text-base text-text transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11";
const primaryLinkClass =
  "mt-6 inline-flex h-12 items-center justify-center rounded-md bg-primary px-5 text-base font-medium text-white transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11";

type InvitationSearchParams = Promise<{
  [key: string]: string | string[] | undefined;
}>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function InvitationCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-text">
      <section className="w-full max-w-lg rounded-lg border border-border bg-surface p-6 shadow-sm sm:p-10">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
          {eyebrow}
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
          {title}
        </h1>
        {children}
      </section>
    </main>
  );
}

function RejectedInvitation({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <InvitationCard eyebrow="Invitación" title={title}>
      <p className="mt-3 text-base leading-7 text-muted">{message}</p>
      <Link className={primaryLinkClass} href="/login">
        Ir a iniciar sesión
      </Link>
    </InvitationCard>
  );
}

export default async function InvitacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: InvitationSearchParams;
}) {
  const { token } = await params;

  if (!isWellFormedInvitationToken(token)) {
    notFound();
  }

  let lookup: InvitationLookup;
  try {
    lookup = await findInvitationByToken(getDb(), token);
  } catch {
    return (
      <RejectedInvitation
        message="No se pudo comprobar la invitación. Inténtalo de nuevo en unos minutos."
        title="Servicio no disponible"
      />
    );
  }

  switch (lookup.status) {
    case "NO_ENCONTRADA":
      notFound();
    case "ACEPTADA":
      return (
        <RejectedInvitation
          message="Esta invitación ya se ha utilizado. Entra con tu email y la contraseña que definiste."
          title="Invitación ya utilizada"
        />
      );
    case "CADUCADA":
      // El tipo no se conoce aquí (no se revela nada de una invitación no
      // válida): el texto sirve para administradores y contactos de cliente.
      return (
        <RejectedInvitation
          message="Esta invitación ha caducado. Pide a quien te invitó un enlace nuevo."
          title="Invitación caducada"
        />
      );
    case "EMPRESA_INACTIVA":
      return (
        <RejectedInvitation
          message="La empresa no está activa. Contacta con el proveedor para reactivarla antes de activar tu cuenta."
          title="Empresa no activa"
        />
      );
  }

  const query = await searchParams;
  const errorCode = firstValue(query.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;
  const caducidad = new Intl.DateTimeFormat("es-ES", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(lookup.expiraEn);

  const esPortal = lookup.tipo === "CONTACTO_CLIENTE";

  return (
    <InvitationCard
      eyebrow={esPortal ? "Portal de cliente" : "Central de avisos"}
      title="Activa tu cuenta"
    >
      <p className="mt-2 text-sm leading-6 text-muted">
        {esPortal
          ? `${lookup.empresa.nombre} te ha invitado al portal de cliente. Elige una contraseña para consultar los datos y las sedes de tu empresa.`
          : "Te han invitado como administrador de tu empresa. Elige una contraseña para entrar en el panel."}
      </p>

      <dl className="mt-6 grid gap-4 rounded-md border border-border bg-background p-4 text-sm sm:grid-cols-2">
        {esPortal && lookup.cliente ? (
          <div className="sm:col-span-2">
            <dt className="font-medium text-muted">Cliente</dt>
            <dd className="mt-1 break-words text-base text-text">
              {lookup.cliente.razonSocial}
            </dd>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <dt className="font-medium text-muted">
            {esPortal ? "Empresa de servicios" : "Empresa"}
          </dt>
          <dd className="mt-1 text-base text-text">{lookup.empresa.nombre}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted">Nombre</dt>
          <dd className="mt-1 text-base text-text">{lookup.usuario.nombre}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted">Email</dt>
          <dd className="mt-1 break-all text-base text-text">
            {lookup.usuario.email}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-medium text-muted">Válida hasta</dt>
          <dd className="mt-1 text-base text-text">{caducidad}</dd>
        </div>
      </dl>

      {errorMessage ? (
        <div
          className="mt-6 rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm leading-6 text-danger"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}

      <form
        action="/api/invitaciones/aceptar"
        className="mt-6 flex flex-col gap-5"
        method="post"
      >
        <input name="token" type="hidden" value={token} />
        {/* Ayuda a los gestores de contraseñas a asociar la credencial. */}
        <input
          autoComplete="username"
          hidden
          name="username"
          readOnly
          type="email"
          value={lookup.usuario.email}
        />

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-text" htmlFor="password">
            Contraseña
          </label>
          <input
            aria-describedby="password-help"
            autoComplete="new-password"
            className={inputClass}
            id="password"
            maxLength={PASSWORD_MAX_LENGTH}
            minLength={NEW_PASSWORD_MIN_LENGTH}
            name="password"
            required
            type="password"
          />
          <p className="text-sm text-muted" id="password-help">
            Mínimo {NEW_PASSWORD_MIN_LENGTH} caracteres.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label
            className="text-sm font-medium text-text"
            htmlFor="passwordConfirm"
          >
            Repite la contraseña
          </label>
          <input
            autoComplete="new-password"
            className={inputClass}
            id="passwordConfirm"
            maxLength={PASSWORD_MAX_LENGTH}
            minLength={NEW_PASSWORD_MIN_LENGTH}
            name="passwordConfirm"
            required
            type="password"
          />
        </div>

        <button
          className="mt-1 h-12 w-full rounded-md bg-primary px-5 text-base font-medium text-white transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11"
          type="submit"
        >
          Activar cuenta
        </button>
      </form>
    </InvitationCard>
  );
}
