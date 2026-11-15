# Feature Implementation Spec: Demo pública para presentar funcionalidades

## Source Feature

- `id`: `demo-deployment`
- `area`: `operations`
- `depends_on`: `client-portal-invitation` (status `accepted`, en `main` con `a5d5164`)
- `status` en planificación: `not_started`
- `source`: `feature_list.json`. Verificación fuente: desplegar desde `main` y abrir la URL pública (`/health` 200, login con los usuarios de presentación); franja «Entorno de demostración · datos ficticios» en todas las páginas y datos de presentación; límite de intentos de login con error de bloqueo sin revelar si el email existe y login correcto tras la ventana; smoke contra la URL pública y credenciales fuera del repositorio.
- Tamaño: correcto pero en el límite. Una tabla técnica (`limites_login`) y un flujo (login con límite), más configuración de despliegue, seed de presentación y guía. No se toca ningún flujo de dominio.

## Goal

Dejar la aplicación accesible en una URL pública HTTPS de Vercel (región UE) con PostgreSQL en Neon (región UE), solo para presentar funcionalidades con datos ficticios. Antes de exponer el login se añade un límite durable de intentos en PostgreSQL (lo exige `CONSTRAINTS.md`), compatible con serverless y sin dependencias de pago. Una franja visible, activada por variable de entorno, avisa de que es una demo. Las migraciones se aplican en el build de producción; los datos de presentación se siembran desde local contra Neon con contraseñas que solo viven en `.env.demo` (ignorado por git). Una guía en `docs/` explica cómo desplegar, sembrar y resetear.

Todo lo que el implementer hace se verifica en local sin Vercel ni Neon. El despliegue real y la validación contra la URL pública los hace la sesión principal con login interactivo, siguiendo las listas exactas de esta spec.

## Non-Goals

- Producción real: dominio propio, email real, copias de seguridad, monitorización, alertas, logs estructurados, SLA.
- Despliegues de preview por PR o por rama, CI/CD propio (GitHub Actions) y entornos de staging.
- RLS, limpieza programada de sesiones, CAPTCHA, MFA, bloqueo permanente de cuentas o desbloqueo manual desde la interfaz.
- `@vercel/functions`, Upstash, KV, Edge Config, WAF de pago o cualquier dependencia nueva de runtime.
- Cambios en flujos de dominio (avisos, clientes, portal, roles) o estados nuevos de aviso. El seed de presentación solo crea avisos `NUEVO` con origen `OFICINA`.
- Metadatos `noindex`, analítica o cookies de terceros.

## Job Story

Cuando presente la central de avisos a un posible cliente,
quiero abrir una URL pública con datos ficticios creíbles y entrar con un usuario de cada rol,
para enseñar el producto sin instalar nada y sin exponer datos reales ni un login sin protección.

## Users And Permissions

- Sin cambios en la matriz de permisos. Usuarios de presentación (Empresa Demo): administradora, oficina, técnico, encargado (ADMINISTRADOR+TECNICO), un usuario de cliente con acceso al portal y el superadmin (sin empresa).
- **Anónimo:** el límite de login se aplica a cualquiera que haga `POST /api/auth/login`, exista o no el email.
- **Operador de la demo (humano):** único que ejecuta `demo:*` desde local con `.env.demo`. Las variables `SEED_*` nunca se configuran en Vercel.

## Acceptance Scenarios

