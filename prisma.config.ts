import "dotenv/config";
import { defineConfig } from "prisma/config";

// La URL es opcional para que `prisma generate` funcione sin .env (build,
// postinstall e init.sh sin base de datos). Los comandos de migración la
// exigen y fallan con un error claro si DATABASE_URL no está configurada.
const datasourceUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  ...(datasourceUrl ? { datasource: { url: datasourceUrl } } : {}),
});
