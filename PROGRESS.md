# Progress Log

## Current Verified State

- Repository root: `D:\desarrollo\CursoAIExpert\central-de-avisos`
- Standard startup path: `./init.sh` (en Windows, Git Bash: `& "C:\Program Files\Git\bin\bash.exe" init.sh`)
- Standard verification path: `init.sh` comprueba npm, instala dependencias con `npm ci` si falta `node_modules`, ejecuta `npm run db:generate` y el gate (lint, typecheck, tests unitarios y build); no arranca PostgreSQL, servidores ni servicios de larga duración.
- Current feature: `email-password-auth` en `accepted`.
- Current next ready feature: `superadmin-company-plan`.
- Current blocker: none.
- Last verified at: 2026-11-14 01:15 (email-password-auth aceptada, entorno local Windows)
- Known risks: rate limiting durable diferido (solo error genérico, hash dummy y scrypt); no hay limpieza programada de sesiones caducadas/revocadas; las credenciales demo viven solo en `.env` local y `.env.example`; RLS diferida (riesgo residual de fuga entre tenants mitigado por `tenantFilter` y tests, no por PostgreSQL); `npm audit` reporta 7 vulnerabilidades moderadas en `minimatch` dentro de `typescript-eslint` (solo tooling de desarrollo); ESLint 9.39.5 aparece deprecado porque los plugins de `eslint-config-next` aún no declaran soporte de ESLint 10; npm 11.20 avisa de install scripts de Prisma/esbuild no aprobados (no impidió generate, migrate ni seed); `prisma migrate reset` tiene un guard para agentes IA que exige consentimiento explícito.

## Session Log

### Session 001

- Date: 2026-11-13
- Goal: crear el harness mínimo del repositorio.
- Completed: `AGENTS.md`, `init.sh`, `PROGRESS.md` y `feature_list.json` creados a partir del build brief y del modelo de dominio.
- Verification run: `& "C:\Program Files\Git\bin\bash.exe" init.sh` y validación de `feature_list.json` como JSON (31 features, dependencias sin ciclos, cero en progreso).
- Evidence captured: los archivos requeridos existen; el JSON de features es válido; no hay features en progreso.
- Files or artifacts updated: `AGENTS.md`, `init.sh`, `PROGRESS.md`, `feature_list.json`.
- Known risk or unresolved issue: confirmar con gestoría la emisión en nombre de terceros, la firma con certificado de plataforma y los requisitos del modo NO-VERIFACTU.
- Next best step: ejecutar `feature-spec` para `bootstrap-web-app`.

### Session 002

