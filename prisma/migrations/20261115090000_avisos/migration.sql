-- Avisos (office-aviso-creation).
-- Un aviso es una solicitud de intervención de un cliente en una de sus
-- sedes, con una persona de contacto, descripción y prioridad. Los FK
-- compuestos impiden en PostgreSQL mezclar empresas, clientes, sedes y
-- contactos:
--   (cliente_id, empresa_id)  → clientes(id, empresa_id)
--   (sede_id, cliente_id)     → sedes(id, cliente_id)
--   (contacto_id, cliente_id) → contactos(id, cliente_id)
-- Que el contacto sea de todo el cliente o de la sede del aviso no lo puede
-- expresar un FK: lo aplica src/lib/avisos/avisos.ts.
-- El enum de estados se crea completo, pero esta feature solo escribe NUEVO;
-- `origen` y `estado` los fija el servidor, nunca el formulario.

-- CreateEnum
CREATE TYPE "prioridad_aviso" AS ENUM ('NORMAL', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "origen_aviso" AS ENUM ('OFICINA', 'CLIENTE');

-- CreateEnum
CREATE TYPE "estado_aviso" AS ENUM ('NUEVO', 'PENDIENTE', 'ASIGNADO', 'EN_CURSO', 'RESUELTO', 'FACTURADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "avisos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "sede_id" UUID NOT NULL,
    "contacto_id" UUID NOT NULL,
    "descripcion" TEXT NOT NULL,
    "prioridad" "prioridad_aviso" NOT NULL DEFAULT 'NORMAL',
    "origen" "origen_aviso" NOT NULL,
    "estado" "estado_aviso" NOT NULL DEFAULT 'NUEVO',
    "creado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "avisos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "avisos_empresa_id_creado_en_idx" ON "avisos"("empresa_id", "creado_en");

-- CreateIndex
CREATE INDEX "avisos_cliente_id_idx" ON "avisos"("cliente_id");

-- CreateIndex
CREATE INDEX "avisos_sede_id_idx" ON "avisos"("sede_id");

-- CreateIndex
CREATE INDEX "avisos_contacto_id_idx" ON "avisos"("contacto_id");

-- Destino del FK compuesto (contacto_id, cliente_id) de avisos.
-- CreateIndex
CREATE UNIQUE INDEX "contactos_id_cliente_id_key" ON "contactos"("id", "cliente_id");

-- AddForeignKey
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_cliente_id_empresa_id_fkey" FOREIGN KEY ("cliente_id", "empresa_id") REFERENCES "clientes"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_sede_id_cliente_id_fkey" FOREIGN KEY ("sede_id", "cliente_id") REFERENCES "sedes"("id", "cliente_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_contacto_id_cliente_id_fkey" FOREIGN KEY ("contacto_id", "cliente_id") REFERENCES "contactos"("id", "cliente_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- CHECK que Prisma no modela en schema.prisma.
ALTER TABLE "avisos"
  ADD CONSTRAINT "avisos_descripcion_no_vacia"
  CHECK (length(btrim("descripcion")) > 0);
