# Feature Implementation Spec: Fundamento de base de datos multiempresa

## Source Feature

- `id`: `database-foundation`
- `area`: `foundation`
- `depends_on`: `bootstrap-web-app` (status `accepted` en `feature_list.json`)
- `status` en planificación: `not_started`
- `source`: `feature_list.json`
- Esta spec no modifica código ni estado; el implementador actualizará `feature_list.json` y `PROGRESS.md` con evidencia real.

## Implementation Findings (2026-11-13)

Hallazgos al implementar y cómo se adaptó la spec. No amplían alcance.

1. **No hay Docker en el entorno.** Se usa PostgreSQL 18.7 nativo en
   `localhost:5432`, servicio `postgresql-x64-18`, rol de aplicación `central`
   con `CREATEDB` y base `central_de_avisos`. No se crea `compose.yaml`; el
   arranque local está documentado en `README.md` y `AGENTS.md`. El rol con
   `CREATEDB` permite la shadow database de `prisma migrate dev`.
2. **Versión elegida: Prisma 7.10.1** (`prisma`, `@prisma/client` y
   `@prisma/adapter-pg`). Node 26.13.1 cumple el rango `>=24.0.0`. Prisma 7
   cambia el setup respecto al plan original:
   - requiere `prisma.config.ts` y ya no lee `.env` automáticamente; se carga
     con `dotenv/config`;
   - el generador por defecto es `prisma-client` y `output` es obligatorio; se
     usa `src/generated/prisma`, ignorado por git y ESLint;
   - `PrismaClient` exige un driver adapter; se usa `@prisma/adapter-pg`;
   - `migrate dev` ya no ejecuta `generate`, por eso `init.sh` y `postinstall`
     lo llaman explícitamente.
3. **URL opcional para permitir el gate sin BD.** `prisma.config.ts` solo
   declara `datasource.url` si `DATABASE_URL` existe. Así `prisma generate`,
   `npm run build` e `init.sh` funcionan sin `.env`; los comandos de migración
   fallan claro si falta la URL.
4. **`prisma migrate reset` tiene un guard para agentes IA.** Prisma 7.10.1
   bloquea el reset si detecta un agente. Para la verificación local se usó
   `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` con el consentimiento explícito
   del usuario y solo sobre la base de desarrollo. No ejecutarlo contra una base
   con datos reales.
5. **npm 11.20 avisa de install scripts no aprobados** (`prisma`,
   `@prisma/engines`). El binario del schema engine ya está en el paquete y
   `prisma generate`/`migrate` funcionaron; no se cambió la configuración de npm.

## Goal

Dejar PostgreSQL conectado, migraciones reproducibles desde una base vacía y las tablas base `planes`, `empresas` y `usuarios` con `empresa_id`, más el contrato de aislamiento multiempresa y la señal de base de datos en `/health`.

Debe permitir que `email-password-auth` y las features de dominio construyan sobre una persistencia estable sin rehacer el esquema ni descubrir tarde fugas entre empresas.

## Non-Goals

- Row Level Security (RLS) activa: se decide no implementarla ahora; queda como endurecimiento posterior justificado.
- Autenticación, contraseñas, sesiones, invitaciones, recuperación de contraseña o roles combinables.
- Tablas de dominio: clientes, sedes, contactos, avisos, partes, materiales, facturas, cuotas, auditoría, notificaciones o almacenamiento.
- Facturación, IVA, series, numeración, firma, PDF, VERIFACTU o datos sembrados.
- Pantallas de producto, componentes visuales o cambios en la home/diseño.
- Despliegue cloud, CI/CD, backups, retención, observabilidad avanzada o secretos de producción.
- Migración de datos existentes: el repositorio parte sin base de datos.

## Job Story

Cuando vaya a implementar autenticación y funcionalidad de tenant,
quiero un esquema migrado y un límite de acceso a datos que exija `empresa_id`,
para construir el dominio sin rehacer la persistencia ni exponer datos de otra empresa.

## Users And Permissions

