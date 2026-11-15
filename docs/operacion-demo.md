# Operación de la demo pública

Guía de la demo pública de la central de avisos (feature `demo-deployment`).
Es una **demo para presentar funcionalidades con datos ficticios, no
producción**: sin dominio propio, sin email real, sin copias de seguridad, sin
monitorización y sin despliegues de preview.

## Arquitectura de la demo

- **Vercel** (región de funciones `fra1`, Fráncfort) sirve la app Next.js. Solo
  se despliega la rama `main` a **Production**; `vercel.json` hace que Vercel
  ignore cualquier otro build (`ignoreCommand`) y `scripts/vercel-build.sh`
  rechaza un `VERCEL_ENV` distinto de `production` como segunda barrera.
- **Neon PostgreSQL** (región `aws-eu-central-1`, Fráncfort). Dos URLs, con
  estos nombres exactos:
  - `DATABASE_URL`: pooler de Neon (host con `-pooler`, `sslmode=require`). La
    usa la app en runtime.
  - `DATABASE_URL_UNPOOLED`: conexión directa (sin `-pooler`). La usa el CLI de
    Prisma (`prisma.config.ts` la prefiere a `DATABASE_URL`) para las
    migraciones. El seed de presentación usa el cliente de la app, que lee
    `DATABASE_URL` (pooler); las dos funcionan para el seed.
- **Migraciones en el build:** el build de Production ejecuta
  `prisma migrate deploy` (con la URL directa) y después `next build`.
- **Franja de demo:** `DEMO_MODE=true` muestra «Entorno de demostración · datos
  ficticios» arriba de cada página. Las páginas estáticas (`/`) fijan el valor
  en el build: cambiar la variable exige **redeploy**.
- **Límite de intentos de login** en la tabla `limites_login` (PostgreSQL, sin
  servicios de pago): 5 intentos por email y 50 por IP en una ventana de 15 min
  (`LOGIN_RATE_LIMIT_WINDOW_SECONDS`, 60-3600). El 6.º intento por email
  responde «Demasiados intentos. Espera unos minutos y vuelve a intentarlo.»,
  exista o no el email. Un login correcto borra el contador de su email.
- **Datos de presentación:** se siembran **desde local** con
  `npm run demo:seed`, que lee solo `.env.demo` (ignorado por git). Las
  contraseñas nunca se configuran en Vercel ni se versionan.

## Variables de entorno

### En Vercel (solo entorno Production)

| Variable | Valor | Uso |
| --- | --- | --- |
| `DATABASE_URL` | URL **pooled** de Neon (`-pooler`, `sslmode=require`) | Runtime de la app |
| `DATABASE_URL_UNPOOLED` | URL **directa** de Neon (`sslmode=require`) | `prisma migrate deploy` en el build |
| `DEMO_MODE` | `true` | Franja de demo |
| `DATABASE_CONNECTION_TIMEOUT_MS` | `10000` | Tolera el arranque en frío de Neon (por defecto 2000) |
| `LOGIN_RATE_LIMIT_WINDOW_SECONDS` | opcional, p. ej. `900` | Ventana del limitador (por defecto 900) |

**No** añadir ninguna variable `SEED_*` en Vercel. No configurar variables en
Preview ni Development. Si se conecta la integración de Neon en Vercel, revisar
que no cree variables en Preview ni ramas de base de datos por preview.

### En local (`.env.demo`, nunca versionado)

Copiar `.env.demo.example` a `.env.demo` y rellenar:

- `DATABASE_URL` (pooled) y `DATABASE_URL_UNPOOLED` (directa): las mismas de
  Vercel.
- `SEED_ADMIN_PASSWORD`, `SEED_SUPERADMIN_PASSWORD`, `SEED_EQUIPO_PASSWORD`
  (oficina, técnico y encargado) y `SEED_CLIENTE_PASSWORD`: obligatorias, de al
  menos 12 caracteres, aleatorias (`openssl rand -base64 18`) y distintas de
  las de ejemplo de `.env.example`.
- `SEED_*_EMAIL`: opcionales (por defecto los de la tabla de usuarios).

## Comandos `demo:*` (desde Git Bash en Windows)

Todos pasan por `scripts/with-demo-env.sh`, que rechaza `NODE_ENV=production`,
quita del entorno `DATABASE_URL`, `DATABASE_URL_UNPOOLED` y cualquier `SEED_*`
heredado, carga solo el archivo de demo (`DEMO_ENV_FILE`, por defecto
`.env.demo`; nunca `.env`), exige las dos URLs e imprime los hosts destino sin
credenciales.

| Comando | Qué hace |
| --- | --- |
| `npm run demo:status` | `prisma migrate status` contra Neon (URL directa). |
| `npm run demo:migrate` | `prisma migrate deploy` contra Neon, por si hace falta fuera del build. |
| `npm run demo:seed` | Seed de presentación idempotente (ver abajo). |

