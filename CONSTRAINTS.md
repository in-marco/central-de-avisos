# Constraints

Reglas durables que cualquier feature futura debe respetar. Cada regla incluye
un motivo breve. No repetir aquí lo que ya cubren el dominio, `AGENTS.md` o
`ARCHITECTURE.md`.

## Tenancy y acceso a datos

- **MUST** toda tabla operable nueva incluye `empresa_id`; `planes` es global y
  no lo lleva. Motivo: la empresa de servicios es la unidad de aislamiento.
- **MUST** toda consulta a una tabla de tenant usa `tenantFilter` o
  `requireEmpresaId`, y los recursos cargados por id pasan por
  `assertTenantAccess`. Motivo: no hay RLS que actúe como red de seguridad.
- **MUST** el `empresaId` se pasa explícitamente a los repositorios; no se
  confía en valores de la petición sin validarlos. Motivo: el cliente no es
  fuente de autorización.
- **MUST** recordar que `tenantFilter` devuelve `{ empresaId }` (campo Prisma);
  la columna física es `empresa_id`. Motivo: el filtro debe encajar con el
  cliente tipado sin renombrar el campo en cada consulta.
- **MUST NOT** consultar una tabla de tenant sin filtro salvo en
  `src/lib/superadmin/*` y siempre detrás de `requireSuperadmin`. Esa excepción
  no se replica en otros módulos. Motivo: una consulta sin filtro filtra datos
  de otra empresa.
- **MUST** la autorización de proveedor (`/superadmin`, `/api/superadmin/*`)
  usa solo `es_superadmin = true` y `empresa_id` nulo (`requireSuperadmin`);
  los roles de empresa nunca dan acceso a esa superficie. Motivo: el proveedor
  y las empresas son ámbitos de autorización distintos.
- **MUST** el alta de empresa, el usuario administrador invitado y la invitación
  se crean en una sola transacción. Motivo: un fallo no debe dejar empresa sin
  administrador ni usuario huérfano.
- **MUST** el usuario invitado se crea `INACTIVO`, sin `password_hash` y sin
  permisos hasta que acepte la invitación en `/invitacion/<token>`. Motivo:
  la existencia del registro no debe habilitar login.
- **MUST** la invitación guarda solo el SHA-256 del token; el token crudo no se
  persiste, no se registra en logs y no viaja en la URL. La única entrega local
  es la cookie flash `central_invitacion` (HttpOnly, SameSite=Strict, 60 s,
  Path `/superadmin/empresas`). Motivo: una fuga de base de datos o de logs no
  debe permitir activar cuentas.
- **MUST** la búsqueda de invitación por `token_hash` es una excepción de
  identidad sin `tenantFilter` limitada a `src/lib/onboarding/`; no se listan
  invitaciones fuera de `src/lib/superadmin/*`. Motivo: el token identifica una
  sola fila y precede al tenant, como la sesión.
- **MUST** aceptar una invitación es atómico y de un solo uso: `aceptada_en`,
  `password_hash`, `estado ACTIVO` y la sesión se escriben en una transacción,
  con `updateMany` condicionado a `aceptada_en IS NULL` y no caducada. Motivo:
  un doble envío o una carrera no deben activar dos veces ni crear sesiones
  extra.
- **MUST** una invitación de empresa no `ACTIVA` no se acepta y sigue
  pendiente. Motivo: la sesión resultante no autenticaría y el usuario quedaría
  activo sin poder entrar.
- **MUST** las contraseñas nuevas tienen entre 12 y 128 caracteres y se
  confirman (`validateNewPassword`); el login no aplica esta política. Motivo:
  no bloquear cuentas existentes al endurecer las altas.
- **MUST** `/invitacion/*` responde con `Referrer-Policy: same-origin`,
  `Cache-Control: no-store` y `X-Robots-Tag: noindex`; el token viaja en el
  cuerpo del POST y nunca en la redirección final. Motivo: el token está en el
  path del enlace y no debe filtrarse por Referer, cachés o buscadores.
- **MUST NOT** usar `Referrer-Policy: no-referrer` en páginas con formularios
  que hacen POST a endpoints protegidos con `isSameOrigin`. Motivo: con
  `no-referrer` el navegador envía `Origin: null` en el POST y el endpoint
  responde 403; `same-origin` evita la fuga a terceros sin romper el control.
