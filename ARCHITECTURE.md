# Architecture

Estado actual: fundamento técnico con autenticación propia y superficie de
proveedor. La app es un monolito Next.js con App Router y una única superficie
de datos PostgreSQL. Existe login con email y contraseña, sesiones opacas
revocables, un panel privado con navegación por permisos, roles de empresa
combinables con gestión en `/panel/usuarios`, configuración fiscal y de
facturación de la empresa en `/panel/empresa`, un panel de superadmin para
planes, alta de empresas e invitación de su administrador, y la primera parte
del dominio operativo: clientes con sedes y contactos en `/panel/clientes` y
alta de avisos desde oficina en `/panel/avisos`.

## Capas y dirección de dependencias

```txt
src/app/          rutas HTTP y páginas (borde de entrada)
  ├─ src/lib/     lógica de aplicación testeable sin servidor
  │    ├─ src/lib/auth/       autenticación y sesiones (server-only en current-session)
  │    ├─ src/lib/authz/      matriz de permisos y navegación (puros) y guards de servidor
  │    ├─ src/lib/empresa/    gestión de la propia empresa (usuarios y roles, configuración
  │    │                      de facturación), con tenantFilter o requireEmpresaId
  │    ├─ src/lib/clientes/   clientes, sedes y contactos (validación pura y repositorio con tenantFilter)
  │    ├─ src/lib/avisos/     avisos: validación pura del alta y repositorio con tenantFilter
  │    └─ src/lib/superadmin/ autorización, planes, altas e invitaciones
  └─ src/db/      acceso a datos y contrato de tenant
       └─ src/generated/prisma/ cliente Prisma generado (no versionado)
```

- `src/db/client.ts` es el único punto de construcción del cliente Prisma.
- `src/lib/` no importa rutas de `src/app/`; las rutas dependen de `src/lib/`.
- El cliente generado se regenera con `npm run db:generate` y no se commitea.
- La lógica de credenciales y sesiones recibe el cliente Prisma explícito para
  poder probarse con transacciones y rollback.

## Base de datos

- **PostgreSQL** es la única base de datos. En desarrollo local se usa una
  instalación nativa; no se requiere Docker.
- **Prisma 7.10.1** con el generador `prisma-client` (no `prisma-client-js`),
  salida en `src/generated/prisma` y módulo ESM.
- **Driver adapter** `@prisma/adapter-pg` sobre `pg`. `PrismaClient` se crea de
  forma perezosa en `getDb()` para que `next build`, `init.sh` y los tests
  unitarios no necesiten `DATABASE_URL` ni abran conexiones.
- `prisma.config.ts` es la fuente de la URL de migración. La URL es opcional
  para que `prisma generate` funcione sin `.env`; los comandos de migración
  fallan si no hay `DATABASE_URL`.

## Migraciones

- Las migraciones son SQL versionado en `prisma/migrations/` y se aplican con
  `npm run db:deploy`.
- `npm run db:migrate` crea migraciones en desarrollo; `npm run db:status`
  comprueba el historial; `npm run db:reset` reconstruye la base local.
- Los CHECK que Prisma no modela se mantienen en migraciones SQL explícitas.
- `prisma db push` está prohibido para cambios compartidos.

### Esquema base

- `planes`: catálogo global del proveedor; nombre único, importe mensual
  `decimal(12,2)` con CHECK `>= 0`, activo y timestamps.
- `empresas`: raíz del tenant; NIF único normalizado (`nif = upper(btrim(nif))`),
  `direccion_fiscal` nullable en BD (obligatoria al crear desde superadmin),
  email de facturación, FK `plan_id` con `ON DELETE/UPDATE RESTRICT`, estado
  `ACTIVA`/`SUSPENDIDA` e índice por plan. Configuración de facturación
  (migración `20261114180000_empresa_facturacion`): `serie_factura TEXT`
  nullable con CHECK `empresas_serie_factura_formato`
  (`^[A-Z0-9][A-Z0-9-]{0,9}$`), `tarifa_horaria DECIMAL(10,2)` nullable con
  CHECK `empresas_tarifa_horaria_positiva` (`> 0`) y `modo_fiscal` del enum
  `modo_fiscal`, que solo tiene `NO_VERIFACTU` (`NOT NULL DEFAULT`). NULL en
  serie o tarifa significa «sin configurar».
