# Feature Implementation Spec: Inicio de sesión con email y contraseña

## Source Feature

- `id`: `email-password-auth`
- `area`: `auth`
- `depends_on`: `database-foundation` (status `accepted`)
- `status` en planificación: `not_started`; `source`: `feature_list.json`; verificación fuente: login sembrado, rechazo de credenciales, logout y redirección privada.
- Esta spec no modifica código ni estados; el implementador actualizará `feature_list.json` y `PROGRESS.md` con evidencia real.

## Goal

Permitir que un usuario activo inicie y cierre sesión con email y contraseña, que el superadmin use el mismo flujo sin empresa, y que toda ruta privada exija una sesión válida en servidor. La feature añade `password_hash`, una tabla de sesiones revocables y el seed mínimo para probar el flujo.

Debe dejar preparado el terreno para invitaciones, roles combinables y desactivación de usuarios sin implementarlos aquí: la sesión es opaca, persistida, revocable y comprobada en cada petición.

## Non-Goals

- Invitaciones, aceptación de invitación, alta de contraseña por invitado o recuperación/cambio de contraseña (`company-admin-onboarding` y posterior).
- Roles combinables, autorización por rol, menús por rol o 403 por permisos (`role-based-permissions`).
- Panel de superadmin, alta de empresas/planes y facturación (`superadmin-company-plan`).
- Desactivación masiva de sesiones, reasignación de avisos y auditoría (`user-deactivation`, `audit-trail-view`).
- Rate limiting durable, CAPTCHA, MFA, OAuth, “recordarme”, sesiones deslizantes o limpieza programada.
- RLS, Playwright/E2E, CI/CD, despliegue o secretos de producción.
- Rediseño de la home o sistema de componentes; solo login y un panel mínimo.

## Job Story

Cuando un trabajador de una empresa o el superadmin quiere entrar en la central de avisos,
quiero iniciar sesión con mi email y contraseña y que las pantallas privadas me exijan sesión,
para operar con seguridad y poder cerrar sesión dejando de tener acceso.

## Users And Permissions

- **Anónimo:** puede abrir `/`, `/health` y `/login`; `POST /api/auth/login` es público. No puede abrir `/panel`.
- **Usuario de empresa activo:** inicia sesión y accede a `/panel` con su nombre, email y empresa. No hay roles todavía; todos los autenticados ven el mismo panel.
- **Superadmin:** inicia sesión con `empresa_id` nulo y `es_superadmin = true`; `/panel` muestra “Proveedor SaaS” en vez de empresa. No obtiene funciones extra en este slice.
- **Usuario `INACTIVO` o empresa `SUSPENDIDA`:** no puede iniciar sesión y sus sesiones existentes dejan de ser válidas.
- **Nadie** puede acceder a `/panel` sin cookie de sesión válida; la comprobación ocurre en servidor, no solo en la UI.

## Acceptance Scenarios

1. **Login de empresa:** dado un usuario sembrado activo con contraseña, cuando envío email y contraseña correctos, entonces recibo 303 hacia `/panel`, cookie `central_sesion` `HttpOnly`/`SameSite=Lax` y `/panel` responde 200 mostrando nombre, email y empresa.
2. **Login de superadmin:** dado el superadmin sembrado, cuando inicia sesión, entonces entra en `/panel` y ve “Proveedor SaaS” sin empresa asociada.
3. **Credenciales incorrectas:** dada una contraseña errónea o un email inexistente, cuando intento entrar, entonces recibo el mismo mensaje genérico “Email o contraseña incorrectos.”, no se crea sesión y no se emite cookie.
4. **Usuario o empresa bloqueados:** dado un usuario inactivo o una empresa suspendida, cuando intenta iniciar sesión o usar una sesión previa, entonces se rechaza el acceso y `/panel` redirige a `/login`.
5. **Ruta privada sin sesión:** dado un visitante sin cookie, cuando abre `/panel`, entonces recibe redirección a `/login?next=%2Fpanel`; tras autenticarse vuelve a `/panel`.
6. **Redirección segura:** dado `next=//evil.example` o una URL absoluta, cuando inicio sesión, entonces se ignora y voy a `/panel` (sin open redirect).
7. **Logout:** dada una sesión válida, cuando envío `POST /api/auth/logout`, entonces la sesión queda revocada en base de datos, la cookie se borra y `/panel` vuelve a redirigir a `/login`.
8. **Sesión caducada/revocada:** dada una sesión con `expira_en` pasado o `revocada_en` no nulo, cuando abro `/panel`, entonces se trata como no autenticada.
9. **Usuario invitado sin contraseña:** dado un usuario con `password_hash` nulo (invitación futura), cuando intenta iniciar sesión, entonces se rechaza con el mensaje genérico sin revelar el motivo.
10. **Gate sin base de datos:** dado un clon sin PostgreSQL ni `DATABASE_URL`, cuando ejecuto `npm run build` e `init.sh`, entonces lint, typecheck, tests unitarios y build pasan; no se conecta a la base ni se arranca servidor.

