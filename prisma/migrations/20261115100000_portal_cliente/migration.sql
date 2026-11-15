-- Portal de cliente (client-portal-invitation).
-- Un usuario de cliente se identifica por `cliente_id IS NOT NULL`: no hay rol
-- CLIENTE en `rol_usuario`. No tiene roles de empresa, no es superadmin y
-- siempre tiene empresa (CHECK usuarios_cliente_coherente). El FK compuesto
-- (cliente_id, empresa_id) → clientes(id, empresa_id) impide ligarlo a un
-- cliente de otra empresa. `contacto_id` es único (un acceso por contacto) y
-- es un FK simple: la regla «el contacto es de ese cliente y empresa» se aplica
-- en src/lib/portal/invitaciones.ts y se cubre con test:db.
-- El nuevo valor del enum no se usa en esta migración (ALTER TYPE ... ADD VALUE
-- no puede usarse en la misma transacción en la que se añade).

-- AlterEnum
ALTER TYPE "tipo_invitacion" ADD VALUE 'CONTACTO_CLIENTE';

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "cliente_id" UUID,
ADD COLUMN     "contacto_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_contacto_id_key" ON "usuarios"("contacto_id");

-- CreateIndex
CREATE INDEX "usuarios_cliente_id_idx" ON "usuarios"("cliente_id");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_cliente_id_empresa_id_fkey" FOREIGN KEY ("cliente_id", "empresa_id") REFERENCES "clientes"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_contacto_id_fkey" FOREIGN KEY ("contacto_id") REFERENCES "contactos"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- CHECKs que Prisma no modela en schema.prisma.
-- El usuario de cliente no tiene roles ni permisos de empresa, no es
-- superadmin y pertenece a una empresa (así el FK compuesto siempre se aplica).
ALTER TABLE "usuarios"
  ADD CONSTRAINT "usuarios_cliente_coherente"
  CHECK (
    "cliente_id" IS NULL
    OR ("es_superadmin" = false AND "empresa_id" IS NOT NULL AND cardinality("roles") = 0)
  );

-- Un acceso ligado a un contacto es siempre un usuario de cliente.
ALTER TABLE "usuarios"
  ADD CONSTRAINT "usuarios_contacto_requiere_cliente"
  CHECK ("contacto_id" IS NULL OR "cliente_id" IS NOT NULL);