En Windows hay que lanzarlos desde **Git Bash**: npm ejecuta `bash` y, desde
PowerShell, `bash` puede resolver al de WSL, que no ve el Node de Windows.

## Datos de presentación

`npm run demo:seed` crea o actualiza, sin duplicar:

- Plan Demo y **Empresa Demo** (NIF `B12345678`, serie `F`, 45,00 €/h,
  `NO_VERIFACTU`).
- Usuarios:

  | Email | Perfil | Contraseña |
  | --- | --- | --- |
  | `admin@demo.local` | Administradora | `SEED_ADMIN_PASSWORD` |
  | `oficina@demo.local` | Oficina | `SEED_EQUIPO_PASSWORD` |
  | `tecnico@demo.local` | Técnico | `SEED_EQUIPO_PASSWORD` |
  | `encargado@demo.local` | Administrador + Técnico | `SEED_EQUIPO_PASSWORD` |
  | `cliente@demo.local` | Usuario de cliente (portal de Comunidad de Propietarios Río Tajo) | `SEED_CLIENTE_PASSWORD` |
  | `superadmin@demo.local` | Proveedor SaaS (sin empresa) | `SEED_SUPERADMIN_PASSWORD` |

- Tres clientes ficticios: Comunidad de Propietarios Río Tajo (2 sedes),
  Hotel Mirador del Parque (1 sede) y Clínica Dental Sonrisas (2 sedes), con 5
  contactos.
- Seis avisos `NUEVO` con origen `OFICINA`: dos Normal, dos Alta y dos Urgente.

Recuentos esperados tras cada ejecución: 1 plan, 1 empresa, 6 usuarios (5 de
Empresa Demo + superadmin), 3 clientes, 5 sedes, 5 contactos y 6 avisos. Si se
crean datos durante una presentación (otro cliente, otra empresa desde el
superadmin), siguen ahí hasta el reset.

## Pasos de despliegue

Los ejecuta la sesión principal (con login interactivo en Vercel y Neon) tras el
merge de `demo-deployment` a `main`.

1. **Neon** (el proyecto ya existe en `aws-eu-central-1`): `neonctl auth`;
   `neonctl projects list` para localizarlo; obtener
   `neonctl connection-string --project-id <id> --pooled` (→ `DATABASE_URL`) y
   `neonctl connection-string --project-id <id>` (directa →
   `DATABASE_URL_UNPOOLED`), ambas con `sslmode=require`. Anotar la versión de
   PostgreSQL del proyecto.
2. **Local:** `cp .env.demo.example .env.demo` y rellenar las dos URLs y las 4
   contraseñas (≥ 12 caracteres, aleatorias). Comprobar
   `git check-ignore .env.demo` (debe imprimir `.env.demo`). `npm run
   demo:status` → conecta y lista las 10 migraciones pendientes (o «up to date»
   si ya se aplicaron).
3. **Vercel:** `vercel login`; `vercel link` (crear el proyecto
   `central-de-avisos-demo` en la cuenta del usuario); `vercel git connect` con
   el repositorio de GitHub y rama de producción `main`. En Settings: Node.js
   22.x (o 24.x) y Framework Preset Next.js (lo fija `vercel.json`).
4. **Variables solo en Production** (`vercel env add <NOMBRE> production`):
   `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (directa),
   `DEMO_MODE=true` y `DATABASE_CONNECTION_TIMEOUT_MS=10000`. Opcional:
   `LOGIN_RATE_LIMIT_WINDOW_SECONDS`. Ningún `SEED_*`.
5. **Desplegar:** el push/merge a `main` dispara el build (o
   `vercel deploy --prod` desde `main` actualizado). En el log del build deben
   aparecer `vercel-build: migraciones con DATABASE_URL_UNPOOLED`, `prisma
   migrate deploy` aplicando las 10 migraciones (la última
   `20261115120000_limites_login`) y `next build` correcto; región de funciones
   `fra1`.
6. **Sembrar:** `npm run demo:seed` desde local, dos veces (los recuentos no
   cambian). `npm run demo:status` → «Database schema is up to date!».

## Validación pública

La ejecuta la sesión principal; `<url>` es la URL de Production (sin barra
final).

1. `curl --max-time 10 -sS https://<url>/health` → 200 con `"status":"ok"` y
   `"database":{"status":"up"}`, sin credenciales.