- **Desarrollador/agente:** configura PostgreSQL local, aplica migraciones, ejecuta `test:db` y comprueba `/health`.
- **Ningún usuario de aplicación todavía:** no hay login ni roles; `/health` es público y no debe revelar la cadena de conexión ni detalles internos del error.
- **Contrato futuro:** usuario de empresa con `empresa_id` obligatorio; superadmin con `empresa_id` nulo y `es_superadmin = true`. La coherencia se valida en base de datos desde esta feature.

## Acceptance Scenarios

- **Scenario 1 — Migraciones desde base vacía:** dada una base PostgreSQL vacía y `DATABASE_URL` configurada, cuando ejecuto `npm run db:deploy` y después `npm run db:status`, entonces se crean `planes`, `empresas` y `usuarios` y no quedan migraciones pendientes.
- **Scenario 2 — Reproducibilidad:** dada una base local migrada, cuando ejecuto `npm run db:reset` y repito `db:deploy` y `db:status`, entonces el esquema se reconstruye desde cero sin pasos manuales.
- **Scenario 3 — Salud arriba:** dada la app arrancada con `DATABASE_URL` válida, cuando abro `/health`, entonces recibo 200 con `status: "ok"` y `database.status: "up"`, sin credenciales.
- **Scenario 4 — Salud abajo:** dada la app arrancada y PostgreSQL detenido, cuando abro `/health`, entonces recibo 503 con `status: "degraded"` y `database.status: "down"`; la app no se cae y no filtra la conexión.
- **Scenario 5 — Restricciones:** dada una base migrada, cuando inserto un no-superadmin sin `empresa_id`, un superadmin con `empresa_id`, un usuario con empresa inexistente o un email duplicado, entonces PostgreSQL rechaza cada inserción.
- **Scenario 6 — Alcance:** dadas dos empresas A y B con usuarios propios, cuando consulto con `tenantFilter(A)`, entonces solo aparecen los de A; si falta `empresa_id`, `requireEmpresaId` lanza antes de consultar.
- **Scenario 7 — Sin BD:** dado un clon sin PostgreSQL, cuando ejecuto `npm run build` e `init.sh`, entonces lint, typecheck, tests unitarios y build pasan; `init.sh` no arranca servicios y solo imprime instrucciones de BD.

## Repository Research

### Files Inspected

- `AGENTS.md`, `PROGRESS.md`, `feature_list.json` — workflow, estado y alcance de la feature.
- `docs/specs/bootstrap-web-app.md` — formato de spec y estado real del bootstrap.
- `CONTEXT.md`, `docs/build-brief.md`, `docs/domain-model.md` — tenant, plan, usuario y límites del MVP.
- `docs/user-and-access-model.md` — email único global, pertenencia a empresa y excepción superadmin.
- `docs/technical-discovery.md`, `docs/risks-and-open-questions.md` — PostgreSQL, decisión ORM/RLS y riesgo de fuga.
- `package.json`, `package-lock.json` — Next.js 16.4.6, React 19.3.1, TypeScript 5.9.3, Vitest 5.1.0 y scripts actuales.
- `tsconfig.json`, `vitest.config.ts`, `eslint.config.mjs` — TypeScript estricto, alias `@/*`, Vitest Node y lint.
- `src/lib/health.ts`, `src/lib/health.test.ts`, `src/app/health/route.ts` — payload y endpoint de salud actuales.
- `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css` — home y tokens visuales.
- `init.sh`, `README.md`, `.gitignore`, `next.config.ts` — gate, documentación y configuración.

### Existing Patterns To Follow

- npm y `package-lock.json`; scripts de `package.json` para todo el ciclo.
- TypeScript estricto, alias `@/*` y lógica de servidor bajo `src/`.
- Vitest en entorno Node; no hay Playwright ni harness E2E.
- `init.sh` es el camino no bloqueante: instala, ejecuta lint/typecheck/tests/build y no arranca servidor.
- `.env` y `.env.*` ya están ignorados; `.env.example` está permitido.
- Documentación en español; `docs/adr/` no existe.
- `/health` ya es dinámico (`force-dynamic`) y su payload es una función pura testeable.