- `usuarios`: email único global, `empresa_id` nullable con FK `Restrict`,
  `password_hash` nullable (invitados sin contraseña), estado
  `ACTIVO`/`INACTIVO`, `es_superadmin`, `roles rol_usuario[] NOT NULL DEFAULT
  '{}'` (enum `ADMINISTRADOR`/`OFICINA`/`TECNICO`) e índice por empresa. Los
  CHECK garantizan email normalizado, que solo el superadmin tenga
  `empresa_id` nulo, que el superadmin no tenga roles
  (`usuarios_superadmin_sin_roles`) y que la lista no tenga nulos
  (`usuarios_roles_sin_nulos`). La base de datos no exige un mínimo de un rol:
  un usuario de empresa sin roles no tiene permisos.
- `sesiones`: sesión opaca con FK `CASCADE` a `usuarios`, `token_hash` único,
  `creado_en`, `expira_en` y `revocada_en` nullable; índices por usuario y
  expiración y CHECK `expira_en > creado_en`. El token crudo nunca se guarda.
- `invitaciones`: invitación de administrador de empresa con FK `Restrict` a
  `empresas`, FK `CASCADE` a `usuarios`, enum `tipo_invitacion`, `token_hash`
  único, `creado_en`, `expira_en` y `aceptada_en` nullable; índices por
  empresa, usuario y expiración. CHECK de expiración posterior y aceptación no
  anterior a la creación. El estado (`Pendiente`/`Caducada`/`Aceptada`) es
  derivado y el token crudo solo viaja en una cookie flash de 60 s.
- `clientes`, `sedes` y `contactos` llegan en la migración
  `20261114190000_clientes_sedes_contactos`, posterior a la de facturación.
- `clientes`: cliente de una empresa y **sujeto fiscal**: `razon_social`,
  `nif`, `direccion_facturacion` y `tarifa_horaria decimal(12,2)` opcional
  (sustituye a la tarifa de la empresa; aún no se usa en cálculos). FK
  `empresa_id` `Restrict`, `UNIQUE (empresa_id, nif)` (el mismo NIF puede
  existir en otra empresa) y `UNIQUE (id, empresa_id)` como destino de los FK
  compuestos. CHECK `clientes_nif_normalizado` y `clientes_tarifa_no_negativa`.
- `sedes`: lugar de la intervención; solo `nombre` y `direccion`, **sin datos
  fiscales**. Lleva `empresa_id` y FK compuesto `(cliente_id, empresa_id) →
  clientes(id, empresa_id)` `Restrict`, así que PostgreSQL rechaza una sede con
  una empresa distinta de la de su cliente. `UNIQUE (id, cliente_id)` e índice
  por cliente.
- `contactos`: persona del cliente con `telefono` y `email` opcionales (CHECK
  `contactos_telefono_o_email` y `contactos_email_normalizado`), FK compuesto
  `(cliente_id, empresa_id)` como las sedes y `sede_id` nullable (nulo = todo
  el cliente). **Limitación:** Prisma no permite una relación opcional que
  reutilice `cliente_id` (obligatorio), así que `sede_id` es un FK simple a
  `sedes(id)` y la regla «la sede es del mismo cliente» se aplica en
  `upsertContacto` y se cubre con `test:db`. Añadir el FK compuesto solo en SQL
  haría que `prisma migrate diff` lo marcara como deriva.
