import path from "node:path";
import { defineConfig } from "vitest/config";

// Tests de integración reales contra PostgreSQL. Se ejecutan con `npm run
// test:db`, nunca dentro del gate unitario `npm test`.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.db.test.ts"],
    setupFiles: ["src/db/db-test-setup.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