### Current Gaps

- No hay PostgreSQL, ORM, cliente de base de datos, esquema, migraciones ni `.env.example`.
- No hay `compose.yaml` ni servicio local de base de datos.
- `/health` no comprueba la base de datos.
- `vitest.config.ts` no separa tests unitarios de integración con base de datos.
- No existe convención de acceso a datos con `empresa_id` ni tests de aislamiento.

### Open Unknowns

- ~~Versión exacta de Prisma y `@prisma/client`~~: resuelto en implementación con 7.10.1.
- ~~Disponibilidad de Docker~~: no hay Docker; se usa PostgreSQL nativo y se descarta `compose.yaml`.
- ~~Versión de PostgreSQL local~~: resuelto con PostgreSQL 18.7 nativo; `gen_random_uuid()` disponible.
- ~~Prisma puede requerir un `output` distinto~~: resuelto; cliente en `src/generated/prisma`, ignorado por git y ESLint.
- ~~Compatibilidad de Node 26~~: resuelto; generate, migraciones, tests y build verificados con Node 26.13.1.
- El planner no tenía shell; la evidencia real está en `feature_list.json` y `PROGRESS.md`.

## Technical Approach

1. **ORM: Prisma.** `prisma/schema.prisma`, migraciones SQL versionadas y `@prisma/client` generado. `migrate deploy` aplica un historial reproducible sobre base vacía; `migrate status` y `migrate reset` permiten verificar; el esquema tipado reduce divergencias con TypeScript. Drizzle era válido, pero Prisma ofrece un ciclo de migración/reset más explícito para esta base inicial. Versión fijada al instalar y registrada en evidencia.

2. **Aislamiento: filtros de aplicación, sin RLS en esta feature.** Toda tabla de tenant lleva `empresa_id` y las consultas pasan por `src/db/tenant.ts`: `requireEmpresaId(valor)` lanza si falta contexto, `tenantFilter(empresaId)` devuelve el filtro Prisma obligatorio y `assertTenantAccess(recursoEmpresaId, contextoEmpresaId)` protege un recurso concreto. Los repositorios futuros reciben `empresaId` explícito. No se activa RLS ahora porque no existe contexto de auth/superadmin, login necesitaría funciones `SECURITY DEFINER` o roles de bypass, Prisma con pooling exige `set_config` por transacción y `docs/technical-discovery.md` admite filtros con pruebas. **Riesgo aceptado:** una consulta sin filtro podría filtrar datos; se mitiga con capa única, tests y regla durable en `CONSTRAINTS.md`. RLS se reevalúa antes de producción o al añadir la primera tabla operativa con consultas cruzadas.

3. **Esquema base.** Modelos Prisma PascalCase; tablas/columnas snake_case con `@@map`/`@map`; UUID `@db.Uuid` con `gen_random_uuid()` de base de datos. `planes` es global y `empresas` es la raíz del tenant; `usuarios` lleva `empresa_id`.
   - `planes`: `id`, `nombre` único, `importe_mensual decimal(12,2)` con check `>= 0`, `activo`, timestamps.
   - `empresas`: `id`, `nombre`, `nif` único, `email_facturacion`, `plan_id` FK `Restrict`, `estado` (`ACTIVA`/`SUSPENDIDA`, default `ACTIVA`), timestamps e índice por `plan_id`.
   - `usuarios`: `id`, `empresa_id` nullable FK `Restrict`, `email` único, `nombre`, `estado` (`ACTIVO`/`INACTIVO`, default `ACTIVO`), `es_superadmin` default `false`, timestamps e índice por `empresa_id`.
   - Checks SQL: `email = lower(btrim(email))`; `(es_superadmin AND empresa_id IS NULL) OR (NOT es_superadmin AND empresa_id IS NOT NULL)`. No se crea `password_hash`, roles, sesiones, invitaciones ni relaciones de dominio.