- **MUST** los formularios nuevos se verifican al menos una vez enviándolos
  desde un navegador real, no solo con `curl`. Motivo: `curl` fija la cabecera
  `Origin` a mano y no reproduce cómo la calcula el navegador (fallo real en
  `company-admin-onboarding`).
- **MUST** el NIF se normaliza a mayúsculas y sin espacios antes de guardarlo;
  los CHECK `empresas_nif_normalizado` y `clientes_nif_normalizado` y los
  índices únicos lo respaldan (en empresas, único global; en clientes, único
  por empresa). Motivo: evitar duplicados por variantes de escritura.
- **MUST** la configuración de empresa (`/panel/empresa`) se escribe solo
  sobre `session.empresa.id` (vía `requireEmpresaId`) y nunca toca `plan_id`
  ni `estado`; los campos `empresaId`/`id` del formulario se ignoran. Motivo:
  el plan y el estado los gestiona el proveedor y el cliente no elige tenant.
- **MUST** `modo_fiscal` solo admite `NO_VERIFACTU`, en el enum de la base de
  datos y en la validación del servidor; añadir `VERIFACTU` exige una feature
  o ADR que lo active (`ALTER TYPE ... ADD VALUE`). Motivo: el MVP es
  NO-VERIFACTU y no debe existir ningún camino para activarlo por error.
- **MUST** las features de factura bloquean la emisión si `serie_factura` o
  `tarifa_horaria` de la empresa son nulas (NULL = sin configurar). Motivo: no
  se inventa una serie ni se factura a 0 €.
- **MUST** toda tabla hija de un recurso de tenant lleva `empresa_id` y un FK
  compuesto `(padre_id, empresa_id) → padre(id, empresa_id)` cuando Prisma lo
  permite (como `sedes` y `contactos` hacia `clientes`). Si Prisma no lo
  permite (relación opcional que reutiliza una columna obligatoria, como
  `contactos.sede_id`), la regla se aplica en el repositorio, se cubre con
  `test:db` y se documenta. Motivo: que PostgreSQL impida mezclar empresas
  aunque falle el código.
- **MUST** los ids recibidos en formularios o en la URL (cliente, sede,
  contacto…) se resuelven siempre con `tenantFilter` (y con el padre cuando lo
  hay), y un recurso de otra empresa se trata como inexistente: 404 en las
  páginas y `?error=no-encontrado` en los route handlers, nunca un 403 que
  revele que existe. Motivo: no filtrar la existencia de datos de otro tenant.
- **MUST** un aviso referencia cliente, sede y contacto con FK compuestos
  `(cliente_id, empresa_id) → clientes`, `(sede_id, cliente_id) → sedes` y
  `(contacto_id, cliente_id) → contactos`, y el contacto es de todo el cliente
  (`sede_id` nulo) o de la sede del aviso; esta última regla la aplica
  `src/lib/avisos/avisos.ts` y la cubre `test:db`. Motivo: un aviso nunca debe
  mezclar empresas ni clientes, y un FK no puede expresar «nulo o igual».
- **MUST** `origen`, `estado`, `empresa_id` y `creado_por_id` de un aviso los
  fija el servidor (sesión y repositorio), nunca el formulario; el alta de
  oficina escribe `OFICINA` y `NUEVO`. Las transiciones de estado solo se
  hacen en las features que las definen. Motivo: el ciclo de vida del aviso no
  debe poder saltarse desde una petición manipulada.
- **MUST** los mensajes de `?error=`/`?ok=` de páginas nuevas se buscan con
  `Object.hasOwn` (o un `Map`), nunca indexando un objeto literal. Motivo:
  `?error=__proto__` o `constructor` resuelven propiedades heredadas y
  provocan un 500 (hallazgo de `client-records`).
- **MUST** los datos fiscales del destinatario de una factura (razón social,
  NIF, dirección de facturación) viven solo en `clientes`; la factura de
  trabajo referenciará `cliente_id`, nunca `sede_id`. Motivo: el cliente es el
  sujeto fiscal y la sede solo el lugar de la intervención.
- **MUST** las acciones de superadmin quedan pendientes de auditoría avanzada
  (`audit-trail-view`); hasta entonces no se añaden efectos que dependan de un
  registro de auditoría. Motivo: riesgo aceptado y documentado en
  `docs/risks-and-open-questions.md`.

## Roles y permisos de empresa