1. **Límite por email.** Dado un email (exista o no), cuando se envían 5 POST de login fallidos en la ventana, el 6.º (incluso con la contraseña correcta) responde 303 a `/login?error=bloqueado&next=...` sin `Set-Cookie` y sin ejecutar scrypt; la página muestra «Demasiados intentos. Espera unos minutos y vuelve a intentarlo.» (`role="alert"`). El mensaje y el código son idénticos para un email existente y uno inexistente.
2. **Fin de la ventana.** Pasada la ventana (`ventana_inicio` + `LOGIN_RATE_LIMIT_WINDOW_SECONDS`, por defecto 900 s), el login correcto vuelve a funcionar (303 a `/panel` con cookie). Un login correcto antes del bloqueo borra el contador de ese email.
3. **Límite por IP.** Con 50 intentos sin éxito desde la misma IP en la ventana, cualquier email recibe `error=bloqueado`. Un login correcto descuenta su intento del contador de IP (los logins correctos de una presentación no agotan el cupo). Sin IP identificable solo se aplica el límite por email.
4. **Atomicidad.** 10 registros concurrentes del mismo email producen contadores 1..10 sin huecos ni duplicados (upsert atómico en PostgreSQL); no hay estado en memoria.
5. **Fallo del limitador.** Si la consulta del limitador falla, el login responde `error=servicio` (falla cerrado) y no autentica.
6. **Franja de demo.** Con `DEMO_MODE=true` (en build y runtime), toda página HTML (`/`, `/login`, `/panel/*`, `/portal/*`, `/superadmin/*`, `/invitacion/*`, 403 y 404 propios) muestra arriba «Entorno de demostración · datos ficticios», sin scroll horizontal a 390 px y con contraste AA. Sin la variable (o con otro valor) no aparece. `/health` sigue siendo JSON sin cambios.
7. **Build de producción con migraciones.** `bash scripts/vercel-build.sh` con `VERCEL_ENV=production` aplica `prisma migrate deploy` usando `DATABASE_URL_UNPOOLED` (o `DATABASE_URL` si falta) y después `next build`. Con cualquier otro `VERCEL_ENV` termina con código ≠ 0 sin migrar. `vercel.json` hace que Vercel ignore los builds que no son de producción.
8. **Seed de presentación.** `npm run demo:seed` carga solo el archivo de entorno de demo (`.env.demo` o `DEMO_ENV_FILE`), nunca `.env`, imprime el host destino sin credenciales y crea de forma idempotente: Empresa Demo (plan, facturación serie `F`, 45,00 €/h, `NO_VERIFACTU`), los 6 usuarios, 3 clientes con 1-2 sedes y contactos, el usuario de cliente vinculado a un contacto y 6 avisos `NUEVO`/`OFICINA` con prioridades Normal, Alta y Urgente. Ejecutado dos veces, los recuentos no cambian. Rechaza `NODE_ENV=production`, contraseñas de menos de 12 caracteres y las contraseñas de ejemplo de `.env.example`/`.env.demo.example`, sin tocar la base.
9. **Smoke remoto.** `SMOKE_BASE_URL=<url> bash scripts/validate-smoke.sh` no arranca servidor ni exige build ni `DATABASE_URL`, y ejecuta las mismas comprobaciones contra esa URL. `SMOKE_EXPECT_DEMO_BANNER=1` comprueba la franja en `/` y `/login`; `SMOKE_RATE_LIMIT=1` comprueba el bloqueo con un email aleatorio inexistente (`smoke-<aleatorio>@demo.invalid`).
10. **Secretos.** Ni las contraseñas de demo ni las URLs de Neon aparecen en el árbol ni en el historial; solo se versionan `.env.example` y `.env.demo.example` (con valores vacíos).
11. **Gate sin BD.** `init.sh` pasa sin `DATABASE_URL` ni `.env`.

## Repository Research

### Files Inspected

- `AGENTS.md`, `PROGRESS.md` (Session 030), `feature_list.json`: decisión del usuario y alcance mínimo; dependencia aceptada.
- `CONSTRAINTS.md`: rate limiting durable obligatorio antes de exponer el login; seed con `SEED_*`, idempotente y prohibido en producción; pipeline con devDependencies; `prisma.config.ts` con URL opcional; `Object.hasOwn` para `?error=`; formularios con navegador real.
- `docs/technical-discovery.md` (despliegue en UE, rate limiting diferido), `docs/risks-and-open-questions.md` (fuerza bruta), `DESIGN.md` (tokens, contraste AA, 48 px).
- `src/app/api/auth/login/route.ts`: `isSameOrigin` → `formData` → `authenticateCredentials` → 303; códigos `credenciales`/`servicio`.
- `src/app/login/page.tsx`: `ERROR_MESSAGES[errorCode]` indexa un objeto literal (incumple la regla de `Object.hasOwn`; se corrige al añadir `bloqueado`).
- `src/lib/auth/session.ts` (`authenticateCredentials` con hash dummy), `src/lib/auth/password.ts` (`normalizeEmail`, `isEmailLengthValid`), `src/lib/auth/origin.ts` (`x-forwarded-host`/`-proto`, `isSecureRequest`).
- `src/db/client.ts`: `PrismaPg` perezoso con `connectionTimeoutMillis: 2000`.
- `prisma.config.ts` (`dotenv/config`, URL solo de `DATABASE_URL`), `prisma/schema.prisma`, `prisma/seed.ts` (upserts, `requireEnv`, rechazo de producción).
- `package.json` (scripts, Node `>=22.12.0`, `dotenv` 18 en devDependencies), `.gitignore` (`.env.*` ignorado salvo `.env.example`), `.env.example`, `next.config.ts`, `src/app/layout.tsx`, `scripts/validate-smoke.sh` (arranca `next start`, `BASE_URL` fijo a `127.0.0.1`, exige `.next/BUILD_ID` y `.env`).
- No inspeccionado: `node_modules/next/dist/docs/` (no hay `node_modules` en este worktree). El implementer debe leer tras `npm ci` las guías de variables de entorno y renderizado estático/dinámico antes de implementar la franja.