4. **Migraciones y scripts.** `migrate dev --name init` genera la inicial; una segunda `--create-only --name constraints` añade los CHECK. Scripts: `db:generate`, `db:migrate`, `db:deploy`, `db:status`, `db:reset` y `test:db`. Prohibido `db push` para cambios compartidos. `postinstall: prisma generate` y `init.sh` ejecutan generate para que el cliente exista.

5. **Salud.** `src/db/client.ts` expone un singleton perezoso (`getDb()`) para que `next build` no exija `DATABASE_URL`. `src/lib/db-health.ts` ejecuta `SELECT 1` con timeout de 2 s. `/health` devuelve 200 `{ status: "ok", database: { status: "up" } }` o 503 `{ status: "degraded", database: { status: "down" } }`, manteniendo `service` y `timestamp`; nunca incluye el error crudo. Esto sustituye el escenario de bootstrap “sin depender de base de datos”.

6. **Tests de base de datos.** `npm test` sigue unitario y sin BD. `*.db.test.ts` se excluye de `vitest.config.ts`; `vitest.db.config.ts` los ejecuta en serie, carga `.env` (por ejemplo `dotenv/config`) y falla claro si falta `DATABASE_URL`. `test:db` = `prisma migrate deploy && vitest run --config vitest.db.config.ts`. Los tests usan transacción Prisma con rollback y comprueban constraints, FKs, email único, coherencia superadmin/empresa y `tenantFilter`.

## Expected File Changes

- `package.json`, `package-lock.json` — modify; Prisma, `@prisma/client`, `dotenv` de test, scripts `db:*`/`test:db` y `postinstall`.
- `prisma/schema.prisma` — create; modelos, enums, mappings, FKs e índices.
- `prisma/migrations/<timestamp>_init/migration.sql` — create; tablas, índices y FKs.
- `prisma/migrations/<timestamp>_constraints/migration.sql` — create; CHECKs SQL.
- ~~`compose.yaml`~~ — no se crea; no hay Docker. `.env.example` — create; `DATABASE_URL` de ejemplo.
- `prisma.config.ts` — create (hallazgo Prisma 7); configuración de esquema, migraciones y URL.
- `src/db/db-test-setup.ts`, `src/db/db-test-utils.ts` — create; carga de `.env`, rollback de tests y utilidades.
- `src/db/client.ts`, `src/db/tenant.ts` — create; singleton perezoso y contrato de tenant.
- `src/db/tenant.test.ts`, `src/db/schema.db.test.ts`, `src/db/tenant-isolation.db.test.ts` — create; unitarios y constraints/aislamiento.
- `src/lib/db-health.ts` — create; `SELECT 1` con timeout.
- `src/lib/health.ts`, `src/lib/health.test.ts`, `src/app/health/route.ts` — modify; estado de BD y 200/503.
- `vitest.config.ts` — modify; excluir `*.db.test.ts`; `vitest.db.config.ts` — create; integración serial.
- `init.sh` — modify; `db:generate` y mensajes de BD, sin arrancar servicios.
- `next.config.ts` — modify solo si el build requiere `serverExternalPackages` para Prisma; no por defecto.
- `.gitignore` — modify; ignorar cliente Prisma generado si tiene `output` en el repo; `eslint.config.mjs` solo si cae en `src/`.
- `README.md`, `AGENTS.md`, `ARCHITECTURE.md`, `CONSTRAINTS.md`, `docs/technical-discovery.md`, `docs/risks-and-open-questions.md` — create/update según la sección de documentación.
- `PROGRESS.md`, `feature_list.json` — modify al implementar; no en esta planificación.

No tocar `src/app/page.tsx`, `src/app/layout.tsx` ni `src/app/globals.css`.

## Visual Design Impact

- UI involved: no.
- Design source: no aplica.
- Screens or states affected: solo el JSON de `/health`; la home no cambia.
- New design artifact required: no; el campo `database` no debe revelar credenciales ni trazas internas.

## Durable Documentation Impact