## Repository Research

### Files Inspected

- `AGENTS.md`, `PROGRESS.md`, `feature_list.json` — workflow, estado y alcance exacto de la feature.
- `ARCHITECTURE.md`, `CONSTRAINTS.md` — capas, Prisma perezoso, tenancy, migraciones y reglas MUST/MUST NOT.
- `docs/specs/bootstrap-web-app.md`, `docs/specs/database-foundation.md` — formato de spec y decisiones previas.
- `CONTEXT.md`, `docs/build-brief.md`, `docs/domain-model.md`, `docs/user-and-access-model.md` — usuario, email único global, superadmin, sesiones revocables y no autoregistro.
- `docs/technical-discovery.md`, `docs/risks-and-open-questions.md`, `DESIGN.md` — auth, riesgos, tokens, formularios y accesibilidad.
- `prisma/schema.prisma`, `prisma/migrations/20261113230600_init/migration.sql`, `prisma/migrations/20261113230613_constraints/migration.sql` — `usuarios` sin `password_hash`, CHECKs y convenciones snake_case.
- `src/db/client.ts`, `src/db/tenant.ts`, `src/db/db-test-utils.ts`, `src/db/db-test-setup.ts`, `src/db/schema.db.test.ts`, `src/db/tenant-isolation.db.test.ts` — cliente perezoso, tenant y patrón de tests con rollback.
- `src/app/health/route.ts`, `src/lib/health.ts`, `src/lib/db-health.ts`, `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css` — route handler dinámico, home y tokens visuales.
- `package.json`, `vitest.config.ts`, `vitest.db.config.ts`, `init.sh`, `README.md`, `.env.example`, `prisma.config.ts`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`.

### Existing Patterns To Follow

- App Router en `src/app/`; lógica testeable en `src/lib/`; datos y Prisma en `src/db/`; `src/lib` no importa de `src/app`.
- `getDb()` es perezoso: importar módulos no exige `DATABASE_URL`; el build no debe abrir conexiones.
- Migraciones SQL versionadas con `npm run db:migrate`/`db:deploy`; nunca `db push`.
- `npm test` es unitario y sin BD; `*.db.test.ts` se ejecuta con `npm run test:db` en serie y con rollback.
- `init.sh` ejecuta `db:generate`, lint, typecheck, test y build; no arranca PostgreSQL ni servidor.
- Documentación en español; Tailwind 4 con tokens en `@theme`; sin `middleware.ts`/`proxy.ts`, Playwright ni seed.

### Current Gaps

- No hay autenticación, sesiones, cookies, `password_hash`, seed ni rutas privadas.
- No hay ningún route handler de API ni formularios; la home solo enlaza a `/health`.
- `schema.db.test.ts` espera exactamente tres tablas; añadir `sesiones` obliga a actualizarlo.
- No existe rate limiting, almacén de intentos ni infraestructura de email; `node_modules` no está instalado, así que no se pudieron leer las guías de Next.js 16.

### Open Unknowns (marcar como unknown hasta verificar)

- **Next.js 16:** antes de codificar, leer `node_modules/next/dist/docs/` sobre `cookies()` asíncrona, `searchParams` como `Promise`, `redirect()` y cookies en route handlers. No asumir APIs de Next 14/15.
- **`tsx`:** no está instalado; su versión y compatibilidad con el cliente Prisma generado se fijan al implementar. Si falla, usar un runner equivalente documentado.
- **PostgreSQL real:** la migración y `npm run test:db` no se han ejecutado para esta spec; el planner no tiene shell.
- **Coste de scrypt:** medir login en el equipo local; ajustar solo si el login o los tests resultan inaceptables, dejándolo documentado.
- **Auth.js:** no está instalado; cualquier comparación de versiones es teórica. No se adopta (ver decisión).

## Technical Approach

1. **Sesión propia con base de datos, sin Auth.js.** Auth.js con `Credentials` usa sesiones JWT y no permite revocar en servidor sin lógica extra; aquí se exige sesión revocable, superadmin con `empresa_id` nulo y flujos futuros de invitación/roles. Una sesión opaca persistida usa el Prisma existente, no añade una dependencia de auth no verificada y mantiene una única fuente de verdad. No se inventa criptografía: se usan primitivas de `node:crypto`.

2. **Hash de contraseña: scrypt nativo versionado.** `src/lib/auth/password.ts` expone `hashPassword`/`verifyPassword` con `scrypt`, salt aleatorio de 16 bytes, clave de 64 bytes, `N=2^17`, `r=8`, `p=1`, `maxmem` 256 MiB y `timingSafeEqual`. Formato `scrypt$v=1$N=131072,r=8,p=1$<salt_b64url>$<hash_b64url>` para permitir rehash futuro (p. ej. Argon2id). Se limita la contraseña a 128 caracteres y el email a 254. Para email inexistente o sin hash se verifica contra un hash dummy válido y se devuelve el mismo error genérico, evitando enumeración evidente. Argon2id nativo se descarta por riesgo de binarios/prebuilds no verificados en Node 26/Windows; scrypt es aceptado por OWASP y no requiere dependencia.

3. **Esquema y migración.** `Usuario` gana `passwordHash String? @map("password_hash")`: nullable para invitados creados antes de definir contraseña; login lo trata como credencial inválida. Nueva tabla `sesiones` (`id` UUID, `usuario_id` FK `ON DELETE CASCADE`, `token_hash` único, `creada_en`, `expira_en`, `revocada_en` nullable; índices por usuario y expiración; CHECK `expira_en > creada_en`). CASCADE solo afecta a sesiones; los usuarios no se borran en el MVP. Migración SQL versionada con `npm run db:migrate -- --name auth-sessions`; nunca `db push`. Actualizar `schema.db.test.ts` para incluir `sesiones` y columnas nuevas.

4. **Sesión y cookie.** Token de 32 bytes `base64url`; en BD solo SHA-256 hex (`token_hash`), nunca el token crudo. Cookie `central_sesion`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=43200` (12 h absolutas, sin renovación deslizante), `Secure` cuando la petición llega por HTTPS (`x-forwarded-proto`/URL), no solo por `NODE_ENV`, para que `next start` local funcione. La BD manda: una cookie con sesión revocada, expirada, usuario inactivo o empresa suspendida no autentica. Logout marca `revocada_en` y borra la cookie. Se permiten sesiones concurrentes; el logout revoca solo la actual; la desactivación futura revocará todas.

