# Project Agent Instructions

Este repositorio contiene una central de avisos multiempresa para empresas de servicios con técnicos de campo: avisos, partes y facturación en modo NO-VERIFACTU firmado.

## Read First

- `CONTEXT.md` — lenguaje de dominio: aviso, parte, sede, tenant, cuota.
- `docs/build-brief.md` — problema, usuarios, alcance del MVP y criterios de éxito.
- `docs/domain-model.md` — entidades, relaciones, estados y casos límite.
- `docs/risks-and-open-questions.md` — riesgos y decisiones pendientes.

Leer solo cuando sea relevante:

- `ARCHITECTURE.md` — capas, base de datos, migraciones, contrato de tenant y salud.
- `CONSTRAINTS.md` — reglas MUST/MUST NOT durables antes de tocar datos o tenancy.
- `docs/user-and-access-model.md` — usuarios, roles, permisos, aislamiento y revocación.
- `docs/technical-discovery.md` — stack, datos, integraciones, despliegue y operación.
- `DESIGN.md` — cualquier cambio de interfaz o de dirección visual.
- `docs/adr/` — si existe y una decisión puede contradecir otra aceptada.

## Startup Workflow

Antes de escribir código:

1. Confirmar el directorio de trabajo con `pwd`.
2. Leer `PROGRESS.md` para conocer el estado verificado y el siguiente paso.
3. Leer `feature_list.json` y elegir la primera feature no terminada, en orden, cuyas dependencias estén en `accepted`.
4. Ejecutar `./init.sh`. En Windows, usar Git Bash si el `bash` por defecto es WSL: `& "C:\Program Files\Git\bin\bash.exe" init.sh`.
5. Si la verificación base falla, arreglarla antes de añadir trabajo nuevo.

## Working Rules

- Trabajar en una sola feature a la vez.
- No marcar una feature como terminada solo porque se añadió código.
- Mantener los cambios dentro del alcance de la feature; solo arreglos estrechos si hay un bloqueo.
- No cambiar las reglas de verificación durante la implementación sin dejarlo documentado.
- Actualizar los artefactos del repo en lugar de depender de resúmenes de chat.
- Preservar el aislamiento entre empresas y el registro de auditoría en cada cambio.
- No activar el modo VERIFACTU: el MVP es NO-VERIFACTU con capa de abstracción.
- La documentación del proyecto se escribe en español.

## Required Artifacts

- `feature_list.json`: fuente de verdad del estado de las features.
- `PROGRESS.md`: estado verificado actual y registro breve de sesiones.
- `init.sh`: camino estándar de arranque y verificación.

## Commands

App Next.js + TypeScript + Tailwind en `src/`, Prisma 7 con PostgreSQL y npm
como gestor de paquetes. En Windows, si el PATH heredado no incluye Node.js:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
```

PostgreSQL local (no se requiere Docker en este repositorio):

```bash
cp .env.example .env   # ajustar DATABASE_URL si hace falta
npm run db:deploy      # aplica migraciones
npm run db:status      # comprueba el historial
```

Instalación y gate estándar (no necesita base de datos):

```bash
npm ci
npm run db:generate
npm run lint
npm run typecheck
npm test
npm run build
```

Tests de integración reales (requieren PostgreSQL y `DATABASE_URL`):

```bash
npm run test:db
```

Otros comandos de base de datos: `npm run db:migrate`, `npm run db:reset`.
No usar `prisma db push` para cambios compartidos; ver `CONSTRAINTS.md`.

Desarrollo manual:

```bash
npm run dev
```

- Home: `http://localhost:3000/`
- Salud: `http://localhost:3000/health` (200 si PostgreSQL responde; 503
  `degraded` si no, sin filtrar credenciales)

`init.sh` ejecuta `npm run db:generate`, instala si falta `node_modules` y corre
el gate completo; no arranca PostgreSQL ni el servidor de desarrollo. En Windows
se ejecuta con Git Bash: `& "C:\Program Files\Git\bin\bash.exe" init.sh`.

## Definition Of Done

Una feature está terminada solo si:

- el comportamiento objetivo está implementado,
- la verificación requerida se ejecutó de verdad,
- la evidencia queda registrada en `feature_list.json` o `PROGRESS.md`,
- el repositorio sigue arrancando desde el camino estándar,
- la documentación relevante se actualizó si cambió el producto, el dominio o la verificación.

## End Of Session

Antes de terminar una sesión:

1. Actualizar `PROGRESS.md`.
2. Actualizar `feature_list.json`.
3. Registrar riesgos o bloqueos sin resolver.
4. Dejar el repo listo para que la siguiente sesión ejecute `./init.sh` sin pasos manuales.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
