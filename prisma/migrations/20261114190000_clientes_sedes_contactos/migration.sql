-- Clientes, sedes y contactos (client-records).
-- El cliente es el sujeto fiscal (razón social, NIF y dirección de
-- facturación); la sede es solo el lugar de la intervención. La factura de
-- trabajo futura referenciará `cliente_id`, nunca `sede_id`.
-- Sedes y contactos llevan `empresa_id` con un FK compuesto
-- (cliente_id, empresa_id) → clientes(id, empresa_id), así que PostgreSQL
-- rechaza cualquier mezcla de empresas. `contactos.sede_id` es un FK simple
-- (limitación de Prisma con relaciones opcionales); la regla «la sede es del
-- mismo cliente» se aplica en src/lib/clientes/clientes.ts.

-- CreateTable
CREATE TABLE "clientes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "razon_social" TEXT NOT NULL,
    "nif" TEXT NOT NULL,
    "direccion_facturacion" TEXT NOT NULL,
    "tarifa_horaria" DECIMAL(12,2),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sedes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sedes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contactos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "sede_id" UUID,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "email" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contactos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clientes_id_empresa_id_key" ON "clientes"("id", "empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_empresa_id_nif_key" ON "clientes"("empresa_id", "nif");

-- CreateIndex
CREATE INDEX "sedes_cliente_id_idx" ON "sedes"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "sedes_id_cliente_id_key" ON "sedes"("id", "cliente_id");

-- CreateIndex
CREATE INDEX "contactos_cliente_id_idx" ON "contactos"("cliente_id");

-- CreateIndex
CREATE INDEX "contactos_sede_id_idx" ON "contactos"("sede_id");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sedes" ADD CONSTRAINT "sedes_cliente_id_empresa_id_fkey" FOREIGN KEY ("cliente_id", "empresa_id") REFERENCES "clientes"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "contactos" ADD CONSTRAINT "contactos_cliente_id_empresa_id_fkey" FOREIGN KEY ("cliente_id", "empresa_id") REFERENCES "clientes"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "contactos" ADD CONSTRAINT "contactos_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- CHECKs que Prisma no modela en schema.prisma.
ALTER TABLE "clientes"
  ADD CONSTRAINT "clientes_nif_normalizado"
  CHECK ("nif" = upper(btrim("nif")));

ALTER TABLE "clientes"
  ADD CONSTRAINT "clientes_tarifa_no_negativa"
  CHECK ("tarifa_horaria" IS NULL OR "tarifa_horaria" >= 0);

ALTER TABLE "contactos"
  ADD CONSTRAINT "contactos_telefono_o_email"
  CHECK ("telefono" IS NOT NULL OR "email" IS NOT NULL);

ALTER TABLE "contactos"
  ADD CONSTRAINT "contactos_email_normalizado"
  CHECK ("email" IS NULL OR "email" = lower(btrim("email")));
