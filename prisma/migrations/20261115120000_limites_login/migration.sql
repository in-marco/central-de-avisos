-- Límite de intentos de login (demo-deployment).
-- Tabla técnica global sin `empresa_id` (como `planes`): la identidad precede
-- al tenant. Cada fila es un contador por ventana con clave `email:<sha256>` o
-- `ip:<sha256>` (hex en minúsculas); nunca se guarda el email ni la IP en
-- claro. El incremento es un upsert atómico y el tiempo se calcula con now()
-- en PostgreSQL (src/lib/auth/rate-limit.ts).

-- CreateTable
CREATE TABLE "limites_login" (
    "clave" TEXT NOT NULL,
    "intentos" INTEGER NOT NULL,
    "ventana_inicio" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "limites_login_pkey" PRIMARY KEY ("clave")
);

-- CreateIndex
CREATE INDEX "limites_login_ventana_inicio_idx" ON "limites_login"("ventana_inicio");

-- CHECKs que Prisma no modela en schema.prisma.
ALTER TABLE "limites_login"
  ADD CONSTRAINT "limites_login_intentos_positivos"
  CHECK ("intentos" >= 0);

-- Solo claves con hash: impide guardar un email o una IP en claro.
ALTER TABLE "limites_login"
  ADD CONSTRAINT "limites_login_clave_hash"
  CHECK ("clave" ~ '^(email|ip):[0-9a-f]{64}$');
