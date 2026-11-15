import { DEMO_BANNER_TEXT, isDemoMode } from "@/lib/demo";

/**
 * Franja de entorno de demostración (componente de servidor). Se muestra solo
 * con `DEMO_MODE=true`. Texto `text` (#121820) sobre `warning` (#B4771B):
 * contraste 4.75:1, AA para texto de 14 px (el blanco daría 3.75:1 y no
 * cumple). Sin botón de cerrar ni sticky.
 */
export function DemoBanner() {
  if (!isDemoMode()) {
    return null;
  }

  return (
    <div
      className="w-full bg-warning px-4 py-2 text-center text-sm font-semibold leading-5 text-text"
      role="note"
    >
      {DEMO_BANNER_TEXT}
    </div>
  );
}
