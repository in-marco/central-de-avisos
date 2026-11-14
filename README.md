# central-de-avisos

Central de avisos para empresas de servicios con técnicos de campo: avisos,
partes y facturación en modo NO-VERIFACTU firmado (MVP).

Estado actual: fundamento técnico con autenticación propia y panel de
proveedor. La app Next.js arranca, PostgreSQL está conectado mediante Prisma y
existen login con email y contraseña, sesiones revocables, un panel privado
con navegación por permisos, roles de empresa combinables gestionados por el
administrador y una superficie de superadmin para planes, alta de empresas e
invitación de administradores. Todavía no hay dominio operativo.

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

El seed usa `tsx`, es idempotente y lee `SEED_ADMIN_*`, `SEED_SUPERADMIN_*` y
`SEED_EQUIPO_PASSWORD` (más `SEED_OFICINA_EMAIL`, `SEED_TECNICO_EMAIL` y
`SEED_ENCARGADO_EMAIL`, opcionales) de `.env`. Rechaza ejecutarse con
`NODE_ENV=production`. Las contraseñas de ejemplo de `.env.example` son solo
para desarrollo local: cámbialas en tu `.env` y no las reutilices fuera de
local.

Con el seed aplicado, los usuarios demo son:

| Email | Roles | Contraseña |
| --- | --- | --- |
| `admin@demo.local` | Administrador | `SEED_ADMIN_PASSWORD` |
| `oficina@demo.local` | Oficina | `SEED_EQUIPO_PASSWORD` |
| `tecnico@demo.local` | Técnico | `SEED_EQUIPO_PASSWORD` |
| `encargado@demo.local` | Administrador + Técnico | `SEED_EQUIPO_PASSWORD` |
| `superadmin@demo.local` | Proveedor SaaS (sin roles de empresa) | `SEED_SUPERADMIN_PASSWORD` |

Cada ejecución del seed restaura esos roles y la facturación de Empresa Demo
(serie `F`, tarifa `45,00 €/h`, modo `NO_VERIFACTU`). El seed localiza Empresa
Demo por el NIF `B12345678`; si lo cambias desde `/panel/empresa`, restáuralo
antes de volver a sembrar. Inicia sesión en
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
- La facturación mensual queda fuera de este slice.

## Roles y permisos

Los usuarios de empresa tienen roles combinables (`Administrador`, `Oficina`,
`Técnico`) y sus permisos se suman según la matriz de
`docs/user-and-access-model.md`, implementada en
`src/lib/authz/permissions.ts`. Los roles se leen de la base de datos en cada
petición: un cambio surte efecto sin volver a iniciar sesión.

- La navegación del panel muestra «Inicio» a todos, «Usuarios» y «Empresa»
  solo a quien puede gestionar usuarios o configurar la empresa (rol
  Administrador) y «Panel de proveedor» solo al superadmin. Ocultar
  no es la defensa: cada página y acción se autoriza en servidor.
- `/panel/usuarios` (rol Administrador) lista los usuarios de la empresa y
  permite cambiar sus roles. No se puede dejar a un usuario sin roles, quitarse
  el propio rol de administrador ni dejar a la empresa sin administradores
  activos.
- Oficina, técnico, un usuario sin roles y el superadmin reciben 403 en
  `/panel/usuarios` y en `POST /api/panel/usuarios/roles`; un anónimo va al
  login.
- Fuera de este slice: rol Cliente y portal, invitar o desactivar usuarios de
  empresa y auditoría de los cambios de rol.

## Configuración de la empresa

`/panel/empresa` (solo rol Administrador, permiso `empresa.configurar`) edita
la razón social, el NIF, la dirección fiscal, el email de facturación, la serie
de factura, la tarifa horaria por defecto (sin IVA) y el modo fiscal.

- El NIF se guarda en mayúsculas y sin espacios, el email en minúsculas y la
  serie en mayúsculas (hasta 10 caracteres: letras, números y guion). La
  tarifa admite coma o punto, hasta dos decimales, y debe ser mayor que 0 y
  como máximo 9999,99.
- Solo existe el modo NO-VERIFACTU; VERIFACTU aparece deshabilitado y el
  servidor y la base de datos lo rechazan.
- Si falta la serie o la tarifa, la página muestra «Pendiente de configurar».
- Un NIF que ya usa otra empresa se rechaza con un mensaje genérico. Tras un
  error se vuelven a mostrar los valores guardados.
- Oficina, técnico, un usuario sin roles y el superadmin reciben 403 en la
  página y en `POST /api/panel/empresa`; un anónimo va al login.
- Fuera de este slice: numeración de facturas, IVA configurable, tarifas por
  cliente y auditoría de los cambios.

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
- Usuarios y roles: <http://localhost:3000/panel/usuarios> (solo administrador)
- Configuración de empresa: <http://localhost:3000/panel/empresa> (solo
  administrador)
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
caducidad, revocación y token hasheado), superadmin (planes, altas,
duplicados, plan inactivo, invitación hasheada, estados y rollback) y roles
(CHECK, validaciones, aislamiento y último administrador en concurrencia) y
configuración de facturación (columnas, enum, CHECK de serie y tarifa,
normalización, NIF duplicado y aislamiento).

Smoke HTTP con `next start` (Git Bash; `SMOKE_*` opcionales para las
comprobaciones autenticadas por rol):

```bash
SMOKE_PORT=3100 \
SMOKE_EMAIL=superadmin@demo.local SMOKE_PASSWORD=... \
SMOKE_NORMAL_EMAIL=admin@demo.local SMOKE_NORMAL_PASSWORD=... \
SMOKE_OFICINA_EMAIL=oficina@demo.local SMOKE_OFICINA_PASSWORD=... \
SMOKE_TECNICO_EMAIL=tecnico@demo.local SMOKE_TECNICO_PASSWORD=... \
bash scripts/validate-smoke.sh
```

## Estructura

- `src/app/` — rutas de Next.js (App Router).
- `src/app/health/route.ts` — endpoint `GET /health`.
- `src/app/login/` — formulario de login server-rendered.
- `src/app/panel/` — layout con navegación por permisos, panel, `usuarios/`
  (roles), `empresa/` (configuración de facturación) y `forbidden.tsx` (403
  propio).
- `src/app/api/panel/usuarios/roles/` — `POST` de cambio de roles.
- `src/app/api/panel/empresa/` — `POST` de configuración de la empresa.
- `src/lib/authz/` — matriz de permisos, navegación y guards
  (`requirePermission`, `authorizeCompanyRequest`).
- `src/lib/empresa/` — usuarios de la empresa, cambio transaccional de roles y
  configuración de facturación (validación pura y repositorio).
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