5. **CSRF y HTTP.** Login/logout son `POST` en route handlers (`/api/auth/login`, `/api/auth/logout`) con `application/x-www-form-urlencoded`; `GET` devuelve 405. Comprobar mismo origen cuando venga `Origin` (rechazar si no coincide con host/protocolo), usar 303 en redirecciones y confiar en `SameSite=Lax` como segunda capa. Sin endpoints JSON ni mutaciones por GET. Los errores de BD no se filtran: login devuelve un error genérico de servicio.

6. **Rutas y protección.** Públicas: `/`, `/login`, `/health` y los dos endpoints de auth. Privada: `/panel`, cuyo `layout.tsx` llama a `requireSession("/panel")`; si no hay sesión, `redirect("/login?next=%2Fpanel")`. `/login` redirige a `/panel` si ya hay sesión. El parámetro `next` se valida: solo rutas relativas que empiezan por `/` y no por `//`; si no, `/panel`. **No se usa middleware/proxy como frontera de seguridad**: no puede validar la sesión de BD de forma fiable y es fácil de eludir; cada layout/action privado debe llamar a `requireSession`. `getCurrentSession()` lee `cookies()`, hashea el token y consulta `sesiones` con usuario y empresa; se memoiza por petición con `cache()` de React. `/login` y `/panel` se marcan `force-dynamic` para que el build no consulte la BD.

7. **Servicio de autenticación testeable.** `authenticateCredentials({ db, email, password })` recibe el cliente Prisma explícito (`PrismaClient` o `TransactionClient`) para poder probarlo dentro de `inRollback`. Normaliza email (trim + minúsculas), busca por email único global (excepción acotada a identidad: no es una consulta de datos de tenant), verifica estado de usuario y empresa, y crea la sesión. Devuelve un resultado tipado sin secretos. No registrar email/contraseña/token en logs.

