# Architecture

Estado actual: fundamento técnico. La app es un monolito Next.js con App Router
y una única superficie de datos PostgreSQL. No hay autenticación, roles ni
dominio funcional todavía.

## Capas y dirección de dependencias

```txt
src/app/          rutas HTTP y páginas (borde de entrada)
  └─ src/lib/     lógica de aplicación testeable sin servidor
       └─ src/db/ acceso a datos y contrato de tenant
            └─ src/generated/prisma/ cliente Prisma generado (no versionado)
```

- `src/db/client.ts` es el único punto de construcción del cliente Prisma.
- `src/lib/` no importa rutas de `src/app/`; las rutas dependen de `src/lib/`.
- El cliente generado se regenera con `npm run db:generate` y no se commitea.

## Base de datos

- **PostgreSQL** es la única base de datos. En desarrollo local se usa una
  instalación nativa; no se requiere Docker.
- **Prisma 7.10.1** con el generador `prisma-client` (no `prisma-client-js`),
  salida en `src/generated/prisma` y módulo ESM.
- **Driver adapter** `@prisma/adapter-pg` sobre `pg`. `PrismaClient` se crea de
  forma perezosa en `getDb()` para que `next build`, `init.sh` y los tests
  unitarios no necesiten `DATABASE_URL` ni abran conexiones.
- `prisma.config.ts` es la fuente de la URL de migración. La URL es opcional
  para que `prisma generate` funcione sin `.env`; los comandos de migración
  fallan si no hay `DATABASE_URL`.

## Migraciones

- Las migraciones son SQL versionado en `prisma/migrations/` y se aplican con
  `npm run db:deploy`.
- `npm run db:migrate` crea migraciones en desarrollo; `npm run db:status`
  comprueba el historial; `npm run db:reset` reconstruye la base local.
- Los CHECK que Prisma no modela se mantienen en migraciones SQL explícitas.
- `prisma db push` está prohibido para cambios compartidos.

### Esquema base

- `planes`: catálogo global del proveedor; nombre único, importe mensual
  `decimal(12,2)` con CHECK `>= 0`, activo y timestamps.
- `empresas`: raíz del tenant; NIF único, email de facturación, FK `plan_id`
  con `ON DELETE/UPDATE RESTRICT`, estado `ACTIVA`/`SUSPENDIDA` e índice por
  plan.
- `usuarios`: email único global, `empresa_id` nullable con FK `Restrict`,
  estado `ACTIVO`/`INACTIVO`, `es_superadmin` e índice por empresa. Los CHECK
  garantizan email normalizado y que solo el superadmin tenga `empresa_id`
  nulo.

## Aislamiento multiempresa

La estrategia es **filtros de aplicación obligatorios**, no RLS.

- Toda tabla operable futura debe llevar `empresa_id`.
- Toda consulta pasa por `src/db/tenant.ts`:
  - `requireEmpresaId(valor)` lanza si falta el contexto;
  - `tenantFilter(empresaId)` devuelve el filtro Prisma obligatorio;
  - `assertTenantAccess(recursoEmpresaId, contextoEmpresaId)` protege un
    recurso concreto.
- Los repositorios futuros reciben `empresaId` explícito; nunca lo leen de la
  petición sin validarlo.
- El superadmin es la única excepción y no usa `tenantFilter`.

RLS se difiere hasta que exista autenticación y una revisión específica. El
motivo y el riesgo residual están en `CONSTRAINTS.md` y
`docs/risks-and-open-questions.md`.

## Salud

`GET /health` es dinámico y público. Ejecuta `SELECT 1` con timeout de 2 s y
devuelve:

- `200` con `status: "ok"` y `database.status: "up"` si PostgreSQL responde;
- `503` con `status: "degraded"` y `database.status: "down"` si no.

El payload nunca incluye la cadena de conexión, credenciales ni el error crudo.

## Verificación

- `npm test`: unitarios, sin base de datos. Excluye `*.db.test.ts`.
- `npm run test:db`: migra y ejecuta tests de integración reales en serie,
  dentro de transacciones con rollback. Cubre constraints, FKs y aislamiento
  entre dos empresas.
- `npm run lint`, `npm run typecheck`, `npm run build` e `init.sh` deben pasar
  sin PostgreSQL y sin `DATABASE_URL`.