- `avisos` (migración `20261115090000_avisos`): `empresa_id`, `cliente_id`,
  `sede_id`, `contacto_id` y `creado_por_id` NOT NULL, `descripcion text`,
  enums `prioridad_aviso` (`NORMAL` por defecto, `ALTA`, `URGENTE`),
  `origen_aviso` (`OFICINA`, `CLIENTE`) y `estado_aviso` completo (`NUEVO` por
  defecto, `PENDIENTE`, `ASIGNADO`, `EN_CURSO`, `RESUELTO`, `FACTURADO`,
  `CANCELADO`). FK compuestos `Restrict` `(cliente_id, empresa_id) →
  clientes(id, empresa_id)`, `(sede_id, cliente_id) → sedes(id, cliente_id)` y
  `(contacto_id, cliente_id) → contactos(id, cliente_id)` (la migración añade
  `UNIQUE (id, cliente_id)` en `contactos`), más FK simples a `empresas` y
  `usuarios`. CHECK `avisos_descripcion_no_vacia` e índices `(empresa_id,
  creado_en)`, `cliente_id`, `sede_id` y `contacto_id`. Aquí Prisma sí admite
  el solapamiento de `cliente_id` porque todas las columnas son obligatorias.
  Que el contacto sea de todo el cliente o de la sede del aviso no cabe en un
  FK: lo aplica `src/lib/avisos/avisos.ts`. No hay número correlativo.
- **Facturación:** la futura factura de trabajo (`invoice-draft`) tendrá FK
  `cliente_id` (y `empresa_id`), nunca `sede_id`; razón social, NIF y dirección
  de facturación se toman del cliente. La sede solo aparece como lugar de la
  intervención en el aviso.

## Aislamiento multiempresa

La estrategia es **filtros de aplicación obligatorios**, no RLS.

- Toda tabla operable futura debe llevar `empresa_id`.
- Toda consulta pasa por `src/db/tenant.ts`:
  - `requireEmpresaId(valor)` lanza si falta el contexto;
  - `tenantFilter(empresaId)` devuelve el filtro Prisma obligatorio;
  - `assertTenantAccess(recursoEmpresaId, contextoEmpresaId)` protege un
    recurso concreto.
- Los repositorios futuros reciben `empresaId` explícito; nunca lo leen de la
  petición sin validarlo.
- El superadmin es la única excepción y no usa `tenantFilter`. Sus consultas
  cruzadas viven solo en `src/lib/superadmin/*` y siempre detrás de
  `requireSuperadmin`.

RLS se difiere hasta que exista autenticación y una revisión específica. El
motivo y el riesgo residual están en `CONSTRAINTS.md` y
`docs/risks-and-open-questions.md`.

## Superficie de proveedor

- `/superadmin` es privada y se protege en el layout y en cada página con
  `requireSuperadmin`. La regla es solo `es_superadmin = true` y
  `empresa_id` nulo; los roles de empresa no intervienen y el superadmin no
  tiene ninguno.
- Un usuario autenticado sin `es_superadmin` recibe `403` mediante
  `forbidden()` (experimental `authInterrupts`) y `superadmin/forbidden.tsx`.
  El layout que ejecuta el guard vive en
  `src/app/superadmin/(protected)/layout.tsx` junto con las páginas, de modo
  que el `throw` ocurre por debajo del boundary de `forbidden.tsx`; las URLs
  públicas siguen siendo `/superadmin`, `/superadmin/empresas`,
  `/superadmin/planes`, etc. Lanzar `forbidden()` desde el layout del mismo
  segmento que define el boundary hace que Next use su 403 por defecto en
  inglés. Verificado en runtime con navegador real: 403 antes de streaming,
  `403 · No autorizado`, `Acceso restringido` y enlace a `/panel`.
- Un anónimo redirige a `/login?next=%2Fsuperadmin`. Los route handlers
  `/api/superadmin/*` comprueban mismo origen, aplican el mismo guard y solo
  aceptan `POST`; `GET` devuelve 405.
- Los planes son globales (`planes` no lleva `empresa_id`). Se pueden crear y
  editar con validación decimal, pero no borrar. Solo los planes activos se
  ofrecen en el alta.