8. **Seed mínimo.** `prisma/seed.ts` + `npm run db:seed` con `tsx` como devDependency (versión fijada al instalar). Idempotente por `upsert`: plan demo, empresa demo, administrador de empresa y superadmin; contraseñas desde `SEED_*` en `.env`, con valores de ejemplo solo locales en `.env.example`. Rechaza ejecutarse con `NODE_ENV=production`. No forma parte de `init.sh`; se ejecuta tras `db:deploy` para la prueba manual.

9. **Rate limiting: diferido explícitamente.** No se añade un limitador en memoria (poco fiable con varias instancias/serverless). Mitigaciones de este slice: error genérico, hash dummy, scrypt costoso y límite de longitud. Antes de exponer fuera de demo/producción debe añadirse rate limiting en edge/WAF o en BD; queda registrado como riesgo y tarea de endurecimiento.

10. **Tests.** Unitarios puros para hash, token, normalización, validación de `next` y same-origin. Integración real en `src/lib/auth/auth.db.test.ts` usando `inRollback` y el cliente de transacción: credenciales válidas/incorrectas, email inexistente, usuario inactivo, empresa suspendida, superadmin, sesión expirada/revocada/logout y token hasheado. Sin Playwright: los formularios no tienen JavaScript de cliente y el flujo HTTP se verifica con `curl` y cookie jar; el primer flujo interactivo (bandeja del técnico) introducirá Playwright.

## Expected File Changes

- `prisma/schema.prisma` — modify; `passwordHash` y modelo `Sesion` con relación a `Usuario`.
- `prisma/migrations/<timestamp>_auth_sessions/migration.sql` — create; columna, tabla, FK, índices y CHECK.
- `prisma/seed.ts` — create; seed idempotente de plan, empresa, admin y superadmin.
- `src/lib/auth/password.ts`, `src/lib/auth/session-token.ts` — create; scrypt versionado, normalización de email, token aleatorio y SHA-256.
- `src/lib/auth/session.ts`, `src/lib/auth/current-session.ts` — create; crear/validar/revocar sesión con `db` explícito, lectura de cookie, `cache()`, `getCurrentSession()` y `requireSession()`.
- `src/lib/auth/redirect.ts`, `src/lib/auth/origin.ts` — create; `safeNextPath()` contra open redirect y comprobación same-origin.
- `src/lib/auth/*.test.ts`, `src/lib/auth/auth.db.test.ts` — create; unitarios e integración con rollback.
- `src/app/api/auth/login/route.ts`, `src/app/api/auth/logout/route.ts` — create; POST, 405 en GET, 303 y cookie.
- `src/app/login/page.tsx`, `src/app/panel/layout.tsx`, `src/app/panel/page.tsx` — create; formulario server-rendered, layout protegido y panel mínimo con logout.
- `src/app/page.tsx` — modify; enlace a `/login` manteniendo el enlace a `/health`.
- `src/app/globals.css` — modify; añadir token `--color-danger` de `DESIGN.md` si se usa en errores.
- `src/db/schema.db.test.ts` — modify; incluir `sesiones`, `password_hash`, FK e índices.
- `package.json`, `package-lock.json` — modify; `db:seed` y `tsx` devDependency.
- `.env.example` — modify; variables `SEED_*` de ejemplo local.
- `README.md`, `AGENTS.md`, `ARCHITECTURE.md`, `CONSTRAINTS.md`, `docs/technical-discovery.md`, `docs/risks-and-open-questions.md`, `docs/user-and-access-model.md` — update; ver documentación durable.
- `init.sh` — modify solo los mensajes finales (seed/login); el gate no cambia y no arranca servicios. `PROGRESS.md` y `feature_list.json` — modify al implementar; no en esta planificación.

## Visual Design Impact