- Date: 2026-11-13
- Goal: implementar `bootstrap-web-app` según `docs/specs/bootstrap-web-app.md`.
- Completed: app Next.js 16.4.6 (App Router, TypeScript estricto, Tailwind CSS 4) en `src/`; home mínima; `GET /health`; `buildHealthPayload` y test unitario con Vitest; scripts npm; configuraciones de Next, TypeScript, ESLint, PostCSS y Vitest; `init.sh` convertido en gate real; README y AGENTS actualizados.
- Versions: Node 26.13.1, npm 11.20.0, Next.js 16.4.6, React 19.3.1, TypeScript 5.9.3, Tailwind CSS 4.3.5, ESLint 9.39.5, Vitest 5.1.0. TypeScript se fija en 5.9.3 porque `typescript-eslint` (dependencia de `eslint-config-next`) no declara soporte para TypeScript 7; ESLint se fija en 9.x porque `eslint-plugin-react`, `eslint-plugin-jsx-a11y` y `eslint-plugin-import` no declaran soporte para ESLint 10.
- Verification run: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` e `init.sh` con `node_modules` eliminado (npm ci + gate completo). Smoke manual con `npm run dev`: `/` 200, `/health` 200 JSON válido, ruta inexistente 404; servidor detenido después.
- Evidence captured: código 0 en los cuatro comandos; `init.sh` termina en verde sin arrancar servidor; `/health` devuelve `{"status":"ok","service":"central-de-avisos","timestamp":"2026-11-13T22:12:51.656Z"}`; home contiene "Central de avisos" y enlace a `/health`.
- Files or artifacts updated: `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `vitest.config.ts`, `.nvmrc`, `.gitignore`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/app/health/route.ts`, `src/lib/health.ts`, `src/lib/health.test.ts`, `init.sh`, `README.md`, `AGENTS.md`, `PROGRESS.md`, `feature_list.json`.
- Known risk or unresolved issue: `npm audit` reporta 7 vulnerabilidades moderadas de `minimatch` dentro de `typescript-eslint` (tooling de desarrollo); no hay fix compatible dentro de los rangos actuales. `next dev` añadió y mantiene el bloque `nextjs-agent-rules` al final de `AGENTS.md`.
- Next best step: validación independiente de `bootstrap-web-app`; si se acepta, planificar `database-foundation`.

### Session 003

- Date: 2026-11-13
- Goal: aplicar el brief de reparación del validador sobre `bootstrap-web-app` sin ampliar alcance.
- Completed: el eyebrow "Herramienta operativa" de `src/app/page.tsx` pasó de `text-accent` (#C08A3E, 3.02:1 sobre blanco) a `text-primary` (#12304D, 13.50:1 sobre surface #FFFFFF); el acento se conserva solo en el focus ring (`focus-visible:outline-accent`). Actualizados `feature_list.json` (notas, comportamiento visible y verificación con build) y `PROGRESS.md`.
- Verification run: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` e `init.sh` con Git Bash; todos exit 0. Contraste calculado por inspección numérica: 13.50:1.
- Evidence captured: sin coincidencias de `text-accent` en la home; lint sin errores ni warnings; typecheck limpio; 1 archivo y 2 tests de Vitest; build de Next.js 16.4.6 con rutas `/`, `/_not-found` y `/health`; `init.sh` termina en verde sin arrancar servidor.
- Files or artifacts updated: `src/app/page.tsx`, `feature_list.json`, `PROGRESS.md`.
- Known risk or unresolved issue: ninguno nuevo; se mantienen las 7 vulnerabilidades moderadas de `minimatch` en tooling de desarrollo y el bloque `nextjs-agent-rules` de `AGENTS.md`.
- Next best step: revalidación independiente de `bootstrap-web-app`.

### Session 004

