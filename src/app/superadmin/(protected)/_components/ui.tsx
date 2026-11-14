import type { ReactNode } from "react";

export const inputClass =
  "h-12 w-full rounded-md border border-border bg-surface px-3 text-base text-text transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11";

export const selectClass = inputClass;

export const textareaClass =
  "min-h-28 w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-text transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const buttonPrimaryClass =
  "inline-flex h-12 items-center justify-center rounded-md bg-primary px-5 text-base font-medium text-white transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11";

export const buttonSecondaryClass =
  "inline-flex h-12 items-center justify-center rounded-md border border-border bg-surface px-5 text-sm font-medium text-primary transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11";

export const cardClass = "rounded-lg border border-border bg-surface p-6 sm:p-8";

export const tableWrapperClass =
  "overflow-x-auto rounded-lg border border-border bg-surface";

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
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
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

type ChipTone = "success" | "warning" | "danger" | "neutral";

const CHIP_CLASSES: Record<ChipTone, string> = {
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
  neutral: "border-border bg-background text-muted",
};

export function StatusChip({
  tone,
  children,
}: {
  tone: ChipTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${CHIP_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

export function CompanyStatusChip({ estado }: { estado: "ACTIVA" | "SUSPENDIDA" }) {
  return estado === "ACTIVA" ? (
    <StatusChip tone="success">Activa</StatusChip>
  ) : (
    <StatusChip tone="warning">Suspendida</StatusChip>
  );
}

export function InvitationStatusChip({
  status,
}: {
  status: "PENDIENTE" | "CADUCADA" | "ACEPTADA";
}) {
  if (status === "ACEPTADA") {
    return <StatusChip tone="success">Aceptada</StatusChip>;
  }

  if (status === "CADUCADA") {
    return <StatusChip tone="danger">Caducada</StatusChip>;
  }

  return <StatusChip tone="warning">Pendiente</StatusChip>;
}

export function firstValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function formatCurrency(value: { toString(): string }): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value.toString()));
}

export function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}