- `ARCHITECTURE.md`: create — capa de datos, Prisma, migraciones, contrato de tenant, salud y decisión de no usar RLS todavía.
- `CONSTRAINTS.md`: create — MUST toda consulta a tabla de tenant pasa por `tenantFilter`/`requireEmpresaId`; MUST toda evolución usa migraciones; MUST NOT `db push` en entornos compartidos; MUST NOT commitear `.env` ni cliente generado; RLS diferida y motivo.
- `AGENTS.md`: update — requisitos PostgreSQL, scripts `db:*`, `test:db`, nuevo `/health` y comportamiento de `init.sh`.
- `README.md`: update — arranque de PostgreSQL, `.env.example`, migraciones, `test:db` y salud.
- `docs/technical-discovery.md`: update — confirmar Prisma y filtros de aplicación; retirar decisión pendiente de ORM.
- `docs/risks-and-open-questions.md`: update — resolver la pregunta de aislamiento y registrar el riesgo residual de RLS diferida.
- `docs/domain-model.md`, `CONTEXT.md`, `DESIGN.md`: not needed — no cambia lenguaje, dominio ni dirección visual.
- `PROGRESS.md`, `feature_list.json`: update al implementar — obligatorio por la definición de terminado.

## Implementation Plan

1. Confirmar PostgreSQL nativo (sin Docker), instalar Prisma 7, `@prisma/client` y `@prisma/adapter-pg`; crear `.env.example`, `.env` local y `prisma.config.ts`.
2. Escribir `prisma/schema.prisma` con `planes`, `empresas`, `usuarios`, enums, mappings, FKs e índices.
3. Generar migración inicial y migración SQL de constraints; aplicarlas sobre base vacía.
4. Implementar `src/db/client.ts`, `src/db/tenant.ts`, `src/lib/db-health.ts` y actualizar `/health`.
5. Configurar `vitest.db.config.ts`, excluir tests de BD del gate unitario y escribir tests de constraints/aislamiento.
6. Actualizar `init.sh`, `package.json`, `.gitignore` y configuración de lint/Next solo si es necesario.
7. Ejecutar migraciones desde cero, `test:db`, gate y smoke de salud; actualizar documentación, `PROGRESS.md` y `feature_list.json`.

## Implementation Tasks

- [x] Verificar PostgreSQL nativo y registrar versión (18.7); documentar el arranque local sin Docker.
- [x] Crear `.env.example`, `.env` local y `prisma.config.ts` con `DATABASE_URL` (sin `compose.yaml`).
- [x] Instalar Prisma 7.10.1, `@prisma/client` y `@prisma/adapter-pg`; fijar versiones y añadir scripts `db:*`, `test:db` y `postinstall`.
- [x] Crear `prisma/schema.prisma` con modelos, enums, mappings, FKs e índices.
- [x] Generar migraciones `init` y `constraints` con los CHECK SQL.
- [x] Implementar `src/db/client.ts`, `src/db/tenant.ts` y `src/lib/db-health.ts`.
- [x] Actualizar `src/lib/health.ts`, `health.test.ts` y `src/app/health/route.ts`.
- [x] Crear `vitest.db.config.ts`, `schema.db.test.ts` y `tenant-isolation.db.test.ts`; excluir `*.db.test.ts` del gate unitario.
- [x] Actualizar `init.sh` para generar el cliente y mantener el gate sin arrancar PostgreSQL ni servidor.
- [x] Ejecutar `db:deploy` en base vacía, `db:reset`, `db:status`, `test:db`, gate completo e `init.sh` con y sin BD.
- [x] Actualizar documentación durable, `PROGRESS.md` y `feature_list.json` con evidencia.

## Verification Plan

### Base de datos

Con PostgreSQL 18.7 nativo ya iniciado en `localhost:5432` (sin Docker):

```powershell
$env:Path = "C:\Program Files\PostgreSQL\18\bin;" + $env:Path
psql "postgresql://central:central@localhost:5432/postgres" -c "CREATE DATABASE central_de_avisos_verify;"
```

