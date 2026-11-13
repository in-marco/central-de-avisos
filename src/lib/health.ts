export const SERVICE_NAME = "central-de-avisos";

export type HealthPayload = {
  status: "ok";
  service: string;
  timestamp: string;
};

/**
 * Construye el payload de salud. Es determinista salvo por el timestamp,
 * lo que permite testear la forma sin levantar el servidor.
 */
export function buildHealthPayload(now: Date = new Date()): HealthPayload {
  return {
    status: "ok",
    service: SERVICE_NAME,
    timestamp: now.toISOString(),
  };
}
