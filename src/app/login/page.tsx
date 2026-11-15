import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/current-session";
import { safeNextPath } from "@/lib/auth/redirect";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Iniciar sesión · Central de avisos",
};

const ERROR_MESSAGES: Record<string, string> = {
  credenciales: "Email o contraseña incorrectos.",
  servicio:
    "No se pudo completar el inicio de sesión. Inténtalo de nuevo en unos minutos.",
  bloqueado: "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.",
};

// `Object.hasOwn`: `?error=__proto__` o `constructor` no deben resolver
// propiedades heredadas (regla de CONSTRAINTS.md).
function loginErrorMessage(code: string | undefined): string | undefined {
  return code && Object.hasOwn(ERROR_MESSAGES, code)
    ? ERROR_MESSAGES[code]
    : undefined;
}

type LoginSearchParams = Promise<{
  [key: string]: string | string[] | undefined;
}>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: LoginSearchParams;
}) {
  const session = await getCurrentSession();

  if (session) {
    redirect("/panel");
  }

  const params = await searchParams;
  const errorCode = firstValue(params.error);
  const errorMessage = loginErrorMessage(errorCode);
  const next = safeNextPath(firstValue(params.next) ?? "/panel");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-text">
      <section className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-sm sm:p-10">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
          Central de avisos
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
          Iniciar sesión
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Accede con el email y la contraseña de tu cuenta.
        </p>

        {errorMessage ? (
          <div
            className="mt-6 rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm leading-6 text-danger"
            role="alert"
          >
            {errorMessage}
          </div>
        ) : null}

        <form
          action="/api/auth/login"
          className="mt-6 flex flex-col gap-5"
          method="post"
        >
          <input name="next" type="hidden" value={next} />

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text" htmlFor="email">
              Email
            </label>
            <input
              autoComplete="email"
              className="h-12 rounded-md border border-border bg-surface px-3 text-base text-text transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11"
              id="email"
              name="email"
              required
              type="email"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text" htmlFor="password">
              Contraseña
            </label>
            <input
              autoComplete="current-password"
              className="h-12 rounded-md border border-border bg-surface px-3 text-base text-text transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11"
              id="password"
              name="password"
              required
              type="password"
            />
          </div>

          <button
            className="mt-1 h-12 w-full rounded-md bg-primary px-5 text-base font-medium text-white transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11"
            type="submit"
          >
            Entrar
          </button>
        </form>

        <p className="mt-6 text-sm text-muted">
          <Link
            className="inline-flex min-h-12 items-center rounded-sm text-secondary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-0"
            href="/"
          >
            Volver a la portada
          </Link>
        </p>
      </section>
    </main>
  );
}
