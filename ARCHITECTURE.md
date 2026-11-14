# Architecture

Estado actual: fundamento técnico con autenticación propia y superficie de
proveedor. La app es un monolito Next.js con App Router y una única superficie
de datos PostgreSQL. Existe login con email y contraseña, sesiones opacas
revocables, un panel privado mínimo y un panel de superadmin para planes, alta
de empresas e invitación de su administrador; todavía no hay roles ni dominio
operativo.

## Capas y dirección de dependencias

```txt
src/app/          rutas HTTP y páginas (borde de entrada)
  ├─ src/lib/     lógica de aplicación testeable sin servidor
  │    ├─ src/lib/auth/       autenticación y sesiones (server-only en current-session)
  │    └─ src/lib/superadmin/ autorización, planes, altas e invitaciones
  └─ src/db/      acceso a datos y contrato de tenant
       └─ src/generated/prisma/ cliente Prisma generado (no versionado)
```

- `src/db/client.ts` es el único punto de construcción del cliente Prisma.
- `src/lib/` no importa rutas de `src/app/`; las rutas dependen de `src/lib/`.
- El cliente generado se regenera con `npm run db:generate` y no se commitea.
- La lógica de credenciales y sesiones recibe el cliente Prisma explícito para
  poder probarse con transacciones y rollback.

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
- `empresas`: raíz del tenant; NIF único normalizado (`nif = upper(btrim(nif))`),
  `direccion_fiscal` nullable en BD (obligatoria al crear desde superadmin),
  email de facturación, FK `plan_id` con `ON DELETE/UPDATE RESTRICT`, estado
  `ACTIVA`/`SUSPENDIDA` e índice por plan.
- `usuarios`: email único global, `empresa_id` nullable con FK `Restrict`,
  `password_hash` nullable (invitados sin contraseña), estado
  `ACTIVO`/`INACTIVO`, `es_superadmin` e índice por empresa. Los CHECK
  garantizan email normalizado y que solo el superadmin tenga `empresa_id`
  nulo.
- `sesiones`: sesión opaca con FK `CASCADE` a `usuarios`, `token_hash` único,
  `creado_en`, `expira_en` y `revocada_en` nullable; índices por usuario y
  expiración y CHECK `expira_en > creado_en`. El token crudo nunca se guarda.
- `invitaciones`: invitación de administrador de empresa con FK `Restrict` a
  `empresas`, FK `CASCADE` a `usuarios`, enum `tipo_invitacion`, `token_hash`
  único, `creado_en`, `expira_en` y `aceptada_en` nullable; índices por
  empresa, usuario y expiración. CHECK de expiración posterior y aceptación no
  anterior a la creación. El estado (`Pendiente`/`Caducada`/`Aceptada`) es
  derivado y el token crudo solo viaja en una cookie flash de 60 s.

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
- El superadmin es la única excepción y no usa `tenantFilter`. Sus consultas
  cruzadas viven solo en `src/lib/superadmin/*` y siempre detrás de
  `requireSuperadmin`.

RLS se difiere hasta que exista autenticación y una revisión específica. El
motivo y el riesgo residual están en `CONSTRAINTS.md` y
`docs/risks-and-open-questions.md`.

## Superficie de proveedor

- `/superadmin` es privada y se protege en el layout y en cada página con
  `requireSuperadmin`. La regla es solo `es_superadmin = true` y
  `empresa_id` nulo; no hay tabla de roles.
- Un usuario autenticado sin `es_superadmin` recibe `403` mediante
  `forbidden()` (experimental `authInterrupts`) y `superadmin/forbidden.tsx`.
  El layout que ejecuta el guard vive en
  `src/app/superadmin/(protected)/layout.tsx` junto con las páginas, de modo
  que el `throw` ocurre por debajo del boundary de `forbidden.tsx`; las URLs
  públicas siguen siendo `/superadmin`, `/superadmin/empresas`,
  `/superadmin/planes`, etc. Lanzar `forbidden()` desde el layout del mismo
  segmento que define el boundary hace que Next use su 403 por defecto en
  inglés. Verificado en runtime con navegador real: 403 antes de streaming,
  `403 · No autorizado`, `Acceso restringido` y enlace a `/panel`.
- Un anónimo redirige a `/login?next=%2Fsuperadmin`. Los route handlers
  `/api/superadmin/*` comprueban mismo origen, aplican el mismo guard y solo
  aceptan `POST`; `GET` devuelve 405.
