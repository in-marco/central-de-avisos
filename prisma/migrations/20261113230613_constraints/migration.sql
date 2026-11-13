-- CHECKs de coherencia que Prisma no modela en schema.prisma.

-- El importe mensual del plan no puede ser negativo.
ALTER TABLE "planes"
  ADD CONSTRAINT "planes_importe_mensual_no_negativo"
  CHECK ("importe_mensual" >= 0);

-- El email se guarda normalizado: minúsculas y sin espacios en los extremos.
ALTER TABLE "usuarios"
  ADD CONSTRAINT "usuarios_email_normalizado"
  CHECK ("email" = lower(btrim("email")));

-- Solo el superadmin puede (y debe) tener empresa_id nulo.
ALTER TABLE "usuarios"
  ADD CONSTRAINT "usuarios_superadmin_empresa_coherente"
  CHECK (
    ("es_superadmin" AND "empresa_id" IS NULL)
    OR (NOT "es_superadmin" AND "empresa_id" IS NOT NULL)
  );
