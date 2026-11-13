import "dotenv/config";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL no está configurada. Copia .env.example a .env antes de ejecutar npm run test:db.",
  );
}