### Existing Patterns To Follow

- Migración SQL versionada con `db:migrate --create-only`, CHECK en SQL y `migrate diff` vacío; `test:db` con `inRollback` y base vacía temporal.
- Route handler con 303 y `?error=`; mensajes por `Object.hasOwn`/`Map`.
- Seed con `upsert` dentro de `$transaction`, sin imprimir contraseñas.
- Smoke con `curl --max-time 10`, cookie jars temporales y limpieza en `trap`.

### Current Gaps

- No hay limitador de login, ni configuración de Vercel, ni URL directa separada para migraciones, ni franja de demo, ni seed con clientes/avisos, ni modo remoto del smoke.

## Technical Approach

1. **Tabla `limites_login`** (migración `prisma/migrations/20261115120000_limites_login/`, timestamp posterior a `20261115100000`). Tabla técnica global **sin `empresa_id`** (como `planes`; la identidad precede al tenant):
   - `clave TEXT PRIMARY KEY` — `email:<sha256 hex del email normalizado>` o `ip:<sha256 hex de la IP>`; nunca el email ni la IP en claro.
   - `intentos INTEGER NOT NULL`, `ventana_inicio TIMESTAMPTZ(3) NOT NULL`, índice en `ventana_inicio`, CHECK `limites_login_intentos_positivos` (`intentos >= 0`) y CHECK de prefijo de clave (`clave ~ '^(email|ip):[0-9a-f]{64}$'`).
   - Modelo Prisma `LimiteLogin @@map("limites_login")`.
2. **`src/lib/auth/rate-limit.ts`** (servidor) con partes puras testeables:
   - Constantes: `MAX_INTENTOS_EMAIL = 5`, `MAX_INTENTOS_IP = 50`; `loginRateLimitWindowSeconds(env)` lee `LOGIN_RATE_LIMIT_WINDOW_SECONDS` (entero 60-3600; ausente o inválido → 900).
   - `rateLimitKeys(email, headers)`: clave de email con `normalizeEmail` + SHA-256; IP de `x-real-ip` o el primer valor de `x-forwarded-for` (en Vercel los fija la plataforma; en local son falsificables y solo queda el límite por email).
   - `registerLoginAttempt(db, keys, windowSeconds)`: por cada clave, un único `$queryRaw` atómico con todo el cálculo de tiempo en SQL (`now()`, evita el desfase horario conocido del adapter): `INSERT … VALUES (clave, 1, now()) ON CONFLICT (clave) DO UPDATE SET intentos = CASE WHEN limites_login.ventana_inicio <= now() - make_interval(secs => $w) THEN 1 ELSE limites_login.intentos + 1 END, ventana_inicio = CASE … THEN now() ELSE limites_login.ventana_inicio END RETURNING intentos`. Devuelve `bloqueado` si el email supera 5 o la IP supera 50. Aprovecha para borrar filas con `ventana_inicio < now() - interval '1 day'`.
   - `clearLoginAttemptsOnSuccess(db, keys)`: borra la fila del email y descuenta 1 a la de IP (`GREATEST(intentos - 1, 0)`).