- El alta de empresa, el usuario administrador `INACTIVO` sin contraseña y la
  invitación se crean en una única transacción. NIF y email se normalizan y se
  validan; NIF y email global son únicos. Cualquier fallo revierte las tres
  filas.
- La invitación dura 7 días y guarda solo el SHA-256 del token. Tras el alta,
  el token crudo se entrega en la cookie `central_invitacion` (`HttpOnly`,
  `SameSite=Strict`, `Path=/superadmin/empresas`, `Max-Age=60`) y el detalle lo
  muestra una sola vez como `/invitacion/<token>`. No se envía email real, no
  se guarda en URL ni logs y no hay reenvío ni recuperación.
- Auditoría y facturación mensual siguen fuera de este slice.

## Roles y permisos de empresa

- **Matriz en código:** `src/lib/authz/permissions.ts` (puro) define `ROLES`,
  la unión `Permiso` y `ROLE_PERMISSIONS`, copia de las columnas Administrador,
  Oficina y Técnico de `docs/user-and-access-model.md`. `can(session,
  permiso)` suma los permisos de todos los roles y deniega por defecto: sin
  sesión, superadmin o sin empresa → `false`. `normalizeRoles` valida contra el
  enum, deduplica y ordena.
- **Sesión:** `AuthenticatedUser`/`CurrentSession` incluyen `roles`, leídos de
  la base de datos en cada petición por `getSessionByToken` (revalidados con
  `normalizeRoles`; el superadmin siempre `[]`). Un cambio de roles surte
  efecto en la siguiente petición sin volver a iniciar sesión.
- **Guards** (`src/lib/authz/guards.ts`): `requirePermission(permiso,
  nextPath)` para páginas (307 a `/login?next=...` o `forbidden()`) y
  `authorizeCompanyRequest(request, permiso, nextPath)` para route handlers
  (307 o 403 en texto).
- **Panel:** `src/app/panel/layout.tsx` lee la sesión con `getCurrentSession`
  y pinta cabecera y `<nav aria-label="Secciones">` con `visibleNavItems`
  (`src/lib/authz/navigation.ts`); no redirige ni deniega. Next renderiza la
  página aunque el layout no lo haga, así que la frontera es cada página
  (`requireSession` o `requirePermission`), y así el `next` del login conserva
  la ruta pedida. `src/lib/authz/panel-guards.test.ts` falla si una página de
  `/panel` no llama a un guard. `src/app/panel/forbidden.tsx` captura los
  `forbidden()` de las páginas hijas y se pinta dentro del layout.
- **Gestión de roles:** `/panel/usuarios` (permiso `usuarios.gestionar`) lista
  los usuarios de la empresa con `tenantFilter` y sin superadmin, en tarjetas
  con tres checkboxes por usuario. `POST /api/panel/usuarios/roles` comprueba
  mismo origen, aplica `authorizeCompanyRequest` y llama a
  `updateUserRoles` (`src/lib/empresa/usuarios.ts`), que en una transacción
  bloquea la fila de la empresa (`SELECT ... FOR UPDATE`), carga el usuario por
  `id + tenantFilter`, impide quitarse el propio `ADMINISTRADOR`, actualiza y
  revierte si la empresa quedaría sin administradores `ACTIVO`. Responde 303
  con `?ok=roles` o `?error=sin-roles|rol-invalido|propio-admin|no-encontrado|
  ultimo-admin|servicio`; `GET` devuelve 405.