- **MUST** toda página de empresa usa `requirePermission` y todo route handler
  de empresa usa `authorizeCompanyRequest`, ambos con un `Permiso` de
  `src/lib/authz/permissions.ts`; ocultar una entrada de la navegación nunca
  basta. Única excepción: la portada `/panel`, que comparten el superadmin y
  los usuarios sin roles, usa `requireSession` y no muestra datos de empresa
  protegidos por permiso. Motivo: la interfaz no es la frontera de seguridad y
  las URLs se pueden escribir a mano.
- **MUST** la matriz de `permissions.ts` coincide con
  `docs/user-and-access-model.md`; si discrepan, manda el documento y se
  corrigen código y test. Motivo: una sola fuente de verdad de permisos.
- **MUST** los roles se leen de la base de datos en cada petición (vía
  `getCurrentSession`); no se cachean en la cookie ni entre peticiones.
  Motivo: retirar un rol debe cortar el acceso de inmediato.
- **MUST** una empresa conserva al menos un administrador `ACTIVO` y nadie se
  quita su propio `ADMINISTRADOR`; los cambios de roles bloquean la fila de la
  empresa (`FOR UPDATE`) y revierten si el recuento queda a cero. Motivo:
  evitar empresas sin nadie que gestione usuarios, también en concurrencia.
- **MUST** el superadmin no tiene roles (CHECK `usuarios_superadmin_sin_roles`)
  ni permisos de empresa (`can()` devuelve `false`). Motivo: separar proveedor
  y tenant.
- **MUST** `forbidden()` solo se lanza por debajo de un boundary
  `forbidden.tsx` propio (en `/panel`, desde la página, nunca desde
  `src/app/panel/layout.tsx`). Motivo: lanzado en el layout del mismo segmento,
  Next muestra su 403 por defecto en inglés.
- **MUST** cada `page.tsx` de `/panel` llama a `requireSession` o
  `requirePermission`; el layout de `/panel` no redirige ni deniega
  (`panel-guards.test.ts` lo comprueba). Motivo: Next renderiza la página aunque
  el layout no lo haga, y si el layout redirigiera, el login perdería la ruta
  pedida en `next`.

## RLS diferida

- **MUST NOT** asumir que PostgreSQL bloquea lecturas cruzadas: RLS no está
  activa en esta fase. Motivo: no existe todavía contexto de autenticación ni
  roles de bypass, y Prisma con pooling requeriría `set_config` por transacción.
- **MUST** reevaluar RLS antes de producción o al añadir la primera tabla
  operativa con consultas cruzadas. Motivo: el riesgo aceptado de fuga entre
  tenants debe revisarse con auth y datos reales.
- Reevaluación registrada en `client-records` (primeras tablas operativas:
  `clientes`, `sedes`, `contactos`): RLS sigue diferida porque no hay
  consultas cruzadas entre empresas fuera de `src/lib/superadmin/*`, todas las
  consultas de clientes usan `tenantFilter` con aislamiento A/B en `test:db` y
  los FK compuestos impiden escrituras mezcladas. Pendiente de confirmar antes
  de producción o con la primera consulta cruzada (p. ej.
  `superadmin-tenant-view`).

## Esquema y migraciones

- **MUST** todo cambio de esquema va en una migración SQL versionada en
  `prisma/migrations/`; en entornos compartidos se aplica con
  `npm run db:deploy`. Motivo: historial reproducible y auditable.
- **MUST NOT** usar `prisma db push` para cambios compartidos. Motivo: no deja
  historial de migración.
- **MUST** los CHECK que Prisma no modela (importe no negativo, email
  normalizado, coherencia superadmin/empresa, NIF normalizado, fechas de
  invitación, superadmin sin roles, roles sin nulos, serie de factura
  normalizada `^[A-Z0-9][A-Z0-9-]{0,9}$`, tarifa horaria de empresa `> 0`, NIF
  de cliente normalizado, tarifa de cliente no negativa, contacto con teléfono
  o email, email de contacto normalizado y descripción de aviso no vacía
  `avisos_descripcion_no_vacia`) se mantienen en SQL y se cubren con
  `npm run test:db` al cambiar el esquema. Motivo: Prisma no los regenera.
- **MUST** los emails se guardan en minúsculas y sin espacios extremos; el
  email es único global. Motivo: identidad de usuario y login.
- **MUST** solo un usuario `es_superadmin = true` puede tener `empresa_id`
  nulo. Motivo: coherencia de pertenencia y scoping.