3. **Login** (`src/app/api/auth/login/route.ts`): tras `isSameOrigin` y `formData`, y antes de `authenticateCredentials`, registra el intento (también con email no string o vacío: clave de email vacía normalizada). Bloqueado → `loginErrorRedirect(request, "bloqueado", next)` sin scrypt. Excepción del limitador → `servicio`. Éxito → `clearLoginAttemptsOnSuccess` (si falla, se ignora: la sesión ya es válida) y la cookie como hoy. `src/app/login/page.tsx`: añade `bloqueado` y busca con `Object.hasOwn`.
4. **Franja de demo.** `src/lib/demo.ts` con `isDemoMode(env)` (`DEMO_MODE === "true"`, puro y testeado). `src/app/_components/demo-banner.tsx` (servidor) renderizado en `src/app/layout.tsx` como primer hijo de `<body>`: `<div role="note">` a todo el ancho, fondo `warning` `#B4771B`, texto blanco 14 px semibold centrado («Entorno de demostración · datos ficticios», contraste 4.78:1), padding 8 px, sin cerrar ni sticky. Las páginas estáticas (`/`) leen la variable en build: la guía documenta que cambiarla exige redeploy. El implementer confirma este comportamiento en `node_modules/next/dist/docs/` y lo verifica construyendo con y sin `DEMO_MODE`.
5. **Conexión.** `prisma.config.ts` usa `DATABASE_URL_UNPOOLED || DATABASE_URL` (sigue opcional). La app en runtime solo usa `DATABASE_URL` (pooler de Neon, host `-pooler`, `sslmode=require`). `src/db/client.ts` lee `DATABASE_CONNECTION_TIMEOUT_MS` (entero 500-30000; por defecto 2000) para tolerar el arranque en frío de Neon (en Vercel, 10000).
6. **Build en Vercel.** `scripts/vercel-build.sh` (bash, `set -euo pipefail`): exige `VERCEL_ENV=production` (si no, mensaje y `exit 1`), exige `DATABASE_URL` y ejecuta `npx prisma migrate deploy` y `npx next build`. No imprime URLs. `vercel.json`: `"framework": "nextjs"`, `"buildCommand": "bash scripts/vercel-build.sh"`, `"regions": ["fra1"]` y `"ignoreCommand": "if [ \"$VERCEL_ENV\" = \"production\" ]; then exit 1; else exit 0; fi"` (exit 0 = build ignorado). La instalación de Vercel incluye devDependencies (`postinstall` genera Prisma).
7. **Entorno de demo local.** `scripts/with-demo-env.sh`: usa `DEMO_ENV_FILE` (por defecto `.env.demo`), falla si no existe o si `NODE_ENV=production`, hace `unset DATABASE_URL DATABASE_URL_UNPOOLED` y exporta `DOTENV_CONFIG_PATH` con ese archivo para que `dotenv/config` (en `prisma.config.ts` y en los scripts) cargue solo el archivo de demo; exige que defina `DATABASE_URL` y `DATABASE_URL_UNPOOLED`; imprime el host destino sin usuario ni contraseña; ejecuta el comando recibido. Si `dotenv` 18 no respeta `DOTENV_CONFIG_PATH`, exportar las variables con `set -a; source "$file"; set +a` y documentarlo en Implementation Findings. Scripts npm: `demo:status` (`prisma migrate status`), `demo:migrate` (`prisma migrate deploy`, por si hace falta fuera del build) y `demo:seed` (`tsx prisma/seed-demo.ts`), todos vía el wrapper.
8. **Seed.** Extraer la lógica de `prisma/seed.ts` a `prisma/seed/base.ts` (`seedBase(tx, config)`, sin `dotenv` ni `main`); `prisma/seed.ts` mantiene el comportamiento y la salida actuales. `prisma/seed/presentacion.ts` añade de forma idempotente (por `(empresaId, nif)` en clientes, `(clienteId, nombre)` en sedes, `(clienteId, email)` en contactos, `(clienteId, descripcion)` en avisos) tres clientes ficticios (p. ej. «Comunidad de Propietarios Río Tajo», «Hotel Mirador del Parque», «Clínica Dental Sonrisas», con NIF ficticios válidos de formato), sus sedes, contactos y 6 avisos; y el usuario de cliente `SEED_CLIENTE_EMAIL` (por defecto `cliente@demo.local`, ACTIVO, `cliente_id` y `contacto_id` de un contacto con ese email, sin roles). `prisma/seed-demo.ts`: `import "dotenv/config"`, rechaza producción, valida contraseñas (≥ 12, distintas de los ejemplos), ejecuta base + presentación en una transacción e imprime recuentos sin contraseñas. Variables: `SEED_ADMIN_PASSWORD`, `SEED_SUPERADMIN_PASSWORD`, `SEED_EQUIPO_PASSWORD`, `SEED_CLIENTE_PASSWORD` (obligatorias) y los `SEED_*_EMAIL` opcionales.
9. **Smoke.** `scripts/validate-smoke.sh`: con `SMOKE_BASE_URL` (sin barra final) omite el arranque, las comprobaciones de build/`.env`/puerto y el `kill`; las comprobaciones de `Location` quitan `BASE_URL` del prefijo. Añade `SMOKE_EXPECT_DEMO_BANNER=1` y `SMOKE_RATE_LIMIT=1` (6 POST con email aleatorio inexistente: los 5 primeros `error=credenciales`, el 6.º `error=bloqueado`). Sin variables nuevas, el comportamiento local no cambia.
10. **Documentación.** `.env.demo.example` (versionado, valores vacíos y comentarios) y `!.env.demo.example` en `.gitignore`; `.env.example` añade comentadas `DATABASE_URL_UNPOOLED`, `DEMO_MODE`, `LOGIN_RATE_LIMIT_WINDOW_SECONDS`, `DATABASE_CONNECTION_TIMEOUT_MS` y `SEED_CLIENTE_*`. Guía `docs/operacion-demo.md` con la sección «Pasos de despliegue» y «Validación pública» de esta spec, más sembrar, resetear (ver abajo), rotar contraseñas y apagar la demo.

### Pasos de despliegue (los ejecuta la sesión principal tras el merge a `main`)

