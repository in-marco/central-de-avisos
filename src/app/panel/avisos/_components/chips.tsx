import type { SVGProps } from "react";
import {
  ESTADO_LABELS,
  PRIORIDAD_LABELS,
  type Estado,
  type Prioridad,
} from "@/lib/avisos/validation";

/**
 * Chips de prioridad y estado (`DESIGN.md`): radio completo, icono y texto,
 * nunca solo color. Normal es neutro, Alta warning y Urgente danger. El texto
 * de Alta va en color de texto porque el warning no llega a 4.5:1 sobre
 * blanco; el color se lleva en el borde, el fondo y el icono.
 */

const chipBase =
  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold";

const PRIORIDAD_CLASSES: Record<Prioridad, string> = {
  NORMAL: "border-border bg-background text-text",
  ALTA: "border-warning/60 bg-warning/10 text-text",
  URGENTE: "border-danger/50 bg-danger/10 text-danger",
};

function PrioridadIcon({ prioridad }: { prioridad: Prioridad }) {
  const common: SVGProps<SVGSVGElement> = {
    "aria-hidden": true,
    className: "h-3.5 w-3.5 shrink-0",
    fill: "none",
    focusable: false,
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 2,
    viewBox: "0 0 16 16",
  };

  if (prioridad === "URGENTE") {
    // Octógono con exclamación.
    return (
      <svg {...common}>
        <path d="M5.5 1.5h5l4 4v5l-4 4h-5l-4-4v-5z" />
        <path d="M8 4.5v4.5M8 11.5v.01" />
      </svg>
    );
  }

  if (prioridad === "ALTA") {
    // Flecha hacia arriba en color warning.
    return (
      <svg {...common} className="h-3.5 w-3.5 shrink-0 text-warning">
        <path d="M8 13.5v-11M3.5 7 8 2.5 12.5 7" />
      </svg>
    );
  }

  // Normal: línea horizontal.
  return (
    <svg {...common}>
      <path d="M3 8h10" />
    </svg>
  );
}

export function PrioridadChip({ prioridad }: { prioridad: Prioridad }) {
  return (
    <span className={`${chipBase} ${PRIORIDAD_CLASSES[prioridad]}`}>
      <PrioridadIcon prioridad={prioridad} />
      <span>
        <span className="sr-only">Prioridad: </span>
        {PRIORIDAD_LABELS[prioridad]}
      </span>
    </span>
  );
}

export function EstadoChip({ estado }: { estado: Estado }) {
  return (
    <span className={`${chipBase} border-secondary/40 bg-secondary/10 text-primary`}>
      <svg
        aria-hidden
        className="h-3.5 w-3.5 shrink-0"
        fill="currentColor"
        focusable={false}
        viewBox="0 0 16 16"
      >
        <circle cx="8" cy="8" r="3.5" />
      </svg>
      <span>
        <span className="sr-only">Estado: </span>
        {ESTADO_LABELS[estado]}
      </span>
    </span>
  );
}
