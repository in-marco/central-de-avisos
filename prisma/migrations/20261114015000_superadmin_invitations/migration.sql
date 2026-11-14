-- AlterTable
ALTER TABLE "empresas" ADD COLUMN "direccion_fiscal" TEXT;

-- Normaliza los NIF existentes antes de añadir el CHECK.
UPDATE "empresas" SET "nif" = upper(btrim("nif"));

ALTER TABLE "empresas"
  ADD CONSTRAINT "empresas_nif_normalizado"
  CHECK ("nif" = upper(btrim("nif")));

-- CreateEnum
CREATE TYPE "tipo_invitacion" AS ENUM ('ADMINISTRADOR_EMPRESA');

-- CreateTable
CREATE TABLE "invitaciones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo" "tipo_invitacion" NOT NULL DEFAULT 'ADMINISTRADOR_EMPRESA',
    "token_hash" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "aceptada_en" TIMESTAMPTZ(3),

    CONSTRAINT "invitaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitaciones_token_hash_key" ON "invitaciones"("token_hash");

-- CreateIndex
CREATE INDEX "invitaciones_empresa_id_idx" ON "invitaciones"("empresa_id");

-- CreateIndex
CREATE INDEX "invitaciones_usuario_id_idx" ON "invitaciones"("usuario_id");

-- CreateIndex
CREATE INDEX "invitaciones_expira_en_idx" ON "invitaciones"("expira_en");

-- AddForeignKey
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- CHECKs de coherencia que Prisma no modela en schema.prisma.
ALTER TABLE "invitaciones"
  ADD CONSTRAINT "invitaciones_expiracion_posterior"
  CHECK ("expira_en" > "creado_en");

ALTER TABLE "invitaciones"
  ADD CONSTRAINT "invitaciones_aceptacion_posterior"
  CHECK ("aceptada_en" IS NULL OR "aceptada_en" >= "creado_en");