1. Neon (el proyecto **ya existe** en `aws-eu-central-1`; no crear otro): `neonctl auth`; `neonctl projects list` para obtener su id; `neonctl connection-string --project-id <id> --pooled` (→ `DATABASE_URL`) y `neonctl connection-string --project-id <id>` (directa → `DATABASE_URL_UNPOOLED`), ambas con `sslmode=require`. Usar exactamente esos dos nombres. Anotar la versión de PostgreSQL de Neon.
2. Local: copiar `.env.demo.example` a `.env.demo` y rellenar las dos URLs y las 4 contraseñas (≥ 12 caracteres, generadas aleatoriamente, p. ej. `openssl rand -base64 18`). Comprobar `git check-ignore .env.demo`. `npm run demo:status` → conecta y lista migraciones pendientes.
3. Vercel: `vercel login`; `vercel link` (crear proyecto `central-de-avisos-demo` en la cuenta del usuario); conectar el repo de GitHub (`vercel git connect`) con rama de producción `main`; en Settings, Node.js 22.x (o 24.x).
4. Variables solo en **Production** (`vercel env add <NOMBRE> production`):

   | Variable | Valor |
   | --- | --- |
   | `DATABASE_URL` | URL pooled de Neon (`-pooler`, `sslmode=require`) |
   | `DATABASE_URL_UNPOOLED` | URL directa de Neon (`sslmode=require`) |
   | `DEMO_MODE` | `true` |
   | `DATABASE_CONNECTION_TIMEOUT_MS` | `10000` |
   | `LOGIN_RATE_LIMIT_WINDOW_SECONDS` | opcional (60-3600; por defecto 900) |

   No añadir ningún `SEED_*` ni variables en Preview/Development. Si se usa la integración de Neon en Vercel, comprobar que no crea variables en Preview.
5. Desplegar: el merge a `main` dispara el build (o `vercel deploy --prod` desde `main` actualizado). Comprobar en el log del build `vercel-build: migraciones con DATABASE_URL_UNPOOLED (conexión directa).`, `prisma migrate deploy` aplicando las 10 migraciones (última `20261115120000_limites_login`) y `next build` OK; región de funciones `fra1`.
6. Sembrar desde local, en **Git Bash** (desde PowerShell `bash` puede ser el de WSL): `npm run demo:seed` dos veces; ambas imprimen `Empresa Demo: 5 usuarios, 3 clientes, 5 sedes, 5 contactos, 6 avisos (+1 superadmin sin empresa)`. `npm run demo:status` → «Database schema is up to date!».
7. Resetear (cuando haga falta, operación humana): `bash scripts/with-demo-env.sh npx prisma migrate reset --force --skip-seed` (o «Reset from parent» del branch en Neon y `npm run demo:migrate`), y después `npm run demo:seed`.

### Validación pública (la ejecuta la sesión principal; `<url>` = URL de producción)

1. `curl --max-time 10 -sS https://<url>/health` → 200 `"status":"ok"` y `"database":{"status":"up"}`, sin credenciales.
2. `SMOKE_BASE_URL=https://<url> SMOKE_EXPECT_DEMO_BANNER=1 SMOKE_RATE_LIMIT=1` + `SMOKE_EMAIL/PASSWORD` (superadmin), `SMOKE_NORMAL_*` (admin), `SMOKE_OFICINA_*`, `SMOKE_TECNICO_*`, `SMOKE_CLIENTE_*` → `bash scripts/validate-smoke.sh` exit 0. Las contraseñas se pasan desde `.env.demo` sin imprimirlas.
3. Navegador real (Edge headless por CDP o manual): franja visible en `/`, `/login`, `/panel`, `/panel/clientes`, `/portal`, `/superadmin` y un 404, a 390 px sin scroll horizontal; login desde el formulario con cada usuario (POST con `Origin: https://<url>`, cookie `Secure`); `/panel/clientes` muestra 3 clientes, `/panel/avisos` 6 avisos con las tres prioridades, el portal muestra solo las sedes de su cliente.
4. Rate limit: con `tecnico@demo.local`, 5 contraseñas erróneas desde el formulario y la 6.ª correcta → mensaje de bloqueo; con un email inexistente, mismo mensaje en el 6.º; tras 15 min, login correcto → `/panel`.
5. Secretos: con las contraseñas y URLs de `.env.demo` en un archivo temporal fuera del repo, `git grep -F -f <archivo>` y `git log --all -p | grep -F -c -f <archivo>` → 0; `git ls-files | grep -i env` → solo `.env.example` y `.env.demo.example`. Borrar el archivo temporal.
6. Previews: un push a una rama distinta de `main` aparece como «Ignored» en Vercel y no aplica migraciones.
7. Registrar la URL, la región, la versión de PostgreSQL de Neon y los resultados en `feature_list.json` y `PROGRESS.md` (sin credenciales).