- UI involved: yes.
- Design source: `DESIGN.md`; usar los tokens existentes de `globals.css`.
- Screens or states affected: `/login` (reposo, error de credenciales, error de servicio, foco, carga) y `/panel` (usuario de empresa vs superadmin, logout).
- New design artifact required: no — reutilizar tarjeta, input 44-48 px, botón primario navy, tipografía del sistema mientras no se carguen Instrument Sans/Inter.
- Login: tarjeta `surface` centrada sobre `background`, wordmark “Central de avisos”, `h1` “Iniciar sesión”, etiquetas persistentes, `autocomplete="email"`/`current-password`, error en `danger` con texto (nunca solo color) y resumen accesible, botón primario a ancho completo, foco latón visible.
- Panel: cabecera sobria con marca, nombre/email, empresa o “Proveedor SaaS” y botón secundario “Cerrar sesión”; contenido mínimo “Sesión iniciada” y siguiente paso. Móvil: una columna, márgenes 16 px, objetivo táctil ≥48 px. No inventar logo ni gradientes.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — capa de auth, `password_hash`, `sesiones`, cookie/revocación, protección de rutas sin middleware, superadmin y frontera server-only.
- `CONSTRAINTS.md`: update — MUST toda ruta privada pasa por `requireSession`; MUST NOT usar middleware/proxy como autorización; MUST token de sesión hasheado y cookie HttpOnly/SameSite; MUST validar usuario/empresa activos en cada petición; MUST hash scrypt versionado y error genérico; MUST login por email global y sesión por token son excepciones acotadas de identidad, no consultas de dominio; MUST rate limiting antes de producción.
- `AGENTS.md`: update — `db:seed`, credenciales locales, `/login` y `/panel`, variables `SEED_*`, y que el gate no necesita BD.
- `README.md`: update — seed, login/logout, cookie/duración, rutas privadas, smoke HTTP y advertencia de credenciales solo locales.
- `docs/technical-discovery.md`, `docs/risks-and-open-questions.md`: update — sesión propia vs Auth.js, scrypt, CSRF, rate limiting diferido, brute force, limpieza de sesiones, Playwright y `tsx`/seed.
- `docs/user-and-access-model.md`: update — nota de implementación: sesión absoluta 12 h, logout revoca, login comprueba usuario y empresa activos; invitaciones/roles siguen fuera.
- `docs/domain-model.md`, `CONTEXT.md`, `DESIGN.md`: not needed — no cambia el lenguaje de dominio ni la dirección visual.
- `PROGRESS.md`, `feature_list.json`: update al implementar — obligatorio por la definición de terminado.

## Implementation Plan

1. Leer las guías de Next.js 16 en `node_modules/next/dist/docs/` tras `npm ci`; confirmar `cookies()`, `searchParams`, `redirect` y cookies en route handlers.
2. Implementar `password.ts`, `session-token.ts`, `redirect.ts` y `origin.ts` con tests unitarios; fijar constantes de scrypt y sesión.
3. Añadir `passwordHash` y `Sesion` al esquema; generar y aplicar la migración; actualizar `schema.db.test.ts`.
4. Implementar `session.ts` y `current-session.ts`; crear los route handlers de login/logout y las páginas `/login` y `/panel`.
5. Añadir `tsx` y `prisma/seed.ts`; documentar `.env.example`; ejecutar `db:deploy` + `db:seed` en local.
6. Cubrir integración con `auth.db.test.ts`, ejecutar `test:db`, gate, `init.sh` sin BD y smoke HTTP con `curl`.
7. Actualizar documentación durable, `PROGRESS.md` y `feature_list.json` con evidencia real.

## Implementation Tasks

- [ ] Leer la documentación de Next.js 16 instalada y registrar las APIs usadas.
- [ ] Crear `password.ts` (scrypt, normalización, hash dummy), `session-token.ts`, `redirect.ts` y `origin.ts`; tests unitarios.
- [ ] Añadir `password_hash` y `sesiones` al esquema y generar la migración `auth_sessions`.
- [ ] Actualizar `schema.db.test.ts` para la cuarta tabla, columna, FK e índices.
- [ ] Implementar `session.ts` y `current-session.ts` con validación de usuario/empresa y `requireSession`.
- [ ] Crear `/api/auth/login` y `/api/auth/logout` con POST, same-origin, 303 y cookie.
- [ ] Crear `/login` y `/panel` con diseño accesible; enlazar desde la home.
- [ ] Añadir seed idempotente y `npm run db:seed`; documentar variables `SEED_*`.
- [ ] Escribir `auth.db.test.ts` con rollback y cubrir todos los escenarios.
- [ ] Ejecutar `db:deploy`, `test:db`, gate, `init.sh` sin BD y smoke HTTP con `curl`.
- [ ] Actualizar documentación durable, `PROGRESS.md` y `feature_list.json` con evidencia.

## Verification Plan

### Base de datos real

```bash
npm run db:deploy
npm run db:status
npm run test:db
npm run db:seed
```

Comprobar con `psql` o Prisma: `usuarios.password_hash` existe y es nullable; `sesiones` tiene `token_hash` único, FK `ON DELETE CASCADE`, índices y CHECK de expiración; el seed no duplica al ejecutarlo dos veces. Para base vacía, repetir `db:deploy` sobre una base de verificación y borrarla al terminar.

### Gate estándar y `init.sh`

