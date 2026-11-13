# central-de-avisos

Central de avisos para empresas de servicios con técnicos de campo: avisos,
partes y facturación en modo NO-VERIFACTU firmado (MVP).

Estado actual: fundamento técnico. La app Next.js arranca, PostgreSQL está
conectado mediante Prisma y existen las tablas base `planes`, `empresas` y
`usuarios`. Todavía no hay autenticación ni dominio funcional.

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
| `npm run test:db` | Migra y ejecuta tests de integración reales. |

No usar `prisma db push` para cambios compartidos; ver `CONSTRAINTS.md`.

## Desarrollo

```bash
npm run dev
```

- Home: <http://localhost:3000/>
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
FKs y aislamiento entre dos empresas.

## Estructura

- `src/app/` — rutas de Next.js (App Router).
- `src/app/health/route.ts` — endpoint `GET /health`.
- `src/lib/health.ts` — construcción del payload de salud.
- `src/lib/db-health.ts` — comprobación `SELECT 1` con timeout.
- `src/db/client.ts` — cliente Prisma perezoso con driver adapter `pg`.
- `src/db/tenant.ts` — contrato de aislamiento (`requireEmpresaId`,
  `tenantFilter`, `assertTenantAccess`).
- `src/generated/prisma/` — cliente Prisma generado (ignorado por git).
- `prisma/schema.prisma` — modelos base.
- `prisma/migrations/` — migraciones SQL versionadas.
- `prisma.config.ts` — configuración de Prisma 7 y URL de migración.

La arquitectura y las reglas durables están en `ARCHITECTURE.md` y
`CONSTRAINTS.md`. La documentación de producto y dominio está en `AGENTS.md`,
`CONTEXT.md` y `docs/`.
