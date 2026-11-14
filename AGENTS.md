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
cp .env.example .env   # ajustar DATABASE_URL y SEED_* si hace falta
npm run db:deploy      # aplica migraciones
npm run db:status      # comprueba el historial
npm run db:seed        # datos demo locales (idempotente, nunca en producción)
```

`db:seed` usa `tsx` y variables `SEED_ADMIN_*`/`SEED_SUPERADMIN_*`; no forma
parte de `init.sh` ni del gate.

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
- Login: `http://localhost:3000/login`
- Panel privado: `http://localhost:3000/panel` (requiere sesión)
- Panel de proveedor: `http://localhost:3000/superadmin` (solo
  `es_superadmin` con `empresa_id` nulo)
- Empresas: `http://localhost:3000/superadmin/empresas`
- Planes: `http://localhost:3000/superadmin/planes`
- Activación de invitado: `http://localhost:3000/invitacion/<token>` (pública;
  token desconocido → 404)
- Salud: `http://localhost:3000/health` (200 si PostgreSQL responde; 503
  `degraded` si no, sin filtrar credenciales)

Las credenciales de ejemplo del seed son solo locales y viven en `.env`; nunca
se commitean. La autenticación es propia (sin Auth.js): cookie
`central_sesion` de 12 h, sesión revocable y `requireSession` en las rutas
privadas. `/superadmin` añade `requireSuperadmin` (`es_superadmin` y
`empresa_id` nulo); un usuario de empresa recibe 403 y un anónimo va al login.
El alta de empresa genera un administrador `INACTIVO` sin contraseña y una
invitación de 7 días; el enlace se muestra una sola vez desde una cookie flash
y no se envía por email ni se puede recuperar. El invitado lo abre en
`/invitacion/<token>`, define una contraseña de 12 a 128 caracteres y entra en
`/panel` con sesión de su empresa; la aceptación es atómica y de un solo uso
(`POST /api/invitaciones/aceptar`). No hay reenvío de invitaciones.

`init.sh` ejecuta `npm run db:generate`, instala si falta `node_modules` y corre
el gate completo; no arranca PostgreSQL, el servidor de desarrollo ni el seed.
No necesita `DATABASE_URL`. En Windows se ejecuta con Git Bash:
`& "C:\Program Files\Git\bin\bash.exe" init.sh`.

## Validation Hygiene

- No usar `npm run dev` para validar. Arrancar `next start` en un puerto libre,
  por defecto 3100, y comprobar antes que el puerto no está ocupado.
- No reutilizar servidores de otros roles ni dejar procesos vivos entre pasos.
- Usar `curl --max-time 10` en todas las comprobaciones HTTP.
- Preferir `bash scripts/validate-smoke.sh` en Git Bash: arranca el servidor,
  comprueba rutas públicas y privadas, y limpia procesos y cookies. Admite
  `SMOKE_EMAIL`/`SMOKE_PASSWORD` y `SMOKE_NORMAL_EMAIL`/`SMOKE_NORMAL_PASSWORD`
  para las comprobaciones autenticadas.
- Al terminar, matar el árbol de procesos y verificar que el puerto queda libre.
- No dejar cookies, logs, perfiles de navegador ni bases de verificación. Las
  pruebas de integración usan una base separada que se elimina al terminar;
  `central_de_avisos` conserva sus datos demo.

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
