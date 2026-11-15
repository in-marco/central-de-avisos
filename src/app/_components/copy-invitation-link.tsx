"use client";

import { useState } from "react";

/**
 * Campo de solo lectura con el enlace de invitación y botón de copiar.
 * Compartido por el superadmin (invitación de administrador) y por la ficha de
 * cliente de `/panel` (invitación al portal). No importa código de servidor.
 */
export function CopyInvitationLink({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input
        aria-label="Enlace de invitación"
        className="h-12 w-full rounded-md border border-border bg-background px-3 font-mono text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11"
        readOnly
        value={value}
      />
      <button
        className="inline-flex h-12 shrink-0 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-primary transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-11"
        onClick={copy}
        type="button"
      >
        {copied ? "Copiado" : "Copiar enlace"}
      </button>
    </div>
  );
}
