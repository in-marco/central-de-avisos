# Progress Log

## Current Verified State

- Repository root: `D:\desarrollo\CursoAIExpert\central-de-avisos`
- Standard startup path: `./init.sh` (en Windows, Git Bash: `& "C:\Program Files\Git\bin\bash.exe" init.sh`)
- Standard verification path: `init.sh` comprueba npm, instala dependencias con `npm ci` si falta `node_modules`, ejecuta `npm run db:generate` y el gate (lint, typecheck, tests unitarios y build); no arranca PostgreSQL, servidores ni servicios de larga duración.
- Current feature: ninguna en curso; `company-billing-settings` y `client-records` en `accepted` (validación independiente con veredicto accept cada una). `company-billing-settings` ya está en `main`; `client-records` está rebasada sobre `main` en el worktree `feature/client-records`, con su migración renombrada a `20261114190000_clientes_sedes_contactos` para aplicarse después de `20261114180000_empresa_facturacion`, pendiente de PR.
- Current next ready feature: tras el merge de `client-records`, `office-aviso-creation` y `client-portal-invitation` (sus dependencias ya están en `accepted`).
- Current blocker: none.
- Last verified at: 2026-11-14 (integración de `client-records` sobre `main` con `company-billing-settings`: 7 migraciones desde base recreada, gate, `test:db` y smoke con los cuatro roles en 3104, entorno local Windows)
- Known risks: rate limiting durable diferido (solo error genérico, hash dummy y scrypt); no hay limpieza programada de sesiones caducadas/revocadas; las credenciales demo viven solo en `.env` local y `.env.example`; RLS diferida (riesgo residual de fuga entre tenants mitigado por `tenantFilter` y tests, no por PostgreSQL); el enlace de invitación es irrecuperable al caducar la cookie flash de 60 s y no hay reenvío, regeneración ni email real (una invitación perdida o caducada no se puede sustituir desde la interfaz); el token de invitación viaja en el path del enlace (mitigado con un solo uso, Referrer-Policy same-origin, no-store y noindex); la aceptación de la invitación no deja auditoría; las acciones de superadmin aún no tienen auditoría avanzada; cambiar el importe de un plan no conserva histórico; `npm audit` reporta 7 vulnerabilidades moderadas en `minimatch` dentro de `typescript-eslint` (solo tooling de desarrollo); ESLint 9.39.5 aparece deprecado porque los plugins de `eslint-config-next` aún no declaran soporte de ESLint 10; npm 11.20 avisa de install scripts de Prisma/esbuild no aprobados (no impidió generate, migrate ni seed); `prisma migrate reset` tiene un guard para agentes IA que exige consentimiento explícito. Tras integrar `company-billing-settings` y `client-records`: la tarifa de empresa exige > 0 y ≤ 9999,99 y la de cliente admite 0 sin tope (decidir en `invoice-draft`); cambios fiscales y de clientes sin auditoría (`audit-trail-view`).

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

### Session 009

