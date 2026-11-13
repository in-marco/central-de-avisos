export const SERVICE_NAME = "central-de-avisos";

export type DatabaseStatus = "up" | "down";
export type HealthStatus = "ok" | "degraded";

export type HealthPayload = {
  status: HealthStatus;
  service: string;
  timestamp: string;
  database: {
    status: DatabaseStatus;
  };
};

/**
 * Construye el payload de salud. Es determinista salvo por el timestamp y no
 * incluye credenciales ni detalles internos del error de base de datos.
 */
export function buildHealthPayload(
  databaseUp: boolean,
  now: Date = new Date(),
): HealthPayload {
  return {
    status: databaseUp ? "ok" : "degraded",
    service: SERVICE_NAME,
    timestamp: now.toISOString(),
    database: {
      status: databaseUp ? "up" : "down",
    },
  };
}