## Expected File Changes

- `prisma/schema.prisma`, `prisma/migrations/20261115120000_limites_login/migration.sql` — create/modify.
- `src/lib/auth/rate-limit.ts`, `rate-limit.test.ts`, `rate-limit.db.test.ts` — create.
- `src/app/api/auth/login/route.ts`, `src/app/login/page.tsx` — modify.
- `src/lib/demo.ts`, `demo.test.ts`, `src/app/_components/demo-banner.tsx`, `src/app/layout.tsx` — create/modify.
- `src/db/client.ts` (+ test unitario del parseo del timeout), `prisma.config.ts` — modify.
- `src/db/schema.db.test.ts` — modify (tabla, CHECK e índice).
- `prisma/seed.ts` — modify; `prisma/seed/base.ts`, `prisma/seed/presentacion.ts`, `prisma/seed-demo.ts` — create.
- `scripts/vercel-build.sh`, `scripts/with-demo-env.sh`, `vercel.json` — create; `scripts/validate-smoke.sh`, `package.json` (scripts `demo:*`) — modify.
- `.env.example`, `.gitignore` — modify; `.env.demo.example` — create.
- `docs/operacion-demo.md` — create; docs durables abajo.

## Visual Design Impact

- UI involved: sí (franja global y mensaje de bloqueo en `/login`).
- Design source: `DESIGN.md` (token `warning`, texto ≥ 14 px, contraste AA, estados con texto y no solo color).
- Estados: con y sin `DEMO_MODE`; alerta `bloqueado` en `/login`.
- New design artifact required: no. Añadir a `DESIGN.md` una línea en Components describiendo la franja.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — despliegue (Vercel `fra1` + Neon UE, pooler en runtime y URL directa para CLI, migraciones en el build de producción), limitador de login en BD y franja de demo.
- `CONSTRAINTS.md`: update — sustituir la regla «MUST añadir rate limiting…» por: MUST el login pasa por el limitador de BD antes de verificar contraseña; `limites_login` es tabla técnica global sin `empresa_id` que solo guarda hashes; MUST las migraciones de despliegue usan `DATABASE_URL_UNPOOLED` y solo corren con `VERCEL_ENV=production`; MUST NOT configurar `SEED_*` en Vercel ni versionar `.env.demo`; MUST `demo:*` pasa por `with-demo-env.sh` y nunca carga `.env`.
- `AGENTS.md`: update — comandos `demo:*`, modo remoto del smoke, variables nuevas y enlace a la guía.
- Otros: `README.md` (sección demo), `docs/technical-discovery.md` (decisiones de despliegue y rate limiting resuelto), `docs/risks-and-open-questions.md` (fuerza bruta mitigada; nuevos riesgos abajo), `DESIGN.md` (franja), `docs/operacion-demo.md` (nueva).

## Implementation Plan

1. `npm ci`; leer en `node_modules/next/dist/docs/` las guías de variables de entorno y de renderizado estático/dinámico.
2. Migración, esquema, `db:generate`, tests de esquema.
3. Limitador (puro + BD) con tests; integración en el login y en la página.
4. Franja de demo y timeout configurable, con tests unitarios.
5. `prisma.config.ts`, `vercel-build.sh`, `vercel.json`.
6. Refactor del seed, seed de presentación, wrapper y scripts `demo:*`.
7. Modo remoto, franja y rate limit en el smoke.
8. Verificación local completa; guía y documentación durable; `feature_list.json` (`passing` con evidencia local) y `PROGRESS.md`.

## Implementation Tasks

- [x] Migración `limites_login` + modelo; `db:deploy`, `db:status`, `migrate diff` vacío; tests de esquema.
- [x] `rate-limit.ts` con tests unitarios (claves, IP, ventana) y `test:db` (escenarios 1-4: bloqueo con email existente e inexistente, reset por éxito, ventana vencida moviendo `ventana_inicio` por SQL, IP, descuento, 10 concurrentes, limpieza de filas > 1 día).
- [x] Login con limitador, `bloqueado`/`servicio` y `Object.hasOwn` en la página.
- [x] `isDemoMode`, `DemoBanner` en el layout raíz; timeout por variable.
- [x] `prisma.config.ts`, `scripts/vercel-build.sh`, `vercel.json`.
- [x] `prisma/seed/{base,presentacion}.ts`, `seed.ts` sin cambio de comportamiento, `seed-demo.ts`, `with-demo-env.sh`, scripts `demo:*`, `.env.demo.example`, `.gitignore`, `.env.example`.
- [x] Smoke con `SMOKE_BASE_URL`, `SMOKE_EXPECT_DEMO_BANNER` y `SMOKE_RATE_LIMIT`.
- [x] Guía `docs/operacion-demo.md` y documentación durable.