```bash
cp .env.example .env
npm run db:deploy
npm run db:status
npm run test:db
# db:reset requiere consentimiento explícito por el guard de Prisma 7 para agentes IA
npm run db:reset
npm run db:deploy
npm run db:status
```

Base realmente vacía (usar la URL de verificación en la sesión):

```bash
DATABASE_URL="postgresql://central:central@localhost:5432/central_de_avisos_verify?schema=public" npm run db:deploy
DATABASE_URL="postgresql://central:central@localhost:5432/central_de_avisos_verify?schema=public" npm run db:status
psql "postgresql://central:central@localhost:5432/postgres" -c "DROP DATABASE central_de_avisos_verify;"
```

Resultado esperado: migraciones aplicadas sin pasos manuales, estado “up to date”, constraints y aislamiento en verde.

### Gate estándar

```bash
npm run lint
npm run typecheck
npm test
npm run build
& "C:\Program Files\Git\bin\bash.exe" init.sh
```

`init.sh` debe ejecutar `npm run db:generate` y el gate actual, no arrancar PostgreSQL ni `npm run dev`, y terminar en verde incluso sin `DATABASE_URL`. Imprimirá los comandos manuales de BD y desarrollo.

### Salud manual

```bash
npm run dev
```

- Con PostgreSQL levantado: `http://localhost:3000/health` devuelve 200 con `database.status: "up"`.
- Para simular la base inaccesible sin parar el servicio del sistema, arranca el
  servidor con
  `DATABASE_URL="postgresql://central:central@localhost:5999/central_de_avisos?schema=public"`;
  `/health` devuelve 503 con `status: "degraded"` y `database.status: "down"`,
  sin credenciales.
- Con la URL válida vuelve a 200. Detener el servidor al terminar.

### E2E

No se añade Playwright: no hay flujo de usuario, auth, routing nuevo ni UI; la verificación es unitaria (contrato de tenant y payload) e integración real contra PostgreSQL. La primera feature con flujo de usuario introducirá E2E.

## Evidence To Capture

- Versiones de Node, npm, Prisma, `@prisma/client`, PostgreSQL nativo y `DATABASE_URL` usada (sin secretos reales).
- Nombres de migraciones y salida de `npm run db:status`.
- Salida de `npm run test:db` con constraints y aislamiento entre dos empresas.
- Salida de `db:deploy` sobre base vacía y de `db:reset`.
- Payload real de `/health` con BD arriba (200) y abajo (503).
- Salida con código 0 de lint, typecheck, test, build e `init.sh`; confirmación de que no arranca servicios.
- Documentación durable actualizada y decisión RLS registrada.
- Entrada en `PROGRESS.md` y `feature_list.json` con `status: "passing"` y evidencia, o `blocked` con motivo.

## Validator Checklist

- [ ] `planes`, `empresas` y `usuarios` existen con campos, enums, mappings, FKs e índices descritos.
- [ ] `usuarios.empresa_id` solo es nullable para superadmin y la coherencia se valida en BD.
- [ ] Email único, email normalizado, importe de plan no negativo y FKs `Restrict` están probados.
- [ ] `db:deploy` funciona sobre base vacía y `db:reset` reconstruye el esquema sin pasos manuales.
- [ ] `tenantFilter`/`requireEmpresaId`/`assertTenantAccess` existen y sus tests impiden lecturas cruzadas.
- [ ] `/health` informa de PostgreSQL con 200/503 sin filtrar secretos.
- [ ] `npm run build` e `init.sh` funcionan sin BD; `init.sh` no arranca servicios de larga duración.
- [ ] No se ha implementado auth, roles, dominio completo, facturación, seeds, RLS ni UI nueva.
- [ ] Decisión Prisma + filtros justificada; RLS diferida con riesgo y trigger registrados.
- [ ] Documentación durable, `PROGRESS.md` y `feature_list.json` actualizados con evidencia real.
- [ ] No se ha commiteado `.env`, credenciales reales ni cliente Prisma generado.
