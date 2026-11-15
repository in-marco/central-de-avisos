type EnvLike = Record<string, string | undefined>;

/**
 * Modo demo pública (demo-deployment): solo `DEMO_MODE=true` exacto lo activa.
 * Las páginas estáticas leen la variable en `next build`, así que cambiarla
 * exige reconstruir (en Vercel, redeploy).
 */
export function isDemoMode(env: EnvLike = process.env): boolean {
  return env.DEMO_MODE === "true";
}

export const DEMO_BANNER_TEXT = "Entorno de demostración · datos ficticios";
