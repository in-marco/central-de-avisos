-- Configuración de facturación de la empresa (company-billing-settings).
--
-- El enum modo_fiscal tiene un solo valor a propósito: el MVP es NO-VERIFACTU
-- y la base de datos no puede activar VERIFACTU por error. Añadirlo exige una
-- feature/ADR con ALTER TYPE ... ADD VALUE.

-- CreateEnum
CREATE TYPE "modo_fiscal" AS ENUM ('NO_VERIFACTU');

-- AlterTable: serie y tarifa son nullables (NULL = sin configurar). Las
-- empresas existentes quedan sin configurar y en modo NO_VERIFACTU.
ALTER TABLE "empresas"
  ADD COLUMN "serie_factura" TEXT,
  ADD COLUMN "tarifa_horaria" DECIMAL(10,2),
  ADD COLUMN "modo_fiscal" "modo_fiscal" NOT NULL DEFAULT 'NO_VERIFACTU';

-- CHECKs que Prisma no modela en schema.prisma.
ALTER TABLE "empresas"
  ADD CONSTRAINT "empresas_serie_factura_formato"
  CHECK ("serie_factura" IS NULL OR "serie_factura" ~ '^[A-Z0-9][A-Z0-9-]{0,9}$');

ALTER TABLE "empresas"
  ADD CONSTRAINT "empresas_tarifa_horaria_positiva"
  CHECK ("tarifa_horaria" IS NULL OR "tarifa_horaria" > 0);