## Autenticación y sesiones

- **MUST** toda página privada (o el layout de su route group, como en
  `/superadmin`) ejecuta `requireSession`, `requirePermission` o
  `requireSuperadmin` en servidor. Motivo: no hay middleware/proxy que pueda
  validar la sesión de base de datos.
- **MUST NOT** usar `middleware.ts`/`proxy.ts` como frontera de autorización.
  Motivo: es fácil de eludir y no consulta la sesión real.
- **MUST** la cookie `central_sesion` es `HttpOnly`, `SameSite=Lax`, `Path=/`,
  `Max-Age=43200` y `Secure` cuando la petición es HTTPS. Motivo: reducir
  exposición del token y fijar una duración absoluta de 12 h.
- **MUST** en base de datos se guarda solo el SHA-256 del token, nunca el token
  crudo. Motivo: una fuga de `sesiones` no debe permitir reutilizar sesiones.
- **MUST** cada petición privada comprueba sesión no revocada, no caducada,
  usuario `ACTIVO` y empresa `ACTIVA` (o superadmin con `empresa_id` nulo).
  Motivo: desactivar un usuario o suspender una empresa debe cortar el acceso
  de inmediato.
- **MUST** las contraseñas se guardan con el formato scrypt versionado y se
  comparan con `timingSafeEqual`; login devuelve siempre el mismo error
  genérico para credenciales, email inexistente, invitado sin contraseña,
  usuario inactivo o empresa suspendida. Motivo: evitar enumeración y permitir
  rehash futuro.
- **MUST NOT** registrar email, contraseña, token ni hash en logs. Motivo:
  secretos y datos personales.
- **MUST** el login busca por email único global y la sesión por `token_hash`
  con el cliente explícito; son excepciones acotadas de identidad, no consultas
  de dominio y no llevan `tenantFilter`. Motivo: la identidad precede al tenant.
- **MUST** login y logout son `POST`, comprueban mismo origen cuando llega
  `Origin` y validan `next` contra open redirects. Motivo: CSRF y redirecciones
  seguras.
- **MUST** el seed usa `SEED_*` locales, es idempotente, rechaza producción y
  no se ejecuta en `init.sh`. Motivo: evitar credenciales reales o datos demo
  en el gate o en producción.
- **MUST** añadir rate limiting durable (edge/WAF o base de datos) antes de
  exponer el login fuera de demo/producción. Motivo: el slice actual solo
  mitiga fuerza bruta con error genérico, hash dummy y coste de scrypt.

## Cliente Prisma y entorno

- **MUST** `PrismaClient` se crea solo con `@prisma/adapter-pg` y
  `DATABASE_URL`, de forma perezosa. Motivo: Prisma 7 exige driver adapter y el
  build debe funcionar sin base de datos.
- **MUST** el cliente generado en `src/generated/prisma` se regenera con
  `npm run db:generate`; no se versiona ni se edita a mano. Motivo: se deriva
  del esquema y ensucia diffs.
- **MUST NOT** importar `src/db/client.ts` ni el cliente generado desde
  componentes de cliente. Motivo: es código de servidor con `pg`.
- **MUST NOT** commitear `.env` ni credenciales reales; los ejemplos locales
  viven en `.env.example`. Motivo: secretos fuera del control de versiones.
- **MUST** `prisma.config.ts` mantiene la URL opcional para que
  `prisma generate`, `npm run build` e `init.sh` funcionen sin `DATABASE_URL`.
  Motivo: el gate no debe depender de servicios externos.
- **MUST** cualquier pipeline de instalación/build incluye devDependencies
  (el CLI `prisma` vive ahí y `postinstall` lo usa). Motivo: `npm ci --omit=dev`
  no puede generar el cliente Prisma y el build fallaría.

## Salud y verificación

- **MUST** `/health` responde 200/503 según PostgreSQL y nunca incluye
  credenciales, cadena de conexión ni error crudo. Motivo: endpoint público.
- **MUST** `npm test` sigue siendo unitario y sin base de datos; los tests
  `*.db.test.ts` se ejecutan con `npm run test:db`. Motivo: el gate estándar
  debe funcionar en un clon sin PostgreSQL.
- **MUST** `init.sh` no arranca PostgreSQL, servidores de desarrollo ni
  servicios de larga duración. Motivo: es un gate no bloqueante.
