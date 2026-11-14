import type { ReactNode } from "react";

/**
 * Piezas de interfaz compartidas por las páginas de `/panel`. Es una copia
 * acotada de `src/app/superadmin/(protected)/_components/ui.tsx`: `/panel` no
 * importa la UI del proveedor.
 */

export const inputClass =
  "h-12 w-full rounded-md border border-border bg-surface px-3 text-base text-text transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11";

export const selectClass = inputClass;

export const textareaClass =
  "min-h-24 w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-text transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const checkboxClass =
  "h-5 w-5 shrink-0 rounded border-border text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const buttonPrimaryClass =
  "inline-flex h-12 items-center justify-center rounded-md bg-primary px-5 text-base font-medium text-white transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11";

export const buttonSecondaryClass =
  "inline-flex h-12 items-center justify-center rounded-md border border-border bg-surface px-5 text-sm font-medium text-primary transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11";

export const cardClass = "rounded-lg border border-border bg-surface p-5 sm:p-8";

export const labelClass = "text-sm font-medium text-text";

export const helpClass = "text-xs leading-5 text-muted";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
          {eyebrow}
        </p>
        <h1 className="mt-2 break-words text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-base leading-7 text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  );
}

export function ErrorNotice({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <div
      className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm leading-6 text-danger"
      role="alert"
    >
      {message}
    </div>
  );
}

export function OkNotice({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <div
      className="rounded-md border border-success/40 bg-success/5 px-4 py-3 text-sm leading-6 text-success"
      role="status"
    >
      {message}
    </div>
  );
}

export function firstValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