## Verification Plan

Todo en local, sin Vercel ni Neon. Puerto `3107`, Edge CDP `9235`, base del worktree `central_de_avisos_demo_deployment` y bases temporales que se eliminan.

1. **Gate:** `npm run lint`, `typecheck`, `npm test`, `build`; `env -u DATABASE_URL bash init.sh` exit 0.
2. **BD:** `db:deploy`, `db:status`, `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` vacío, `test:db` verde. Base vacía `central_de_avisos_demo_verify`: `db:deploy` (10 migraciones), `test:db`, `DROP DATABASE`.
3. **Build de Vercel simulado:** base vacía temporal; `VERCEL_ENV=production DATABASE_URL=<temp> DATABASE_URL_UNPOOLED=<temp> DEMO_MODE=true bash scripts/vercel-build.sh` → 10 migraciones aplicadas y build OK. `VERCEL_ENV=preview …` → exit ≠ 0 y `db:status` de otra base vacía sigue sin migraciones. Comprobar con una URL «pooled» inválida en `DATABASE_URL` y la buena en `DATABASE_URL_UNPOOLED` que la migración usa la directa.
4. **Seed de demo:** archivo de entorno temporal **fuera del repo** apuntando a la base temporal; `DEMO_ENV_FILE=<archivo> npm run demo:seed` dos veces → mismos recuentos (1 plan, 1 empresa, 6 usuarios, 3 clientes, sus sedes y contactos, 6 avisos) por `psql`; con `NODE_ENV=production`, con una contraseña de 8 caracteres y con `demo-admin-local` → exit ≠ 0 sin cambios (md5 de `usuarios`). Comprobar que `.env` local no se cargó (un `SEED_ADMIN_EMAIL` distinto en `.env` no aparece). `npm run db:seed` sigue igual que antes.
5. **Smoke local:** `DEMO_MODE=true npm run build` y `SMOKE_PORT=3107 DEMO_MODE=true SMOKE_EXPECT_DEMO_BANNER=1 SMOKE_RATE_LIMIT=1` con todos los perfiles (`SMOKE_CLIENTE_*` = usuario de cliente del seed de demo) → exit 0. Después, modo remoto: arrancar `next start -p 3107` a mano y ejecutar con `SMOKE_BASE_URL=http://127.0.0.1:3107`; matar el árbol y comprobar el puerto libre.
6. **Navegador real (obligatorio):** `next start -p 3107` con `DEMO_MODE=true` y `LOGIN_RATE_LIMIT_WINDOW_SECONDS=60`. Edge por CDP: franja en `/`, `/login`, `/panel`, `/portal`, `/superadmin`, 403 y 404, a 390 px sin scroll horizontal y con contraste medido; 5 envíos erróneos desde el formulario (POST con `Origin: http://localhost:3107`) y el 6.º correcto → alerta de bloqueo sin cookie; mismo texto con email inexistente; tras 60 s, login correcto → `/panel`. Build y arranque sin `DEMO_MODE` → sin franja en `/` y `/login`.
7. **Secretos:** `git grep` de las contraseñas del archivo temporal → 0; `git status` sin `.env.demo` ni temporales.
8. **E2E persistente:** no existe harness; el smoke ampliado y la prueba con navegador real cubren el flujo.

## Evidence To Capture

- Nombre de la migración, `db:status`, `migrate diff`, `psql \d limites_login`; recuentos de `test:db` y de `npm test`.
- Salida de `vercel-build.sh` (production y preview) sin URLs.
- Recuentos del seed de demo x2 y rechazos.
- Salida del smoke local y remoto; resultados del navegador (códigos, `Origin`, mensajes, 390 px, contraste).
- Limpieza: puertos 3107/9235 libres, bases temporales eliminadas, archivo de entorno temporal borrado.
- Tras el despliegue (sesión principal): URL, región, versión de PostgreSQL de Neon y resultados de la validación pública.

## Validator Checklist

- [ ] El limitador es atómico, en BD, sin estado en memoria, falla cerrado y no revela si el email existe.
- [ ] `limites_login` no guarda email ni IP en claro; tiempo calculado en SQL.
- [ ] Franja en todas las páginas HTML con `DEMO_MODE=true` y ausente sin ella; AA y 390 px.
- [ ] `vercel-build.sh` solo migra con `VERCEL_ENV=production` y usa la URL directa; `vercel.json` ignora previews y fija `fra1`.
- [ ] `demo:*` carga solo el archivo de demo, rechaza producción y contraseñas débiles o de ejemplo; seed idempotente; `db:seed` sin cambios.
- [ ] Smoke remoto funciona sin servidor local; el modo local no cambia.
- [ ] Sin secretos versionados; `.env.demo` ignorado; `.env.demo.example` vacío.
- [ ] Guía y documentación durable actualizadas; sin dependencias nuevas de runtime ni trabajo fuera de alcance.
- [ ] `feature_list.json` y `PROGRESS.md` actualizados.

