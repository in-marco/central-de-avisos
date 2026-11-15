-- Validación de avisos y bolsa de pendientes (aviso-validation-pool).
-- La oficina valida un aviso NUEVO (pasa a PENDIENTE y entra en la bolsa) o
-- lo cancela con motivo desde NUEVO o PENDIENTE. Las transiciones las hace
-- src/lib/avisos/avisos.ts con updateMany condicionado al estado de origen;
-- autor y fecha los fija el servidor con el usuario de la sesión.
-- Las filas existentes son todas NUEVO sin datos de validación ni de
-- cancelación: la migración no necesita backfill.
-- Los CHECK no comparan fechas escritas por la app con defaults now() de la
-- base de datos (desfase conocido, ver CONSTRAINTS.md).

-- AlterTable
ALTER TABLE "avisos" ADD COLUMN     "cancelado_en" TIMESTAMPTZ(3),
ADD COLUMN     "cancelado_por_id" UUID,
ADD COLUMN     "motivo_cancelacion" TEXT,
ADD COLUMN     "validado_en" TIMESTAMPTZ(3),
ADD COLUMN     "validado_por_id" UUID;

-- CreateIndex
CREATE INDEX "avisos_empresa_id_estado_idx" ON "avisos"("empresa_id", "estado");

-- AddForeignKey
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_validado_por_id_fkey" FOREIGN KEY ("validado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_cancelado_por_id_fkey" FOREIGN KEY ("cancelado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- CHECK que Prisma no modela en schema.prisma.
-- Validación: fecha y autor van juntos; NUEVO no tiene validación y todo
-- estado posterior salvo CANCELADO la exige (un aviso cancelado desde NUEVO
-- no la tiene; uno cancelado desde PENDIENTE la conserva).
ALTER TABLE "avisos"
  ADD CONSTRAINT "avisos_validacion_coherente"
  CHECK (
    ("validado_en" IS NULL) = ("validado_por_id" IS NULL)
    AND ("estado" <> 'NUEVO' OR "validado_en" IS NULL)
    AND ("estado" IN ('NUEVO', 'CANCELADO') OR "validado_en" IS NOT NULL)
  );

-- Cancelación: fecha, autor y motivo van juntos y existen si y solo si el
-- aviso está CANCELADO.
ALTER TABLE "avisos"
  ADD CONSTRAINT "avisos_cancelacion_coherente"
  CHECK (
    ("cancelado_en" IS NULL) = ("cancelado_por_id" IS NULL)
    AND ("cancelado_en" IS NULL) = ("motivo_cancelacion" IS NULL)
    AND ("estado" = 'CANCELADO') = ("cancelado_en" IS NOT NULL)
  );

ALTER TABLE "avisos"
  ADD CONSTRAINT "avisos_motivo_cancelacion_no_vacio"
  CHECK ("motivo_cancelacion" IS NULL OR length(btrim("motivo_cancelacion")) > 0);