```bash
npm run lint
npm run typecheck
npm test
npm run build
& "C:\Program Files\Git\bin\bash.exe" init.sh
```

Resultado esperado: todo exit 0 sin `DATABASE_URL` ni PostgreSQL. `init.sh` ejecuta `db:generate` + gate, no arranca servicios ni ejecuta el seed; solo imprime `db:seed`, `npm run dev`, `/login` y `/panel`.

### Smoke HTTP (sustituye al E2E en este slice)

Con PostgreSQL, migraciones y seed aplicados, arrancar `npm run dev` o `next start` y usar Git Bash:

```bash
curl -i http://localhost:3000/panel
curl -i -c cookies.txt -X POST -H "Origin: http://localhost:3000" \
  -d "email=admin@demo.local&password=<SEED_ADMIN_PASSWORD>" \
  http://localhost:3000/api/auth/login
curl -i -b cookies.txt http://localhost:3000/panel
curl -i -X POST -H "Origin: http://localhost:3000" \
  -d "email=admin@demo.local&password=incorrecta" \
  http://localhost:3000/api/auth/login
curl -i -b cookies.txt -c cookies.txt -X POST -H "Origin: http://localhost:3000" \
  http://localhost:3000/api/auth/logout
curl -i -b cookies.txt http://localhost:3000/panel
```

Esperado: primer `/panel` 307 a `/login?next=%2Fpanel`; login correcto 303, `Set-Cookie` con `HttpOnly`, `SameSite=Lax`, `Max-Age=43200` (sin `Secure` en local); `/panel` 200; contraseña incorrecta 303 a `/login?error=credenciales` sin cookie y mismo mensaje que email inexistente; logout 303 y cookie borrada; `/panel` vuelve a redirigir. Repetir con el superadmin y comprobar “Proveedor SaaS”. Revisar `/login` y `/panel` en navegador a 390 px y con teclado.

### E2E

No se añade Playwright: no existe harness, los formularios son HTML sin JavaScript de cliente y el flujo login → ruta privada → logout se cubre con HTTP real y cookie jar. El primer flujo con interacción de cliente (bandeja/parte del técnico) introducirá Playwright; si se añade antes, no debe bloquear `init.sh` ni exigir BD en el gate.

## Evidence To Capture

- Versiones de Node/npm/Next/Prisma, nombre de la migración y salida de `db:status`.
- Salida de `test:db` con escenarios de credenciales, estados, sesión expirada/revocada y superadmin.
- Salida de `db:seed` dos veces (idempotencia) sin exponer contraseñas reales.
- Códigos 0 de lint, typecheck, test, build e `init.sh` sin BD; confirmación de que no arranca servicios.
- Salidas `curl` con códigos HTTP, `Location`, flags de cookie y mensajes de error; captura o descripción del login/panel en 390 px.
- Documentación durable actualizada, decisiones de rate limiting/Playwright registradas.
- `PROGRESS.md` y `feature_list.json` con `status: "passing"` y evidencia, o `blocked` con motivo.

## Validator Checklist

- [ ] Login, logout y protección de `/panel` cumplen los diez escenarios.
- [ ] `password_hash` y `sesiones` existen mediante migración versionada; no se usó `db push`.
- [ ] El hash es scrypt versionado; el token se guarda hasheado y la cookie es HttpOnly/SameSite/12 h (Secure en producción).
- [ ] Credenciales incorrectas, email inexistente e invitado sin contraseña devuelven el mismo error; no hay enumeración evidente.
- [ ] Usuario inactivo, empresa suspendida, sesión expirada y sesión revocada no autentican.
- [ ] El superadmin entra sin empresa y el panel muestra “Proveedor SaaS”.
- [ ] No hay open redirect: `next` se valida y por defecto va a `/panel`.
- [ ] Ninguna ruta privada confía en middleware/proxy; `requireSession` se ejecuta en servidor.
- [ ] El seed es idempotente, rechaza producción y no se ejecuta en `init.sh`.
- [ ] `init.sh`, build y tests unitarios pasan sin PostgreSQL ni `DATABASE_URL`.
- [ ] No se implementaron invitaciones, roles, reset, auditoría, rate limiting durable, Playwright ni dominio.
- [ ] `ARCHITECTURE.md`, `CONSTRAINTS.md`, `AGENTS.md`, `README.md`, discovery, riesgos, `PROGRESS.md` y `feature_list.json` están actualizados.
- [ ] No se commitearon `.env`, cookies, tokens, contraseñas ni credenciales reales.
