# central-de-avisos

Central de avisos para empresas de servicios con técnicos de campo: avisos,
partes y facturación en modo NO-VERIFACTU firmado (MVP).

Estado actual: fundamento técnico con autenticación propia y panel de
proveedor. La app Next.js arranca, PostgreSQL está conectado mediante Prisma y
existen login con email y contraseña, sesiones revocables, un panel privado
mínimo y una superficie de superadmin para planes, alta de empresas e
invitación de administradores. Todavía no hay roles ni dominio operativo.

## Requisitos

- Node.js LTS (probado con 26.13.1; `.nvmrc` fija la versión 26).
- npm (probado con 11.20.0).
- PostgreSQL accesible para desarrollo y tests de integración (probado con
  PostgreSQL 18.7 nativo en Windows). No hace falta Docker.

En Windows, si el PATH no incluye Node.js:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
```

## Instalación

```bash
npm ci
```

`postinstall` ejecuta `prisma generate`. Si no existe `package-lock.json` o se
han cambiado dependencias:

```bash
npm install
```

## Base de datos local

1. Crea un rol y una base de datos en tu PostgreSQL local. Con el rol de
   aplicación `central` (permiso `CREATEDB`) y la base `central_de_avisos`:

   ```sql
   CREATE ROLE central LOGIN PASSWORD 'central' CREATEDB;
   CREATE DATABASE central_de_avisos OWNER central;
   ```

2. Copia el entorno de ejemplo y ajusta la URL si hace falta:

   ```bash
   cp .env.example .env
   ```

   `.env` está ignorado por git. La URL local esperada es:

   ```txt
   postgresql://central:central@localhost:5432/central_de_avisos?schema=public
   ```

3. Aplica y comprueba las migraciones:

   ```bash
   npm run db:deploy
   npm run db:status
   ```

Otros comandos:

| Comando | Uso |
| --- | --- |
| `npm run db:generate` | Regenera el cliente Prisma en `src/generated/prisma`. |
| `npm run db:migrate` | Crea/aplica una migración en desarrollo. |
| `npm run db:deploy` | Aplica migraciones pendientes (camino compartido). |
| `npm run db:status` | Muestra el estado del historial. |
| `npm run db:reset` | Reconstruye la base local desde cero. |
| `npm run db:seed` | Crea datos demo locales idempotentes (nunca en producción). |
| `npm run test:db` | Migra y ejecuta tests de integración reales. |

No usar `prisma db push` para cambios compartidos; ver `CONSTRAINTS.md`.

## Autenticación local

Tras aplicar las migraciones, crea los datos demo:

```bash
npm run db:seed
```

El seed usa `tsx`, es idempotente y lee `SEED_ADMIN_*` y
`SEED_SUPERADMIN_*` de `.env`. Rechaza ejecutarse con `NODE_ENV=production`.
Las contraseñas de ejemplo de `.env.example` son solo para desarrollo local:
cámbialas en tu `.env` y no las reutilices fuera de local.

Con el seed aplicado, los usuarios demo son `admin@demo.local` (empresa) y
`superadmin@demo.local` (proveedor SaaS). Inicia sesión en
<http://localhost:3000/login> y abre <http://localhost:3000/panel>.

- La cookie `central_sesion` es `HttpOnly`, `SameSite=Lax`, dura 12 h y solo se
  guarda hasheada en la tabla `sesiones`.
- `POST /api/auth/logout` revoca la sesión actual y borra la cookie.
- `/panel` exige sesión en servidor; sin sesión redirige a
  `/login?next=%2Fpanel`.
- Un usuario `INACTIVO`, una empresa `SUSPENDIDA`, una sesión caducada o una
  revocada no autentican.
- El rate limiting durable queda pendiente antes de exponer el login fuera de
  demo/producción; ver `docs/risks-and-open-questions.md`.

## Panel de proveedor

Con el seed aplicado, `superadmin@demo.local` puede abrir
<http://localhost:3000/superadmin>. La entrada solo está disponible para
`es_superadmin` con `empresa_id` nulo; un usuario de empresa recibe 403 y un
anónimo va al login.

- `/superadmin/planes` lista, crea y edita planes globales. El importe admite
  coma o punto y hasta dos decimales; no se borran planes y solo los activos se
  ofrecen en nuevas empresas.
- `/superadmin/empresas` lista las empresas con su plan, importe, estado y la
  invitación de su administrador.
- `/superadmin/empresas/nueva` da de alta la empresa, su administrador
  `INACTIVO` sin contraseña y una invitación de 7 días en una sola transacción.
  NIF y email se normalizan; NIF y email global son únicos.
- Tras el alta, el detalle muestra una sola vez el enlace
  `/invitacion/<token>` desde una cookie flash de 60 s. No se envía email real,
  no se guarda el token crudo y el enlace no se puede recuperar.
- Roles y facturación mensual quedan fuera de este slice.

## Activación del administrador invitado

El administrador abre el enlace `/invitacion/<token>` que muestra el detalle de
la empresa, ve su empresa y su email, y elige una contraseña de 12 a 128
caracteres. Al activar la cuenta entra directamente en `/panel` con una sesión
de su empresa; después usa `/login` con normalidad.

- El enlace es de un solo uso. Si ya se usó, caducó (7 días) o la empresa está
  suspendida, la página lo indica y no activa la cuenta.
- Un enlace desconocido responde 404 sin revelar datos.
- No hay reenvío ni regeneración de invitaciones: si el enlace se pierde o
  caduca, hoy no se puede emitir otro desde la interfaz.

## Desarrollo

```bash
npm run dev
```

- Home: <http://localhost:3000/>
- Login: <http://localhost:3000/login>
- Panel privado: <http://localhost:3000/panel> (requiere sesión)
- Panel de proveedor: <http://localhost:3000/superadmin> (solo superadmin)
- Empresas: <http://localhost:3000/superadmin/empresas>
- Planes: <http://localhost:3000/superadmin/planes>
- Activación de invitado: `http://localhost:3000/invitacion/<token>` (enlace
  mostrado tras el alta de empresa)