## Riesgos y decisiones abiertas

- **Estado de la feature:** la validación pública solo es posible tras el merge a `main`. Propuesta: el validator acepta con la verificación local y la sesión principal añade la evidencia pública después; si falla, PR de reparación. A confirmar por el orquestador.
- **IP compartida:** en una presentación con muchos asistentes en la misma red, el cupo de 50 fallos/15 min por IP es compartido. En local, `x-forwarded-for` es falsificable (solo protege el límite por email).
- **Ventana en la validación pública:** 15 min de espera; el operador puede fijar `LOGIN_RATE_LIMIT_WINDOW_SECONDS` en Vercel si quiere acortarla (exige redeploy).
- **Neon:** el arranque en frío puede superar el timeout (mitigado con `DATABASE_CONNECTION_TIMEOUT_MS=10000`); la versión de PostgreSQL de Neon puede ser 17 frente a 18 en local (las migraciones no usan nada específico de 18; se confirma en el build). `pg` avisa de la semántica de `sslmode=require`.
- **`DEMO_MODE` en páginas estáticas** se fija en el build: cambiarla exige redeploy.
- **Superadmin público:** con datos ficticios se incluye para enseñar la superficie de proveedor; puede crear empresas en la demo (se limpia con el reset).
- **Sin auditoría ni limpieza de sesiones:** riesgos previos sin cambios.

## Implementation Findings

- **Contraste de la franja:** la spec pedía texto blanco sobre `warning` (#B4771B) con 4.78:1, pero el cálculo WCAG da **3.75:1** (no cumple AA a 14 px). Se usa el token `text` (#121820) sobre `warning`: **4.75:1** medido en Edge. `DESIGN.md` lo recoge.
- **Franja «arriba»:** es el primer hijo que renderiza el layout raíz; Next.js puede insertar antes un `<script>` o un `<div hidden>` en `<body>`, así que la comprobación en navegador es `getBoundingClientRect().top === 0` y padre `body`, no `firstElementChild`.
- **`DEMO_MODE` en build y runtime:** confirmado en `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md` (las páginas estáticas evalúan `process.env` en el build; las dinámicas en runtime). Verificado: build con `DEMO_MODE=true` → franja en `/`; build sin ella → sin franja en `/` ni `/login`.
- **`dotenv` 18 y `DOTENV_PATH`:** `dotenv/config` respeta `DOTENV_PATH` (y el nombre antiguo `DOTENV_CONFIG_PATH`). `with-demo-env.sh` exporta ambos; `prisma/seed-demo.ts` no usa `dotenv/config`, sino `config({ path: DOTENV_PATH })` y falla si falta (impide lanzarlo sin el wrapper) o si apunta a `.env`. El wrapper también quita los `SEED_*` heredados de la shell.
- **Variables vacías del archivo de demo:** `SEED_*_EMAIL=""` se trata como ausente (valor por defecto) para que la plantilla no cree emails vacíos.
- **Validación de contraseñas:** `prisma/seed/demo-config.ts` (puro, con `src/lib/demo-seed-config.test.ts`) rechaza contraseñas < 12, las de ejemplo conocidas y cualquier `*_PASSWORD` no vacía de `.env.example`/`.env.demo.example`.
- **Transacción del seed:** `maxWait` 10 s y `timeout` 60 s (por defecto 5 s), porque desde local contra Neon son ~60 consultas con latencia de red.
- **Smoke:** además de `SMOKE_EXPECT_DEMO_BANNER=1`, `=0` comprueba la ausencia de la franja (usado para el build sin `DEMO_MODE`). `SMOKE_RATE_LIMIT=1` comprueba también que ningún intento devuelve `Set-Cookie` y que `/login?error=bloqueado` muestra el mensaje.
- **Comandos `demo:*` en Windows:** npm los ejecuta con `cmd.exe` y llaman a `bash`; hay que lanzarlos desde Git Bash (desde PowerShell `bash` puede ser el de WSL). Documentado en la guía.
- **Recuentos del seed de presentación:** 1 plan, 1 empresa, 6 usuarios (admin, oficina, técnico, encargado, cliente y superadmin), 3 clientes, 5 sedes, 5 contactos y 6 avisos (2 Normal, 2 Alta, 2 Urgente).
