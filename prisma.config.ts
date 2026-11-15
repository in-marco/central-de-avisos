import "dotenv/config";
import { defineConfig } from "prisma/config";

// La URL es opcional para que `prisma generate` funcione sin .env (build,
// postinstall e init.sh sin base de datos). Los comandos de migración la
// exigen y fallan con un error claro si no hay ninguna URL configurada.
//
// Las migraciones y el resto del CLI prefieren `DATABASE_URL_UNPOOLED` (URL
// directa de Neon, sin pooler) y si falta usan `DATABASE_URL`. La app en
// runtime solo usa `DATABASE_URL` (src/db/client.ts).
const datasourceUrl =
  process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  ...(datasourceUrl ? { datasource: { url: datasourceUrl } } : {}),
});