2. Smoke remoto (Git Bash), pasando las contraseñas desde `.env.demo` sin
   imprimirlas (p. ej. con un script temporal fuera del repo que haga
   `set -a; source .env.demo; set +a` y mapee las variables):

   ```bash
   SMOKE_BASE_URL=https://<url> SMOKE_EXPECT_DEMO_BANNER=1 SMOKE_RATE_LIMIT=1 \
   SMOKE_EMAIL=superadmin@demo.local SMOKE_PASSWORD=<SEED_SUPERADMIN_PASSWORD> \
   SMOKE_NORMAL_EMAIL=admin@demo.local SMOKE_NORMAL_PASSWORD=<SEED_ADMIN_PASSWORD> \
   SMOKE_OFICINA_EMAIL=oficina@demo.local SMOKE_OFICINA_PASSWORD=<SEED_EQUIPO_PASSWORD> \
   SMOKE_TECNICO_EMAIL=tecnico@demo.local SMOKE_TECNICO_PASSWORD=<SEED_EQUIPO_PASSWORD> \
   SMOKE_CLIENTE_EMAIL=cliente@demo.local SMOKE_CLIENTE_PASSWORD=<SEED_CLIENTE_PASSWORD> \
   bash scripts/validate-smoke.sh
   ```

   Debe terminar con exit 0 («Smoke HTTP completado correctamente.»). En modo
   remoto no arranca servidor ni exige build ni `DATABASE_URL`. Cada ejecución
   con `SMOKE_RATE_LIMIT=1` suma 6 intentos fallidos al cupo de la IP (50 en la
   ventana, y un login correcto descuenta 1): 6 fallos netos por ejecución.
   No lanzarlo más de 5 veces seguidas desde la misma IP, para dejar margen a
   los fallos manuales durante una presentación.
3. **Navegador real** (Edge headless por CDP o manual): franja visible en `/`,
   `/login`, `/panel`, `/panel/clientes`, `/portal`, `/superadmin` y un 404, a
   390 px sin scroll horizontal; login desde el formulario con cada usuario
   (POST con `Origin: https://<url>`, cookie `central_sesion` `Secure` y
   `HttpOnly`); `/panel/clientes` muestra los 3 clientes, `/panel/avisos` los 6
   avisos con las tres prioridades y el portal solo las sedes de su cliente
   (Portal 1 y Garaje comunitario).
4. **Límite de intentos:** con `tecnico@demo.local`, 5 contraseñas erróneas
   desde el formulario y la 6.ª correcta → alerta «Demasiados intentos. Espera
   unos minutos y vuelve a intentarlo.» sin cookie; con un email inexistente,
   el mismo mensaje en el 6.º intento; pasados 15 min (o la ventana
   configurada), login correcto del técnico → `/panel`.
5. **Secretos:** con las contraseñas y URLs de `.env.demo` en un archivo
   temporal fuera del repo (una por línea), `git grep -F -f <archivo>` → sin
   resultados y `git log --all -p | grep -F -c -f <archivo>` → 0;
   `git ls-files | grep -i env` → solo `.env.example` y `.env.demo.example`.
   Borrar el archivo temporal.
6. **Previews:** un push a una rama distinta de `main` aparece como «Ignored»
   (o «Canceled») en Vercel y no aplica migraciones.
7. Registrar la URL, la región, la versión de PostgreSQL de Neon y los
   resultados en `feature_list.json` y `PROGRESS.md`, sin credenciales.

## Resetear la demo

Operación humana, cuando los datos de una presentación deban volver al estado
inicial:

```bash
bash scripts/with-demo-env.sh npx prisma migrate reset --force --skip-seed
npm run demo:seed
```

`prisma migrate reset` tiene un guard para agentes IA que exige consentimiento
explícito. Alternativa: en la consola de Neon, «Reset from parent» del branch
(o borrar y recrear la base), después `npm run demo:migrate` y
`npm run demo:seed`.

## Rotar contraseñas

1. Generar contraseñas nuevas y escribirlas en `.env.demo`.
2. `npm run demo:seed`: el seed actualiza los hashes de los 6 usuarios de
   presentación.
3. Las sesiones abiertas siguen válidas hasta 12 h; para cortarlas, resetear la
   demo o revocar las filas de `sesiones` desde la consola SQL de Neon
   (`UPDATE sesiones SET revocada_en = now() WHERE revocada_en IS NULL`).

## Rotar las URLs de Neon

Si se cambia la contraseña del rol de Neon: actualizar `DATABASE_URL` y
`DATABASE_URL_UNPOOLED` en Vercel (Production) y en `.env.demo`, y redeploy.

## Apagar la demo

- Vercel: pausar o borrar el proyecto (`vercel project rm central-de-avisos-demo`),
  o quitar el dominio de Production.
- Neon: borrar el proyecto o la base. Borrar `.env.demo` local.

## Límites conocidos

- Cupo por IP compartido: en una sala con muchos asistentes tras la misma IP,
  50 fallos en 15 min bloquean el login de todos durante la ventana.
- `x-forwarded-for` es falsificable fuera de Vercel; en Vercel lo fija la
  plataforma.
- Arranque en frío de Neon: la primera petición tras inactividad puede tardar
  varios segundos (mitigado con `DATABASE_CONNECTION_TIMEOUT_MS=10000`).
- El superadmin puede crear empresas en la demo; se limpian con el reset.
- Sin auditoría, sin limpieza programada de sesiones ni de `limites_login` (las
  filas de más de un día se borran en cada intento de login).