- **Configuración de empresa:** `/panel/empresa` (permiso
  `empresa.configurar`) muestra un formulario con datos fiscales, serie,
  tarifa horaria y modo fiscal (radio VERIFACTU deshabilitado) y el aviso
  «Pendiente de configurar» si serie o tarifa son nulas. `POST
  /api/panel/empresa` comprueba mismo origen, aplica
  `authorizeCompanyRequest`, valida con `parseBillingSettingsForm`
  (`src/lib/empresa/configuracion-validation.ts`, puro: NIF sin espacios y en
  mayúsculas, email en minúsculas, serie en mayúsculas, tarifa como cadena
  decimal con `BigInt`, solo `NO_VERIFACTU`) y guarda con
  `updateCompanyBillingSettings` (`src/lib/empresa/configuracion.ts`), que
  escribe por `id = requireEmpresaId(session.empresa.id)` solo los campos de
  configuración (nunca `plan_id` ni `estado`) y traduce un NIF de otra empresa
  a `nif-duplicado`. Responde 303 con `?ok=guardado` o
  `?error=campos|nif|email|serie|tarifa|modo|nif-duplicado|servicio`; `GET`
  devuelve 405. Los campos `empresaId`/`id` del formulario se ignoran.
- El alta de empresa crea al administrador invitado con
  `roles = {ADMINISTRADOR}` en la misma transacción.
- Fuera de este slice: rol `CLIENTE` y portal, invitar o desactivar usuarios
  de empresa y auditoría de cambios de rol.

## Clientes, sedes y contactos

- **Permiso:** `clientes.gestionar` (Administrador y Oficina). Navegación
  «Clientes»; técnico, usuario sin roles y superadmin reciben 403.
- **Páginas** (`force-dynamic`, `requirePermission("clientes.gestionar")`):
  `/panel/clientes` (listado en tarjetas con «N sedes · N contactos» y estado
  vacío), `/panel/clientes/nuevo` (datos de facturación, primera sede y primer
  contacto) y `/panel/clientes/[id]` (formularios de datos de facturación, de
  cada sede y de cada contacto, y «Añadir sede»/«Añadir contacto»). Un id
  inexistente, que no es un UUID o de otra empresa da el mismo 404 propio
  (`[id]/not-found.tsx`), sin datos. La UI compartida del panel está en
  `src/app/panel/_components/ui.tsx`; `/panel` no importa la del superadmin.
- **Route handlers** (`POST`; `GET` → 405 `Allow: POST`):
  `/api/panel/clientes` (alta), `/api/panel/clientes/datos`,
  `/api/panel/clientes/sedes` (crea sin `sedeId`, edita con él) y
  `/api/panel/clientes/contactos` (igual con `contactoId`; `sedeId` vacío =
  todo el cliente). Comprueban mismo origen y `authorizeCompanyRequest`
  (utilidades en `src/app/api/panel/clientes/_shared/respond.ts`) y responden
  303 con `?ok=creado|datos|sede-creada|sede|contacto-creado|contacto` o
  `?error=campos|nif|nif-duplicado|tarifa|email|telefono|contacto|sede|
  no-encontrado|servicio`. Un `clienteId` ajeno o inválido vuelve a
  `/panel/clientes?error=no-encontrado`; una sede o un contacto ajeno, al
  detalle con `?error=no-encontrado`.
- **Lógica:** `src/lib/clientes/validation.ts` (pura: NIF normalizado,
  teléfono `^\+?[0-9 ()-]{6,20}$` con al menos 6 dígitos, email normalizado,
  tarifa con `parseImporteMensual`, vacíos a `null`, límites 160/240/120) y
  `src/lib/clientes/clientes.ts` (repositorio con `tenantFilter`; alta
  transaccional cliente + sede + contacto; `P2002` → `nif-duplicado`). Las
  ediciones son «última escritura gana». No hay borrado ni desactivación.

## Avisos (alta desde oficina)

- **Permiso:** `avisos.crear` (Administrador y Oficina, también combinados con
  Técnico). Navegación «Avisos» justo después de «Inicio»; técnico, usuario sin
  roles y superadmin reciben 403.