- Date: 2026-11-13
- Goal: revalidación independiente de `bootstrap-web-app` tras la reparación.
- Result: `accept`; sin hallazgos bloqueantes. Verificado el contraste AA corregido, el gate completo, `init.sh` desde estado limpio y smoke de `/`, `/health` y 404.
- Verification run: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` e `init.sh`; todos exit 0. `init.sh` ejecutó `npm ci` desde estado limpio y no arrancó servidor.
- Evidence captured: eyebrow con `text-primary` (13.50:1 sobre surface), cero `text-accent` como texto en `src/`; build Next.js 16.4.6 con `/`, `/_not-found` y `/health`; `/health` 200 JSON; 404 correcto.
- Files or artifacts updated: `feature_list.json` (`bootstrap-web-app` a `accepted` con evidencia) y `PROGRESS.md`.
- Known risk or unresolved issue: se mantienen las 7 vulnerabilidades moderadas de `minimatch` en tooling de desarrollo y el bloque `nextjs-agent-rules` de `AGENTS.md`.
- Next best step: ejecutar `feature-spec` para `database-foundation`.

### Session 005

- Date: 2026-11-14
- Goal: implementar `database-foundation` según `docs/specs/database-foundation.md`.
- Completed: Prisma 7.10.1 con generador `prisma-client`, driver adapter `@prisma/adapter-pg` y `prisma.config.ts`; esquema `planes`/`empresas`/`usuarios` con enums, mappings snake_case, UUID `gen_random_uuid()`, FKs `Restrict` e índices; migraciones `20261113230600_init` y `20261113230613_constraints` con CHECK de importe, email normalizado y coherencia superadmin/empresa; `src/db/client.ts` perezoso; `src/db/tenant.ts`; `src/lib/db-health.ts`; `/health` 200/503; tests unitarios y `test:db`; `init.sh` con `db:generate`; documentación durable.
- Environment/versions: Windows, Node 26.13.1, npm 11.20.0, Next.js 16.4.6, Prisma 7.10.1, `@prisma/client` 7.10.1, `@prisma/adapter-pg` 7.10.1, PostgreSQL 18.7 nativo en `localhost:5432` (rol `central` con CREATEDB, base `central_de_avisos`). Sin Docker; no se creó `compose.yaml`.
- Verification run:
  - `npm run db:deploy` sobre base de verificación vacía `central_de_avisos_verify`: aplicó las 2 migraciones; `npm run db:status` → "Database schema is up to date!"; base eliminada después.
  - `npm run db:reset` (con consentimiento explícito por el guard de Prisma 7) + `npm run db:deploy` + `npm run db:status`: reset correcto, sin migraciones pendientes.
  - `npm run test:db`: 2 archivos, 13 tests verdes (10 de esquema/constraints/FKs + 3 de aislamiento entre dos empresas).
  - `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`: exit 0. Tests unitarios: 2 archivos, 15 tests.
  - `init.sh` sin `.env` y con `node_modules` eliminado: `npm ci` + `postinstall` + `db:generate` + gate completo, exit 0, sin arrancar servicios.
  - `init.sh` con DB arriba y con `DATABASE_URL` a puerto inaccesible: exit 0 en ambos casos; no arranca PostgreSQL ni servidor.
  - Smoke `next start`: `/health` 200 `{"status":"ok",...,"database":{"status":"up"}}` con PostgreSQL; 503 `{"status":"degraded",...,"database":{"status":"down"}}` con URL a puerto 5999. Sin credenciales en la respuesta. Servidores detenidos y puertos liberados.
- Evidence captured: migraciones aplicadas y status up to date; tablas `planes`, `empresas`, `usuarios` y los 3 CHECK presentes en la base de verificación; 13 tests de integración verdes; gate e init.sh en verde; payloads reales de `/health` 200/503.
- Files or artifacts updated: `package.json`, `package-lock.json`, `prisma.config.ts`, `prisma/schema.prisma`, `prisma/migrations/20261113230600_init/migration.sql`, `prisma/migrations/20261113230613_constraints/migration.sql`, `prisma/migrations/migration_lock.toml`, `.env.example`, `.gitignore`, `eslint.config.mjs`, `vitest.config.ts`, `vitest.db.config.ts`, `src/db/client.ts`, `src/db/tenant.ts`, `src/db/tenant.test.ts`, `src/db/schema.db.test.ts`, `src/db/tenant-isolation.db.test.ts`, `src/db/db-test-setup.ts`, `src/db/db-test-utils.ts`, `src/lib/db-health.ts`, `src/lib/health.ts`, `src/lib/health.test.ts`, `src/app/health/route.ts`, `init.sh`, `README.md`, `AGENTS.md`, `ARCHITECTURE.md`, `CONSTRAINTS.md`, `docs/technical-discovery.md`, `docs/risks-and-open-questions.md`, `docs/specs/database-foundation.md`, `PROGRESS.md`, `feature_list.json`.
- Known risk or unresolved issue: RLS no está activa; cualquier consulta futura sin `tenantFilter` no la bloqueará PostgreSQL. Riesgo residual registrado en `CONSTRAINTS.md` y `docs/risks-and-open-questions.md`. Prisma 7 no carga `.env` automáticamente ni genera el cliente tras `migrate dev`; `init.sh`/`postinstall` lo cubren.
- Next best step: validación independiente de `database-foundation`; si se acepta, planificar `email-password-auth`.

### Session 006

- Date: 2026-11-14
- Goal: validación independiente de `database-foundation`.
- Result: `accept`; sin hallazgos bloqueantes. La adaptación a PostgreSQL 18.7 nativo es coherente y los escenarios de la spec se mantienen.
- Verification run: `db:deploy` desde base de verificación vacía (2 migraciones) y `db:status` up to date; `db:reset` reconstruyó el esquema; catálogo con 3 tablas, 2 enums, 8 índices, 2 FKs Restrict y 3 CHECK; `test:db` 2 archivos/13 tests; `lint`, `typecheck`, `test` (15), `build` exit 0; `init.sh` desde `node_modules` eliminado ejecutó `npm ci` + `postinstall` + `db:generate` + gate sin servicios; `/health` 200 up y 503 down sin credenciales.
- Evidence captured: bases de verificación eliminadas; `central_de_avisos` intacta; `.env` ignorado y sin secretos trackeados; sin auth, dominio, facturación, seeds, RLS ni UI nueva.
- Files or artifacts updated: `feature_list.json` (`database-foundation` a `accepted` con evidencia) y `PROGRESS.md`.
- Known risk or unresolved issue: RLS diferida; 7 vulnerabilidades moderadas de `minimatch` en tooling; aviso de install scripts de Prisma en npm 11.20; ESLint 9 deprecado.
- Next best step: ejecutar `feature-spec` para `email-password-auth`.

### Session 007

- Date: 2026-11-14
- Goal: implementar `email-password-auth` según `docs/specs/email-password-auth.md`.
- Completed: auth propia sin Auth.js con scrypt nativo versionado (`N=131072,r=8,p=1`, salt de 16 bytes, `timingSafeEqual` y hash dummy); tabla `sesiones` y `usuarios.password_hash` nullable; token opaco de 32 bytes con solo SHA-256 en BD; cookie `central_sesion` HttpOnly/SameSite=Lax/12 h/Secure en HTTPS; `authenticateCredentials`, `getSessionByToken`, `revokeSessionByToken`, `getCurrentSession` con `cache()` y `requireSession`; route handlers `POST /api/auth/login` y `/api/auth/logout` con 405 en GET, same-origin, 303 y `next` seguro; `/login` server-rendered y `/panel` con layout protegido; enlace de login en la home; seed idempotente con `tsx`; tests unitarios y de integración real; documentación durable actualizada.
- Environment/versions: Windows, Node 26.13.1, npm 11.20.0, Next.js 16.4.6, Prisma 7.10.1, `@prisma/client` 7.10.1, `@prisma/adapter-pg` 7.10.1, `tsx` 4.23.15, PostgreSQL 18.7 nativo en `localhost:5432`. Sin Docker; no se añadió Auth.js, Playwright ni `server-only`.
- Verification run:
  - `npm install --save-dev --save-exact tsx@4.23.15`; `npm run db:generate`; migración `20261113235228_auth_sessions` generada, corregida y aplicada con `npm run db:deploy`; `npm run db:status` → "Database schema is up to date!".
  - Hallazgo: el CHECK usaba `creada_en` pero la columna física es `creado_en`; el primer `db:deploy` falló con `42703`. Se corrigió la migración, se marcó `rolled-back`, se limpiaron las DDL parciales y se reaplicó desde base vacía `central_de_avisos_auth_verify`; después se eliminó la base de verificación.
  - `npm run test:db`: 3 archivos/31 tests verdes (13 auth + 15 esquema + 3 aislamiento) en `central_de_avisos` y también en la base vacía de verificación.
  - `npm run db:seed` dos veces: 1 plan, 1 empresa y 2 usuarios; sin duplicados y sin imprimir contraseñas; hashes scrypt de 137 caracteres; el seed rechaza `NODE_ENV=production`.
  - `npm run lint`, `npm run typecheck`, `npm test` (6 archivos/36 tests) y `npm run build`: exit 0. Build Next.js 16.4.6 con `/` estática y `/login`, `/panel`, `/api/auth/login`, `/api/auth/logout` y `/health` dinámicas.
  - `init.sh` sin `.env` ni `DATABASE_URL`: `db:generate` + gate completo, exit 0, sin conectar a PostgreSQL ni arrancar servicios. `init.sh` con `.env` y PostgreSQL real: exit 0; no ejecuta el seed.
  - Smoke HTTP con `next start` + `curl` + cookie jar: `/panel` sin sesión → 307 `Location: /login?next=%2Fpanel`; login admin → 303 `/panel` y cookie `Max-Age=43200; HttpOnly; SameSite=lax`; `/panel` 200 con Administradora Demo/Empresa Demo; contraseña incorrecta y email inexistente → 303 al mismo `error=credenciales` sin cookie; `next=//evil.example` → `/panel` (sin open redirect); superadmin → 200 con Proveedor SaaS; logout → 303, cookie borrada, `revocada_en` en BD y `/panel` vuelve a 307; GET de auth → 405; cross-origin → 403.
  - Revisión a 390 px y teclado con Edge headless/CDP: sin scroll horizontal en `/login` ni `/panel`; inputs y botones principales de 48 px; orden de tabulación correcto y anillo de foco sólido de 2 px. Se detectó que `outline-none` anulaba el foco de los inputs y se retiró.
