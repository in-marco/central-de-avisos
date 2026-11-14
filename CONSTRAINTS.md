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
- **MUST NOT** consultar una tabla de tenant sin filtro salvo en código de
  superadmin explícito y auditado. Motivo: una consulta sin filtro filtra datos
  de otra empresa.

## RLS diferida

- **MUST NOT** asumir que PostgreSQL bloquea lecturas cruzadas: RLS no está
  activa en esta fase. Motivo: no existe todavía contexto de autenticación ni
  roles de bypass, y Prisma con pooling requeriría `set_config` por transacción.
- **MUST** reevaluar RLS antes de producción o al añadir la primera tabla
  operativa con consultas cruzadas. Motivo: el riesgo aceptado de fuga entre
  tenants debe revisarse con auth y datos reales.

## Esquema y migraciones

- **MUST** todo cambio de esquema va en una migración SQL versionada en
  `prisma/migrations/`; en entornos compartidos se aplica con
  `npm run db:deploy`. Motivo: historial reproducible y auditable.
- **MUST NOT** usar `prisma db push` para cambios compartidos. Motivo: no deja
  historial de migración.
- **MUST** los CHECK que Prisma no modela (importe no negativo, email
  normalizado y coherencia superadmin/empresa) se mantienen en SQL y se cubren
  con `npm run test:db` al cambiar el esquema. Motivo: Prisma no los regenera.
- **MUST** los emails se guardan en minúsculas y sin espacios extremos; el
  email es único global. Motivo: identidad de usuario y login.
- **MUST** solo un usuario `es_superadmin = true` puede tener `empresa_id`
  nulo. Motivo: coherencia de pertenencia y scoping.

## Autenticación y sesiones

- **MUST** toda ruta o layout privado ejecuta `requireSession` en servidor.
  Motivo: no hay middleware/proxy que pueda validar la sesión de base de datos.
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