- **Páginas** (`force-dynamic`, `requirePermission("avisos.crear")`):
  `/panel/avisos` (tabla en escritorio con scroll horizontal controlado,
  tarjetas pulsables en móvil, del más reciente al más antiguo, estado vacío),
  `/panel/avisos/nuevo` (sin JavaScript de cliente: paso 1 `GET` con el
  `select` de clientes; paso 2 con `?clienteId=`, sede, contacto, descripción
  y prioridad) y `/panel/avisos/[id]` (detalle con su `not-found.tsx`). Un
  `clienteId` vacío, inválido o ajeno en la página redirige a
  `/panel/avisos/nuevo?error=no-encontrado`; un aviso ajeno, inexistente o no
  UUID da el 404 propio. Los mensajes `?error=`/`?ok=` se buscan con
  `Object.hasOwn`. Chips de prioridad y estado en
  `src/app/panel/avisos/_components/chips.tsx`; fechas en Europe/Madrid.
- **Route handler:** `POST /api/panel/avisos` (`GET` → 405 `Allow: POST`):
  mismo origen, `authorizeCompanyRequest("avisos.crear")`, 303 a
  `/panel/avisos/<id>?ok=creado`; errores con cliente de la empresa a
  `/panel/avisos/nuevo?clienteId=<id>&error=sede|contacto|descripcion|prioridad`;
  cliente inválido o ajeno a `?error=no-encontrado`; excepción a
  `?error=servicio`.
- **Lógica:** `src/lib/avisos/validation.ts` (puro: UUID, descripción recortada
  de 1 a 2000 caracteres con saltos de línea normalizados a `\n`, prioridad del
  enum) y `src/lib/avisos/avisos.ts` (repositorio con `tenantFilter`; el alta
  resuelve cliente, sede del cliente y contacto del cliente de todo el cliente
  o de la sede elegida, y escribe `origen=OFICINA`, `estado=NUEVO` y
  `creado_por_id` de la sesión en una transacción).
- Las transiciones de estado (validar, bolsa, asignar, tomar, cancelar),
  la edición y el alta desde el portal de cliente pertenecen a features
  posteriores.

## RLS: reevaluación al añadir clientes

`clientes`, `sedes` y `contactos` son las primeras tablas operativas. RLS sigue
diferida: no hay consultas cruzadas entre empresas fuera de
`src/lib/superadmin/*` y todas las consultas de clientes pasan por
`tenantFilter`, con aislamiento A/B en `test:db`. Además, los FK compuestos
con `empresa_id` impiden en PostgreSQL mezclar empresas al escribir. La
decisión se debe revisar antes de producción o cuando aparezca la primera
consulta cruzada (ver `CONSTRAINTS.md`).

## Activación del administrador invitado

- `/invitacion/[token]` es pública y `force-dynamic`. Valida el formato del
  token (base64url de 43 caracteres) antes de consultar y busca la invitación
  por `token_hash` en `src/lib/onboarding/invitation-acceptance.ts`. Es una
  excepción de identidad acotada, como la búsqueda de sesión: no lleva
  `tenantFilter` porque el token identifica una única fila.
- Estados de la página: válida (formulario con empresa, nombre y email en solo
  lectura), ya utilizada, caducada, empresa no activa y no válida (404 con
  `not-found.tsx` propio, sin datos).
- `POST /api/invitaciones/aceptar` comprueba mismo origen, valida la política
  de contraseña nueva (12–128 caracteres y confirmación) y calcula scrypt
  fuera de la transacción. Dentro de una única transacción:
  `updateMany` condicionado de `aceptada_en` (un solo ganador con envíos
  concurrentes), activación del usuario (`ACTIVO` + `password_hash`) y
  creación de la sesión. Responde 303 a `/panel` con `central_sesion` y revoca
  la sesión previa del navegador si existía.
- Una invitación ya usada, caducada, desconocida o de una empresa
  `SUSPENDIDA` no activa al usuario ni crea sesión; la invitación de una
  empresa suspendida sigue pendiente.
- `next.config.ts` añade a `/invitacion/:path*` `Referrer-Policy:
  same-origin`, `Cache-Control: no-store` y `X-Robots-Tag: noindex, nofollow`,
  porque el token viaja en el path del enlace. El token va en el cuerpo del
  POST y nunca en la redirección final.