- Salud: <http://localhost:3000/health>

`GET /health` comprueba PostgreSQL con un timeout de 2 s:

- 200 si la base responde:

  ```json
  {
    "status": "ok",
    "service": "central-de-avisos",
    "timestamp": "2026-11-13T10:00:00.000Z",
    "database": { "status": "up" }
  }
  ```

- 503 si no responde:

  ```json
  {
    "status": "degraded",
    "service": "central-de-avisos",
    "timestamp": "2026-11-13T10:00:00.000Z",
    "database": { "status": "down" }
  }
  ```

El endpoint no incluye credenciales ni el error crudo.

## Verificación

Gate estándar (no necesita base de datos):

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

El camino estándar de arranque y verificación es `init.sh`; genera el cliente
Prisma, instala dependencias si faltan y ejecuta lint, typecheck, tests y build
sin arrancar PostgreSQL ni un servidor de larga duración.

En Windows, con Git Bash:

```bash
& "C:\Program Files\Git\bin\bash.exe" init.sh
```

Tests de integración con PostgreSQL real:

```bash
npm run test:db
```

Se ejecutan en serie dentro de transacciones con rollback y cubren constraints,
FKs, aislamiento entre dos empresas, autenticación (credenciales, estados,
caducidad, revocación y token hasheado) y superadmin (planes, altas,
duplicados, plan inactivo, invitación hasheada, estados y rollback).

## Estructura

- `src/app/` — rutas de Next.js (App Router).
- `src/app/health/route.ts` — endpoint `GET /health`.
- `src/app/login/` — formulario de login server-rendered.
- `src/app/panel/` — layout protegido y panel mínimo.
- `src/app/api/auth/` — route handlers de login y logout (`POST`).
- `src/lib/auth/` — hash scrypt, tokens, sesiones, cookie, same-origin y
  validación de `next`.
- `src/app/superadmin/` — `(protected)/` con layout, empresas, planes, detalle
  y componentes; `forbidden.tsx` queda por encima del layout que ejecuta el
  guard.
- `src/app/api/superadmin/` - mutaciones `POST` de empresas y planes.
- `src/lib/superadmin/` - autorización, validación, planes, altas transaccionales e invitaciones.
- `src/lib/health.ts` — construcción del payload de salud.
- `src/lib/db-health.ts` — comprobación `SELECT 1` con timeout.
- `src/db/client.ts` — cliente Prisma perezoso con driver adapter `pg`.
- `src/db/tenant.ts` — contrato de aislamiento (`requireEmpresaId`,
  `tenantFilter`, `assertTenantAccess`).
- `src/generated/prisma/` — cliente Prisma generado (ignorado por git).
- `prisma/schema.prisma` — modelos base y sesiones.
- `prisma/seed.ts` — seed demo idempotente con `tsx`.
- `prisma/migrations/` — migraciones SQL versionadas.
- `prisma.config.ts` — configuración de Prisma 7 y URL de migración.

La arquitectura y las reglas durables están en `ARCHITECTURE.md` y
`CONSTRAINTS.md`. La documentación de producto y dominio está en `AGENTS.md`,
`CONTEXT.md` y `docs/`.