- Date: 2026-11-14
- Goal: implementar `superadmin-company-plan` según `docs/specs/superadmin-company-plan.md`.
- Completed: superficie `/superadmin` (resumen, empresas, alta, detalle, planes y 403) con `requireSuperadmin` (`es_superadmin` y `empresa_id` nulo, sin roles); `forbidden()` con `experimental.authInterrupts` verificado con 403 real; route handlers `POST /api/superadmin/planes` y `/api/superadmin/empresas` con same-origin, guard, 405 en `GET`, 303/errores por código y sin JSON; planes globales con alta/edición, importe decimal validado con `BigInt` y sin borrado; alta transaccional de empresa + administrador `INACTIVO` sin contraseña + invitación de 7 días con token SHA-256; cookie flash `central_invitacion` de 60 s; listado y detalle con estado derivado; enlace a `/superadmin` solo en `/panel` de superadmin; migración, seed, tests, smoke y documentación durable.
- Environment/versions: Windows, Node 26.13.1, npm 11.20.0, Next.js 16.4.6, React 19.3.1, Prisma 7.10.1, `@prisma/client` 7.10.1, `@prisma/adapter-pg` 7.10.1, tsx 4.23.15 y PostgreSQL 18.7 nativo en `localhost:5432`. Sin Docker, Auth.js, Playwright ni email real.
- Verification run:
  - `npm run db:deploy`: migración `20261114015000_superadmin_invitations` aplicada; `npm run db:status` → "Database schema is up to date!" (4 migraciones).
  - Base vacía `central_de_avisos_superadmin_verify`: `db:deploy` aplicó las 4 migraciones, `db:status` up to date y `test:db` 44 tests; base eliminada después con `DROP DATABASE`.
  - `npm run test:db`: 5 archivos/44 tests verdes (13 auth + 19 esquema + 3 aislamiento + 3 planes + 6 altas) en `central_de_avisos` y en la base vacía. Cubre planes, NIF normalizado, dirección fiscal, usuario `INACTIVO` sin hash, token hasheado, caducidad de 7 días, estados de invitación, duplicados, plan inactivo, rollback y checks/FKs/índices nuevos.
  - `npm run db:seed` dos veces: 1 plan, 1 empresa, 2 usuarios y 0 invitaciones; la empresa demo conserva dirección fiscal; sin duplicados ni contraseñas impresas.
  - `npm run lint`, `npm run typecheck`, `npm test` (9 archivos/53 tests) y `npm run build`: exit 0. Build con `/superadmin`, empresas, alta, detalle, planes, edición y las dos rutas `/api/superadmin/*`.
  - `init.sh` sin `.env` ni `DATABASE_URL` (renombrado y restaurado): `db:generate` + gate, exit 0, sin conectar a PostgreSQL ni arrancar servicios. `init.sh` con `.env` y PostgreSQL real: exit 0; no ejecuta seed ni servidor.
  - Smoke HTTP con `next start` en :3001 y curl: anónimo `/superadmin` 307 a `/login?next=%2Fsuperadmin`; superadmin 200; usuario normal `/panel` 200 sin enlace de proveedor y `/superadmin/empresas` 403 (contenido 403); `forbidden()` funcionó sin fallback. `GET /api/superadmin/empresas` 405 `Allow: POST`; cross-origin 403.
  - Smoke de planes: `49,90` → 303 y 49.90 en BD; `-1` y `49.999` → `error=importe` sin filas; nombre duplicado → `error=campos`; edición a 59,95 persistida; plan desactivado con `activo=f`.
  - Smoke de alta: 303 al detalle con `Set-Cookie` flash `HttpOnly; SameSite=strict; Path=/superadmin/empresas; Max-Age=60`; HTML con `/invitacion/<token>` y sin token en la URL; `psql` confirmó NIF normalizado, dirección, plan, usuario `INACTIVO` con `password_hash` nulo, `aceptada_en` nulo, `expira_en - creado_en = 7 days`, hash de 64 caracteres y 0 filas con el token crudo. Duplicados NIF/email y plan inactivo devolvieron `error=nif/email/plan` sin filas parciales. Datos de smoke limpiados; BD final 1/1/2/0.
  - Revisión real a 390 px con Edge headless/CDP: las tres vistas sin scroll horizontal (390=390), controles de 48 px (checkbox dentro de etiqueta de 48), tabulación coherente y foco visible de 2 px en latón (#C08A3E). Capturas guardadas temporalmente y servidor/Edge detenidos.
- Evidence captured: migración y status; 44 tests de integración en dos bases; seed idempotente; 53 tests unitarios; build con las rutas nuevas; `init.sh` con y sin entorno; códigos y cabeceras HTTP; consultas psql de empresa/usuario/invitación; revisión 390 px/teclado.
- Files or artifacts updated: `prisma/schema.prisma`, `prisma/migrations/20261114015000_superadmin_invitations/migration.sql`, `prisma/seed.ts`, `src/lib/superadmin/*` (authorization, validation, plans, companies, invitations, db-errors y tests), `src/app/superadmin/*` (layout, resumen, forbidden, empresas, planes y componentes), `src/app/api/superadmin/empresas/route.ts`, `src/app/api/superadmin/planes/route.ts`, `src/app/panel/page.tsx`, `src/app/globals.css`, `src/db/schema.db.test.ts`, `src/db/tenant-isolation.db.test.ts`, `src/lib/auth/auth.db.test.ts`, `next.config.ts`, `init.sh`, `README.md`, `AGENTS.md`, `ARCHITECTURE.md`, `CONSTRAINTS.md`, `docs/domain-model.md`, `docs/user-and-access-model.md`, `docs/technical-discovery.md`, `docs/risks-and-open-questions.md`, `docs/specs/superadmin-company-plan.md`, `PROGRESS.md` y `feature_list.json`.
- Known risk or unresolved issue: enlace de invitación irrecuperable al caducar la cookie de 60 s; sin reenvío/regeneración ni email real; sin auditoría avanzada de acciones de superadmin; cambio de importe de plan sin histórico; RLS diferida; rate limiting y limpieza de sesiones diferidos; 7 vulnerabilidades moderadas de `minimatch` en tooling.
- Next best step: validación independiente de `superadmin-company-plan`; si se acepta, ejecutar `feature-spec` para `company-admin-onboarding`.

### Session 010

- Date: 2026-11-14
- Goal: aplicar el brief de reparación del validador sobre `superadmin-company-plan` sin ampliar alcance.
- Completed: layout, página de resumen, `empresas`, `planes` y `_components` movidos a `src/app/superadmin/(protected)/`, dejando `src/app/superadmin/forbidden.tsx` por encima del layout que ejecuta `requireSuperadmin`; las URLs siguen siendo `/superadmin`, `/superadmin/empresas`, `/superadmin/empresas/nueva`, `/superadmin/empresas/[id]`, `/superadmin/planes` y `/superadmin/planes/[id]`. `init.sh` corregido a UTF-8: el mensaje de `/panel` dice `sesión` y no queda ningún U+FFFD. Documentación durable actualizada con el motivo del route group.
- Verification run:
  - `npm run lint`, `npm run typecheck`, `npm test` (9 archivos/53 tests), `npm run test:db` (5 archivos/44 tests) y `npm run build`: exit 0. Build Next.js 16.4.6 con las mismas rutas públicas y las dos rutas `/api/superadmin/*`.
  - `init.sh` con Git Bash: `db:generate` + lint + typecheck + 53 tests + build, exit 0, sin arrancar servicios; salida final con `/panel (requiere sesión)` y sin U+FFFD en el archivo.
  - Smoke con `next start -p 3100` y `curl --max-time 10`: anónimo `/superadmin` y `/superadmin/empresas` → 307 `Location: /login?next=%2Fsuperadmin`; usuario de empresa `/superadmin/empresas` → 403 con la UI propia, comprobada con Edge headless/CDP (el `h1` es `403 · No autorizado`, aparece `Acceso restringido`, el botón `Volver a mi panel` apunta a `/panel` y no se muestra la página por defecto en inglés); POST `/api/superadmin/empresas` con usuario de empresa → 403; GET de `/api/superadmin/empresas` y `/api/superadmin/planes` → 405 con `Allow: POST`; cross-origin → 403; superadmin `/superadmin`, `/superadmin/empresas` y `/superadmin/planes` → 200; POST cross-origin con superadmin → 403.
  - Árboles de procesos de Next y Edge detenidos; puertos 3100 y 9223 libres; cookies, logs y perfil temporal de Edge eliminados del directorio temporal.
  - `psql`: la base `central_de_avisos` queda en 1 plan, 1 empresa, 2 usuarios y 0 invitaciones; no se crearon datos de prueba en esta sesión.
- Evidence captured: 403 real con boundary propio (`(protected)` bajo `forbidden.tsx`), 307 anónimo, 200 superadmin, 403/405/cross-origin de route handlers, gate e `init.sh` verdes, build con rutas intactas y base limpia.
- Files or artifacts updated: `src/app/superadmin/(protected)/layout.tsx`, `src/app/superadmin/(protected)/page.tsx`, `src/app/superadmin/(protected)/empresas/*`, `src/app/superadmin/(protected)/planes/*`, `src/app/superadmin/(protected)/_components/ui.tsx`, `init.sh`, `ARCHITECTURE.md`, `README.md`, `docs/technical-discovery.md`, `docs/specs/superadmin-company-plan.md`, `feature_list.json`, `PROGRESS.md`.
- Known risk or unresolved issue: se mantienen los riesgos previos (enlace de invitación irrecuperable, sin reenvío ni email real, sin auditoría de superadmin, cambio de importe sin histórico, RLS, rate limiting y limpieza de sesiones diferidos). No se detectó ninguno nuevo.
- Next best step: revalidación independiente de `superadmin-company-plan`; si se acepta, ejecutar `feature-spec` para `company-admin-onboarding`.

### Session 011

- Date: 2026-11-14
- Goal: revalidación independiente de `superadmin-company-plan` tras la reparación.
- Result: `accept`; sin hallazgos bloqueantes. El 403 propio y el UTF-8 de `init.sh` quedan verificados.
- Verification run: `lint`, `typecheck`, `test` (53), `test:db` (44) y `build` exit 0; `init.sh` con y sin `DATABASE_URL` exit 0; migración desde base vacía con 4 migraciones y `db:status` up to date; base temporal eliminada.
- Evidence captured: anónimo 307 a login; superadmin 200 en `/superadmin`, empresas, alta, detalle, planes y edición; usuario de empresa 403 con UI propia y enlace `/panel`; route handlers 403; GET APIs 405; cross-origin 403; `init.sh` sin U+FFFD; BD final 1 plan, 1 empresa, 2 usuarios, 0 invitaciones y 0 sesiones; sin procesos ni bases de prueba.
- Files or artifacts updated: `feature_list.json` (`superadmin-company-plan` a `accepted` con evidencia) y `PROGRESS.md`.
- Known risk or unresolved issue: el enlace de invitación sigue disponible mientras dure la cookie flash de 60 s, aunque la documentación habla de “una sola vez”; sin reenvío, email real ni auditoría de superadmin. RLS, rate limiting y limpieza de sesiones siguen diferidos.
- Next best step: ejecutar `feature-spec` para `company-admin-onboarding`.


### Session 012

- Date: 2026-11-14
- Goal: especificar e implementar `company-admin-onboarding`.
- Completed: spec `docs/specs/company-admin-onboarding.md`; política de contraseña nueva `validateNewPassword` (12–128 caracteres y confirmación; el login no cambia); módulo `src/lib/onboarding/invitation-acceptance.ts` (búsqueda por `token_hash`, clasificación VALIDA/NO_ENCONTRADA/ACEPTADA/CADUCADA/EMPRESA_INACTIVA y aceptación transaccional de un solo uso con `updateMany` condicionado, activación y sesión); página pública `/invitacion/[token]` con `not-found.tsx` propio; `POST /api/invitaciones/aceptar` (same-origin, 405, revoca la sesión previa del navegador, 303 a `/panel` con `central_sesion`); cabeceras `no-referrer`/`no-store`/`noindex` en `/invitacion/:path*`; `validate-smoke.sh` con comprobaciones de invitación y logout del usuario de empresa. Sin migraciones.
- Verification run: lint, typecheck, `npm test` (62), build e `init.sh` sin `DATABASE_URL` exit 0; `test:db` (52, incluida la concurrencia real); `validate-smoke.sh` con superadmin y usuario de empresa; smoke HTTP del flujo completo (29/29) con `next start` en 3100.
- Evidence captured: ver `feature_list.json` (`company-admin-onboarding`).
- Files or artifacts updated: `src/lib/auth/password.ts`, `password.test.ts`, `src/lib/onboarding/*`, `src/app/invitacion/[token]/*`, `src/app/api/invitaciones/aceptar/route.ts`, `next.config.ts`, `scripts/validate-smoke.sh`, `AGENTS.md`, `ARCHITECTURE.md`, `CONSTRAINTS.md`, `README.md`, `docs/domain-model.md`, `docs/user-and-access-model.md`, `docs/risks-and-open-questions.md`, `docs/technical-discovery.md`, `docs/specs/company-admin-onboarding.md`, `feature_list.json`, `PROGRESS.md`.
- Known risk or unresolved issue: sin reenvío ni regeneración de invitaciones; token en el path del enlace (mitigado); aceptación sin auditoría. La base `central_de_avisos` contiene datos que no son del seed y son anteriores a esta sesión (empresa `12345678X` con un invitado pendiente); se dejaron intactos. La base `central_de_avisos_company_admin_onboarding`, creada antes de esta sesión, se eliminó a petición del usuario.
- Next best step: validación independiente de `company-admin-onboarding`; si se acepta, ejecutar `feature-spec` para `role-based-permissions`.

### Session 013

- Date: 2026-11-14
- Goal: validación independiente de `company-admin-onboarding`.
- Result: `accept`; sin hallazgos críticos, altos ni medios.
- Verification run: subagente validador sin contexto del implementador. Ejecutó `init.sh` sin `.env` ni `DATABASE_URL` (exit 0, 62 tests), `test:db` (52), `validate-smoke.sh` y un E2E HTTP propio (58/60; los 2 fallos eran de su script). Cubrió caducada, empresa suspendida, concurrencia, reuso y cabeceras.
- Evidence captured: `feature_list.json` (`company-admin-onboarding` en `accepted` con evidencia del validador); BD restaurada a los mismos recuentos e IDs de sesión.
- Files or artifacts updated: `feature_list.json` (estado y nota), `PROGRESS.md`.
- Known risk or unresolved issue (observaciones no bloqueantes del validador):
  - Las fechas escritas por la app aparecen en psql una hora por detrás (posible tratamiento de zona horaria en `@prisma/adapter-pg`). Es coherente dentro de la app, pero las comparaciones con `now()` de SQL salen desfasadas. Investigar aparte.
  - `test:db` corre contra `central_de_avisos` y no contra una base separada como dice `AGENTS.md`.
  - `validate-smoke.sh` deja 2 sesiones revocadas por ejecución.
  - `isSameOrigin` acepta peticiones sin `Origin` (diseño previo).
  - Las páginas de invitación rechazada responden 200.
- Next best step: commits de la spec y de la feature; después, `feature-spec` para `role-based-permissions`.

### Session 014

- Date: 2026-11-14
- Goal: reparar el fallo reportado por el usuario al activar la cuenta desde el navegador.
- Problem: al enviar la contraseña en `/invitacion/<token>` aparecía «Origen no permitido» (403).
- Cause: `Referrer-Policy: no-referrer` en `/invitacion/:path*`. Con esa política, el navegador envía `Origin: null` en el POST del formulario y `isSameOrigin` lo rechaza. Ni los smokes ni la validación lo detectaron porque `curl` fija `Origin` a mano.
- Completed: `Referrer-Policy: same-origin` en `next.config.ts` (sin Referer a terceros y con `Origin` normal hacia la propia app); comprobación de regresión en `validate-smoke.sh`; dos reglas nuevas en `CONSTRAINTS.md` (no usar `no-referrer` con formularios protegidos por `isSameOrigin` y verificar los formularios nuevos con navegador real); hallazgo en la spec; docs actualizadas.
- Verification run: Edge headless por CDP antes y después del cambio (antes `Origin: null` y 403; después `Origin: http://localhost:3100`, 303 a `/panel` y usuario `ACTIVO`); lint, typecheck, `npm test` (62), build, `test:db` (52) y `validate-smoke.sh` en verde.
- Known risk or unresolved issue: la validación de la Session 013 no usó navegador. En la BD hay una empresa creada por el usuario al probar («Tecno SAT», invitado `admin@tecnosat.es` pendiente) que se dejó intacta.
- Next best step: revalidación independiente de `company-admin-onboarding` que incluya un envío real desde navegador.

### Session 015

- Date: 2026-11-14
- Goal: revalidación independiente de `company-admin-onboarding` tras la reparación de la Session 014.
- Result: `accept`, sin hallazgos bloqueantes. El usuario también confirmó en su navegador que la activación funciona.
- Verification run: `init.sh` exit 0, `test:db` 52/52, `validate-smoke.sh` OK y un E2E con Edge headless por CDP (17/17). El formulario se envió desde el navegador real con `Origin: http://localhost:3100`, la activación terminó en `/panel` con la empresa y se comprobaron los errores de contraseña, el reuso, el logout y el login.
- Files or artifacts updated: `feature_list.json` (`accepted`), `PROGRESS.md`.
- Known risk or unresolved issue (observaciones no bloqueantes):
  - `validate-smoke.sh` deja 2 sesiones revocadas por ejecución.
  - No hay un E2E de navegador persistente: la verificación con navegador es una regla de `CONSTRAINTS.md` y un paso manual hasta que exista un harness.
  - Siguen pendientes las observaciones de la Session 013 (desfase horario de una hora en las fechas, `test:db` contra la base de desarrollo).
- Next best step: `feature-spec` para `role-based-permissions`.

### Session 016

- Date: 2026-11-14
- Goal: implementar `role-based-permissions` según `docs/specs/role-based-permissions.md` (worktree `feature/role-based-permissions`, base `central_de_avisos_role_based_permissions`, puerto 3101).
- Completed: migración `20261114120000_roles_usuario` (enum `rol_usuario`, `usuarios.roles` NOT NULL default `{}`, backfill `{ADMINISTRADOR}` y CHECK superadmin sin roles / sin nulos); matriz pura `src/lib/authz/permissions.ts` (`can`, `permissionsFor`, `normalizeRoles`, `formatRoles`), navegación `navigation.ts` y guards `guards.ts` (`requirePermission`, `authorizeCompanyRequest`); roles en la sesión (leídos en cada petición, `[]` para el superadmin); `src/lib/empresa/usuarios.ts` (listado con `tenantFilter`, cambio transaccional con `FOR UPDATE`, `propio-admin` y último administrador); `/panel/usuarios`, `POST /api/panel/usuarios/roles`, `src/app/panel/forbidden.tsx`, navegación del panel con `aria-current` y roles en «Tu cuenta»; alta de empresa con `ADMINISTRADOR`; seed con oficina, técnico y encargado; `validate-smoke.sh` con `SMOKE_OFICINA_*`/`SMOKE_TECNICO_*`; documentación durable.
- Hallazgo: el `requireSession("/panel")` del layout redirigía antes que la página y el anónimo de `/panel/usuarios` perdía su `next`. El layout ahora solo lee la sesión; cada página llama a su guard y `panel-guards.test.ts` lo exige (regla en `CONSTRAINTS.md`, detalle en la spec).
- Verification run: lint, typecheck, `npm test` (132), build e `init.sh` sin `.env`/`DATABASE_URL` exit 0; `test:db` 70 en la base del worktree y en una base vacía temporal (eliminada); `db:seed` x2 idempotente; `validate-smoke.sh` con los cuatro roles en 3101; matriz HTTP 68/68; Edge headless por CDP 40/40 (formulario real, Origin, 303, 403 propio, 390 px, foco).
- Evidence captured: ver `feature_list.json` (`role-based-permissions`).
- Files or artifacts updated: `prisma/schema.prisma`, `prisma/migrations/20261114120000_roles_usuario/migration.sql`, `prisma/seed.ts`, `.env.example`, `src/lib/authz/*`, `src/lib/empresa/*`, `src/lib/auth/session.ts`, `src/lib/auth/auth.db.test.ts`, `src/lib/superadmin/companies.ts`, `companies.db.test.ts`, `authorization.ts` (comentario), `src/db/schema.db.test.ts`, `src/db/tenant-isolation.db.test.ts`, `src/app/panel/layout.tsx`, `page.tsx`, `forbidden.tsx`, `_components/panel-nav.tsx`, `usuarios/page.tsx`, `src/app/api/panel/usuarios/roles/route.ts`, `scripts/validate-smoke.sh`, `init.sh` (mensaje final), `AGENTS.md`, `ARCHITECTURE.md`, `CONSTRAINTS.md`, `README.md`, `docs/domain-model.md`, `docs/user-and-access-model.md`, `docs/risks-and-open-questions.md`, `docs/specs/role-based-permissions.md`, `feature_list.json`, `PROGRESS.md`.
- Known risk or unresolved issue: los cambios de rol no se auditan (`audit-trail-view`); ninguna feature del backlog invita o crea usuarios de oficina o técnicos (hoy solo el seed); una petición en vuelo puede completarse justo tras perder un rol (el recuento de administradores lo acota); el `Location` de los route handlers usa `localhost` aunque se acceda por `127.0.0.1` (patrón previo); `.env` local del worktree necesita `SEED_EQUIPO_PASSWORD` para `db:seed`.
- Next best step: validación independiente de `role-based-permissions` (incluido navegador real en 3101); si se acepta, `feature-spec` para `company-billing-settings`.

### Session 017

- Date: 2026-11-14
- Goal: validación independiente de `role-based-permissions` (github-flow, issue #2).
- Context: la sesión `claude -p` del worktree implementó la feature, pero su validador devolvió `block` porque la lista de permisos de la sesión impedía usar Edge, el smoke con variables y las bases temporales. La sesión principal relanzó la validación con un subagente `validator` con esos accesos.
- Result: `accept`; sin hallazgos críticos, altos ni medios.
- Verification run: Edge headless por CDP (login, cambio de roles con clic real, intento de quitarse el propio Administrador, 403 de Oficina y vista a 390 px); `validate-smoke.sh` 40/40; migración desde base vacía y `test:db` 70/70; `init.sh` sin `DATABASE_URL` (132 tests y build); matriz HTTP por rol.
- Files or artifacts updated: `feature_list.json` (`accepted`), `PROGRESS.md`, `CONSTRAINTS.md` (excepción de `/panel` nombrada), `prisma/schema.prisma` (solo formato).
- Known risk or unresolved issue: `/api/panel/usuarios/roles` acepta POST sin cabecera Origin (patrón previo de `isSameOrigin`, mitigado por `SameSite=Lax`).
- Next best step: `company-billing-settings` y `client-records`, que pueden ir en paralelo con github-flow.

### Session 018

- Date: 2026-11-14
- Goal: implementar `company-billing-settings` según `docs/specs/company-billing-settings.md` (worktree `feature/company-billing-settings`, base `central_de_avisos_company_billing_settings`, puerto 3103, CDP 9231).
- Completed: migración `20261114180000_empresa_facturacion` (enum `modo_fiscal` con solo `NO_VERIFACTU`, `serie_factura` y `tarifa_horaria` nullables, CHECK de formato de serie y tarifa positiva); `src/lib/empresa/configuracion-validation.ts` (puro) y `configuracion.ts` (lectura y escritura por `requireEmpresaId`, sin tocar `plan_id`/`estado`, `nif-duplicado`); `/panel/empresa` (tres `fieldset`, aviso «Pendiente de configurar», errores inline y resumen, VERIFACTU deshabilitado) y `POST /api/panel/empresa`; entrada «Empresa» en la navegación; seed con serie `F`, tarifa `45.00` y `NO_VERIFACTU`; `validate-smoke.sh` ampliado; `init.sh` (solo mensaje final); documentación durable.
- Hallazgo: `normalizeNif` compartido solo hace `trim`, así que `b 87654321` fallaba. La validación de la configuración quita antes todos los espacios del NIF (anotado en la spec; `normalizeNif` no cambia).
- Verification run: lint (0 warnings), typecheck, `npm test` 173, build e `init.sh` con `env -u DATABASE_URL` exit 0; `db:deploy`/`db:status`/`migrate diff` sin deriva; `test:db` 88/88 en la base del worktree y en una base vacía temporal `central_de_avisos_cbs_verify` (eliminada); `db:seed` x2 idempotente; `validate-smoke.sh` con los cuatro roles en 3103; matriz HTTP por rol y por código de error con instantánea md5 de `empresas`; Edge headless por CDP 16/16.
- Evidence captured: ver `feature_list.json` (`company-billing-settings`).
- Files or artifacts updated: `prisma/schema.prisma`, `prisma/migrations/20261114180000_empresa_facturacion/migration.sql`, `prisma/seed.ts`, `src/lib/empresa/configuracion-validation.ts`, `configuracion-validation.test.ts`, `configuracion.ts`, `configuracion.db.test.ts`, `src/lib/authz/navigation.ts`, `navigation.test.ts`, `panel-guards.test.ts`, `src/db/schema.db.test.ts`, `src/db/tenant-isolation.db.test.ts`, `src/app/panel/empresa/page.tsx`, `src/app/api/panel/empresa/route.ts`, `scripts/validate-smoke.sh`, `init.sh`, `AGENTS.md`, `ARCHITECTURE.md`, `CONSTRAINTS.md`, `README.md`, `docs/domain-model.md`, `docs/user-and-access-model.md`, `docs/risks-and-open-questions.md`, `docs/specs/company-billing-settings.md`, `feature_list.json`, `PROGRESS.md`.
- Known risk or unresolved issue: cambios fiscales sin auditoría (`audit-trail-view`); el mensaje de NIF duplicado revela que el NIF existe; cambiar la serie tras emitir queda para `invoice-signed-pdf`; el seed localiza Empresa Demo por NIF `B12345678` (si se cambia, restaurarlo antes de sembrar); `client-records` toca los mismos archivos compartidos (`schema.prisma`, `navigation.ts`, `seed.ts`, `validate-smoke.sh`, docs): al integrar la segunda rama, rebase y timestamp de migración posterior.
- Next best step: validación independiente de `company-billing-settings` (incluido navegador real en 3103).

### Session 019

- Date: 2026-11-14
- Goal: validación independiente de `company-billing-settings` (feature-flow, worktree `feature/company-billing-settings`).
- Completed: el validator devolvió `accept` sin hallazgos críticos, altos ni medios; estado pasado a `accepted`.
- Verification run: `env -u DATABASE_URL bash init.sh` (lint, typecheck, 173 tests, build); `db:deploy`/`db:status`/`migrate diff` sin deriva; `test:db` 88/88 en la base del worktree y en una base vacía temporal `central_de_avisos_cbs_val` (eliminada); `db:seed` x2 idempotente; `validate-smoke.sh` con cuatro roles en 3103; matriz HTTP por rol, origen y código de error con md5 de `empresas`; aislamiento con `empresaId`/`planId`/`estado` ajenos; Edge headless por CDP (envío real, persistencia tras recargar, errores accesibles, 390 px, tabulación y foco).
- Known risk or unresolved issue: notas bajas del validator: `transition-colors` anima también `outline-color` (el foco tarda ~150 ms en verse latón); `isSameOrigin` acepta POST sin `Origin` (patrón previo, mitigado por `SameSite=Lax`). Siguen los riesgos de la sesión 018.
- Next best step: integrar la rama (sesión principal) y continuar con la siguiente feature lista.

### Session 020

- Date: 2026-11-14
- Goal: implementar `client-records` según `docs/specs/client-records.md` (worktree `feature/client-records`, base `central_de_avisos_client_records`, puerto 3104, Edge CDP 9232).
- Completed: migración `20261114140733_clientes_sedes_contactos` (clientes con NIF único por empresa y tarifa opcional; sedes y contactos con `empresa_id` y FK compuesto `(cliente_id, empresa_id)`; `contactos.sede_id` FK simple; 4 CHECK); `src/lib/clientes/validation.ts` (puro) y `clientes.ts` (repositorio con `tenantFilter`, alta transaccional, upserts de sede y contacto, `nif-duplicado`, `sede`, `no-encontrado`); páginas `/panel/clientes`, `/nuevo`, `/[id]` y `[id]/not-found.tsx`; UI compartida `src/app/panel/_components/ui.tsx`; route handlers `POST /api/panel/clientes`, `/datos`, `/sedes` y `/contactos`; entrada «Clientes» en la navegación; `validate-smoke.sh` ampliado; documentación durable (ARCHITECTURE, CONSTRAINTS con reevaluación de RLS, AGENTS, README, domain-model, user-and-access-model, risks) y `init.sh` (mensaje final). Preguntas abiertas resueltas con las propuestas del planner.
- Verification run: lint, typecheck, `npm test` (168), build e `init.sh` con `env -u DATABASE_URL` (con y sin `.env`) exit 0; `db:status` up to date y `migrate diff` vacío; `test:db` 84 en la base del worktree y en una base vacía temporal (eliminada); `validate-smoke.sh` 56 OK con los cuatro roles en 3104; matriz HTTP 73/73; Edge headless por CDP 36/36 (formularios con clic real, `Origin: http://localhost:3104`, 303, mensajes, 403/404 propios, 390 px, foco).
- Evidence captured: ver `feature_list.json` (`client-records`).
- Files or artifacts updated: `prisma/schema.prisma`, `prisma/migrations/20261114140733_clientes_sedes_contactos/migration.sql`, `src/lib/clientes/*`, `src/db/schema.db.test.ts`, `src/db/tenant-isolation.db.test.ts`, `src/lib/authz/navigation.ts`, `navigation.test.ts`, `panel-guards.test.ts`, `src/app/panel/_components/ui.tsx`, `src/app/panel/clientes/**`, `src/app/api/panel/clientes/**`, `scripts/validate-smoke.sh`, `init.sh`, `AGENTS.md`, `ARCHITECTURE.md`, `CONSTRAINTS.md`, `README.md`, `docs/domain-model.md`, `docs/user-and-access-model.md`, `docs/risks-and-open-questions.md`, `docs/specs/client-records.md`, `feature_list.json`, `PROGRESS.md`. `.env` local (ignorado) completado con `SEED_EQUIPO_PASSWORD` y emails del equipo demo para poder ejecutar `db:seed`.
- Known risk or unresolved issue: sin borrado/desactivación de clientes, sin auditoría, listado sin paginación; la regla «sede del contacto del mismo cliente» solo la aplica la aplicación; NIF obligatorio para particulares pendiente de confirmar con la gestoría; RLS sigue diferida. Conflictos de merge previsibles con `company-billing-settings` en `navigation.ts`, `validate-smoke.sh`, `ARCHITECTURE.md`, `CONSTRAINTS.md`, README/AGENTS y el orden de migraciones: rebasar y repetir `db:status`/`test:db` antes del merge. El aviso `DeprecationWarning` de `pg` en `test:db` viene de tests previos (superadmin/onboarding), no de esta feature.
- Next best step: validación independiente de `client-records` (incluido navegador real en 3104).

### Session 021

- Date: 2026-11-14
- Goal: validación independiente de `client-records` (feature-flow en el worktree `feature/client-records`; la sesión anterior se cortó por límite de uso tras dejarla en `passing`).
- Result: `accept`; sin hallazgos críticos, altos ni medios.
- Verification run: `init.sh` con `env -u DATABASE_URL` (168 tests y build); `db:status` up to date y `migrate diff` vacío; `test:db` 84/84 en la base del worktree y en una base vacía temporal (eliminada); `validate-smoke.sh` en 3104 con superadmin, administrador, oficina y técnico; matriz HTTP por rol, validación y aislamiento entre empresas (md5 sin cambios); Edge headless por CDP en 9232, 65/65 (formularios con clic real y `Origin: http://localhost:3104`, 404/403 propios, 390 px, foco).
- Files or artifacts updated: `feature_list.json` (`accepted`), `PROGRESS.md`, `docs/risks-and-open-questions.md` (aclarado que a nivel de BD `contactos.sede_id` podría apuntar a una sede de otra empresa).
- Known risk or unresolved issue (Low): `?error=__proto__`/`constructor` en las páginas de clientes (y en `/panel/usuarios`, patrón previo) provoca 500 por buscar el mensaje en un objeto literal; arreglo transversal propuesto `Object.hasOwn`. Los POST sin cabecera Origin se siguen aceptando (riesgo previo, mitigado por `SameSite=Lax`).
- Next best step: publicar `client-records` como PR (sesión principal); después, `office-aviso-creation`.

### Session 022

- Date: 2026-11-14
- Goal: integrar `client-records` (aceptada en su rama) sobre `main` tras el merge de `company-billing-settings` (rebase en el worktree `feature/client-records`).
- Completed: conflictos resueltos conservando las dos features: navegación con «Inicio, Clientes, Usuarios, Empresa» para el administrador y tests de navegación y `panel-guards` con `/panel/empresa` y las tres páginas de clientes; `schema.db.test.ts` y `tenant-isolation.db.test.ts` con los bloques de facturación y de clientes; `validate-smoke.sh` e `init.sh` con las comprobaciones y enlaces de `/panel/empresa` y `/panel/clientes`; AGENTS, ARCHITECTURE, CONSTRAINTS, README, `user-and-access-model` y `risks-and-open-questions` combinados en un solo texto; sesiones de `client-records` renumeradas a 020 y 021. Migración renombrada de `20261114140733_clientes_sedes_contactos` a `20261114190000_clientes_sedes_contactos` (mismo SQL; no comparte tablas ni nombres de constraint con `20261114180000_empresa_facturacion`).
- Verification run: base `central_de_avisos_client_records` recreada con `dropdb`/`createdb`; `db:deploy` aplicó las 7 migraciones en orden; `db:status` «Database schema is up to date!» (7 migraciones) y `prisma migrate diff --from-config-datasource --to-schema` vacío; `db:generate` y `db:seed` x2 idempotente (serie F, tarifa 45.00, NO_VERIFACTU; 5 usuarios); `npm run lint` y `typecheck` exit 0; `npm test` 15 archivos/209 tests; `npm run build` exit 0 con `/panel/empresa`, `/panel/clientes{,/nuevo,/[id]}` y sus APIs; `npm run test:db` 9 archivos/102 tests; `env -u DATABASE_URL bash init.sh` exit 0 (209 tests y build); `validate-smoke.sh` en 3104 con superadmin, administrador, oficina y técnico: 64 comprobaciones OK. Puerto 3104 libre al terminar.
- Files or artifacts updated: los 13 archivos en conflicto, `prisma/migrations/20261114190000_clientes_sedes_contactos/` (renombrada), `docs/specs/client-records.md` (nombre de la migración), `feature_list.json` (evidencia de integración), `PROGRESS.md`.
- Known risk or unresolved issue: reglas de tarifa distintas entre empresa y cliente (anotado en `docs/risks-and-open-questions.md`). La prueba con navegador real se hizo en la revalidación independiente posterior (ver abajo).
- Result: rebase completado por el orquestador (un solo commit sobre `566fc51`). Revalidación independiente de la integración: `accept`, sin hallazgos críticos, altos ni medios. Revisó que no se perdiera nada de ninguna feature; probó las 7 migraciones desde una base vacía (orden correcto, `migrate diff` vacío, `test:db` 102/102); `init.sh` sin `DATABASE_URL` (209 tests y build); `validate-smoke.sh` 64/64; y Edge headless por CDP 38/38: administrador (navegación Inicio/Clientes/Usuarios/Empresa, alta de cliente con clic real, segunda sede, segundo contacto, edición de datos y cambio y restauración de la tarifa de empresa), oficina (Clientes sí; Empresa y Usuarios 403; error de contacto sin teléfono ni email), técnico (403 en clientes), vista a 390 px sin desbordes y los 15 POST con `Origin: http://localhost:3104`.
- Next best step: publicar la PR de `client-records`; tras el merge, `office-aviso-creation` y `client-portal-invitation`. Pendientes de severidad baja: `?error=__proto__` provoca 500 en las páginas de clientes y usuarios (buscar mensajes con `Object.hasOwn`).