## Autenticación y sesiones

La autenticación es propia; no se usa Auth.js. El objetivo es una sesión
opaca, persistida y revocable en servidor, compatible con el superadmin sin
empresa y con las futuras invitaciones y roles.

- **Contraseñas:** scrypt nativo versionado
  (`scrypt$v=1$N=131072,r=8,p=1$...`) con salt aleatorio y
  `timingSafeEqual`. Un email inexistente o un usuario sin `password_hash` se
  verifica contra un hash dummy para no revelar el motivo por tiempo.
- **Sesión:** token aleatorio de 32 bytes en `base64url`; en `sesiones` solo se
  guarda su SHA-256. La cookie `central_sesion` es `HttpOnly`,
  `SameSite=Lax`, `Path=/`, `Max-Age=43200` (12 h absolutas) y añade `Secure`
  cuando la petición llega por HTTPS.
- **Validación:** en cada petición privada se consulta la sesión con usuario y
  empresa. Una sesión caducada, revocada, con usuario `INACTIVO` o con empresa
  `SUSPENDIDA` no autentica. El superadmin se valida con `empresa_id` nulo.
- **Rutas:** públicas `/`, `/login`, `/health` y los endpoints de auth;
  privadas `/panel`, `/panel/usuarios`, `/panel/empresa`, `/panel/clientes`,
  `/panel/avisos` y `/superadmin`. Cada página de
  `/panel` llama a `requireSession` o `requirePermission`;
  `/superadmin` añade `requireSuperadmin`, que redirige a
  `/login?next=...` si no hay sesión y usa `forbidden()` si el usuario no es
  superadmin. `getCurrentSession` usa `cookies()` (asíncrona) y `cache()` de
  React.
- **Frontera de seguridad:** no hay middleware/proxy de autorización. Cada
  página privada (y el layout de `/superadmin`) ejecuta su guard en servidor;
  el middleware no puede validar de forma fiable una sesión de base de datos.
- **Login/logout:** `POST` con `application/x-www-form-urlencoded`, comprobación
  de mismo origen cuando llega `Origin`, 303 y `next` validado para evitar open
  redirects. Logout marca `revocada_en` y borra la cookie.

## Salud

`GET /health` es dinámico y público. Ejecuta `SELECT 1` con timeout de 2 s y
devuelve:

- `200` con `status: "ok"` y `database.status: "up"` si PostgreSQL responde;
- `503` con `status: "degraded"` y `database.status: "down"` si no.

El payload nunca incluye la cadena de conexión, credenciales ni el error crudo.

## Verificación

- `npm test`: unitarios, sin base de datos. Excluye `*.db.test.ts`.
- `npm run test:db`: migra y ejecuta tests de integración reales en serie,
  dentro de transacciones con rollback. Cubre constraints, FKs, aislamiento
  entre dos empresas, autenticación/sesiones, superadmin (planes, altas,
  duplicados, plan inactivo, token hasheado, estados de invitación y rollback)
  y roles (CHECK, validaciones, aislamiento y último administrador con dos
  transacciones concurrentes reales) y clientes (columnas de `sedes` sin datos
  fiscales, CHECK, FK compuestos, alta con rollback, NIF duplicado por empresa,
  sede de otro cliente y aislamiento A/B) y avisos (enums, CHECK, FK
  compuestos, alta en las tres prioridades con `origen`/`estado` fijos, sede y
  contacto que no encajan, listado, detalle y aislamiento A/B).
- `npm run db:seed`: seed local idempotente con `tsx` (`prisma/seed.ts`).
  Requiere `SEED_*`, rechaza `NODE_ENV=production` y no forma parte de
  `init.sh` ni del gate.
- `npm run lint`, `npm run typecheck`, `npm run build` e `init.sh` deben pasar
  sin PostgreSQL y sin `DATABASE_URL`.