- Evidence captured: migraciones y status; 31 tests de integración; 36 tests unitarios; seed idempotente; códigos HTTP, `Location`, flags de cookie, mensajes y revocación en BD; layout/teclado a 390 px; `init.sh` con y sin base de datos.
- Files or artifacts updated: `package.json`, `package-lock.json`, `.env.example`, `.env` local ignorado, `prisma/schema.prisma`, `prisma/migrations/20261113235228_auth_sessions/migration.sql`, `prisma/seed.ts`, `src/lib/auth/*` (password, session-token, redirect, origin, session, current-session y tests), `src/db/schema.db.test.ts`, `src/app/login/page.tsx`, `src/app/panel/layout.tsx`, `src/app/panel/page.tsx`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/logout/route.ts`, `src/app/page.tsx`, `src/app/globals.css`, `init.sh`, `README.md`, `AGENTS.md`, `ARCHITECTURE.md`, `CONSTRAINTS.md`, `docs/technical-discovery.md`, `docs/risks-and-open-questions.md`, `docs/user-and-access-model.md`, `docs/specs/email-password-auth.md`, `PROGRESS.md` y `feature_list.json`.
- Known risk or unresolved issue: rate limiting durable diferido; no hay limpieza programada de sesiones; credenciales demo solo locales; `x-forwarded-*` debe revisarse si se despliega detrás de un proxy; 7 vulnerabilidades moderadas de `minimatch` en tooling; aviso de install scripts de Prisma/esbuild en npm 11.20; ESLint 9 deprecado.
- Next best step: validación independiente de `email-password-auth`; si se acepta, planificar `superadmin-company-plan`.

### Session 008

- Date: 2026-11-14
- Goal: validación independiente de `email-password-auth`.
- Result: `accept`; sin hallazgos bloqueantes. Auth y sesiones cumplen los escenarios de la spec.
- Verification run: `lint`, `typecheck`, `test` (36), `build` y `test:db` (31) exit 0; `test:db` también sobre base vacía `central_de_avisos_val_auth` con 3 migraciones y status up to date; seed idempotente y rechazo en producción; `init.sh` con y sin `.env`/PostgreSQL sin seed ni servicios.
- Evidence captured: `/panel` sin sesión 307 a login; login admin 303 con cookie HttpOnly/SameSite/Lax/12 h; panel 200 con empresa; credenciales erróneas y email inexistente con el mismo error genérico y sin cookie; open redirect bloqueado; superadmin 200 con Proveedor SaaS; logout revoca en BD y borra cookie; GET auth 405; cross-origin 403; sesiones caducadas/revocadas, usuario inactivo y empresa suspendida no autentican; revisión CDP a 390 px sin scroll horizontal y controles de 48 px.
- Files or artifacts updated: `feature_list.json` (`email-password-auth` a `accepted` con evidencia) y `PROGRESS.md`.
- Known risk or unresolved issue: rate limiting durable y limpieza de sesiones diferidos; credenciales demo solo locales; `x-forwarded-*` a revisar detrás de proxy; RLS diferida; 7 vulnerabilidades moderadas de `minimatch` en tooling.
- Next best step: ejecutar `feature-spec` para `superadmin-company-plan`.