- Los planes son globales (`planes` no lleva `empresa_id`). Se pueden crear y
  editar con validación decimal, pero no borrar. Solo los planes activos se
  ofrecen en el alta.
- El alta de empresa, el usuario administrador `INACTIVO` sin contraseña y la
  invitación se crean en una única transacción. NIF y email se normalizan y se
  validan; NIF y email global son únicos. Cualquier fallo revierte las tres
  filas.
- La invitación dura 7 días y guarda solo el SHA-256 del token. Tras el alta,
  el token crudo se entrega en la cookie `central_invitacion` (`HttpOnly`,
  `SameSite=Strict`, `Path=/superadmin/empresas`, `Max-Age=60`) y el detalle lo
  muestra una sola vez como `/invitacion/<token>`. No se envía email real, no
  se guarda en URL ni logs y no hay reenvío ni recuperación.
- La aceptación de la invitación, el alta de contraseña y el login del invitado
  pertenecen a `company-admin-onboarding`. Roles, auditoría y facturación
  mensual siguen fuera de este slice.

## Autenticación y sesiones

La autenticación es propia; no se usa Auth.js. El objetivo es una sesión
opaca, persistida y revocable en servidor, compatible con el superadmin sin
empresa y con las futuras invitaciones y roles.

- **Contraseñas:** scrypt nativo versionado
  (`scrypt$v=1$N=131072,r=8,p=1$...`) con salt aleatorio y
  `timingSafeEqual`. Un email inexistente o un usuario sin `password_hash` se
  verifica contra un hash dummy para no revelar el motivo por tiempo.
- **Sesión:** token aleatorio de 32 bytes en `base64url`; en `sesiones` solo se
  guarda su SHA-256. La cookie `central_sesion` es `HttpOnly`,
  `SameSite=Lax`, `Path=/`, `Max-Age=43200` (12 h absolutas) y añade `Secure`
  cuando la petición llega por HTTPS.
- **Validación:** en cada petición privada se consulta la sesión con usuario y
  empresa. Una sesión caducada, revocada, con usuario `INACTIVO` o con empresa
  `SUSPENDIDA` no autentica. El superadmin se valida con `empresa_id` nulo.
- **Rutas:** públicas `/`, `/login`, `/health` y los endpoints de auth;
  privadas `/panel` y `/superadmin`. `/panel` llama a `requireSession`;
  `/superadmin` añade `requireSuperadmin`, que redirige a
  `/login?next=...` si no hay sesión y usa `forbidden()` si el usuario no es
  superadmin. `getCurrentSession` usa `cookies()` (asíncrona) y `cache()` de
  React.
- **Frontera de seguridad:** no hay middleware/proxy de autorización. Cada
  layout o página privada debe ejecutar `requireSession` en servidor; el
  middleware no puede validar de forma fiable una sesión de base de datos.
- **Login/logout:** `POST` con `application/x-www-form-urlencoded`, comprobación
  de mismo origen cuando llega `Origin`, 303 y `next` validado para evitar open
  redirects. Logout marca `revocada_en` y borra la cookie.

## Salud

`GET /health` es dinámico y público. Ejecuta `SELECT 1` con timeout de 2 s y
devuelve:

- `200` con `status: "ok"` y `database.status: "up"` si PostgreSQL responde;
- `503` con `status: "degraded"` y `database.status: "down"` si no.

El payload nunca incluye la cadena de conexión, credenciales ni el error crudo.

## Verificación

- `npm test`: unitarios, sin base de datos. Excluye `*.db.test.ts`.
- `npm run test:db`: migra y ejecuta tests de integración reales en serie,
  dentro de transacciones con rollback. Cubre constraints, FKs, aislamiento
  entre dos empresas, autenticación/sesiones y superadmin (planes, altas,
  duplicados, plan inactivo, token hasheado, estados de invitación y rollback).
- `npm run db:seed`: seed local idempotente con `tsx` (`prisma/seed.ts`).
  Requiere `SEED_*`, rechaza `NODE_ENV=production` y no forma parte de
  `init.sh` ni del gate.
- `npm run lint`, `npm run typecheck`, `npm run build` e `init.sh` deben pasar
  sin PostgreSQL y sin `DATABASE_URL`.
