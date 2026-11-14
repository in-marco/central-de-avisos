-- Roles de empresa combinables (role-based-permissions).
-- Los permisos se derivan en código (src/lib/authz/permissions.ts); en la base
-- de datos solo se guardan los roles. El rol CLIENTE se añadirá con
-- client-portal-invitation (ALTER TYPE ... ADD VALUE).

-- CreateEnum
CREATE TYPE "rol_usuario" AS ENUM ('ADMINISTRADOR', 'OFICINA', 'TECNICO');

-- AlterTable
ALTER TABLE "usuarios"
  ADD COLUMN "roles" "rol_usuario"[] NOT NULL DEFAULT ARRAY[]::"rol_usuario"[];

-- Backfill: hasta ahora todo usuario de empresa era, de hecho, administrador.
UPDATE "usuarios" SET "roles" = ARRAY['ADMINISTRADOR']::"rol_usuario"[]
WHERE "es_superadmin" = false;

-- El superadmin no tiene roles de empresa.
ALTER TABLE "usuarios"
  ADD CONSTRAINT "usuarios_superadmin_sin_roles"
  CHECK ("es_superadmin" = false OR cardinality("roles") = 0);

-- La lista de roles no admite elementos nulos.
ALTER TABLE "usuarios"
  ADD CONSTRAINT "usuarios_roles_sin_nulos"
  CHECK (array_position("roles", NULL) IS NULL);
