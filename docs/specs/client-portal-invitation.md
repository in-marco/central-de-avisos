# Feature Implementation Spec: Invitación al portal de cliente

## Source Feature

- `id`: `client-portal-invitation`
- `area`: `clients`
- `depends_on`: `client-records`, `email-password-auth` (ambas `accepted`)
- `status` en planificación: `not_started`
- `source`: `feature_list.json`. Verificación fuente: invitar a un contacto, aceptar la invitación y acceder al portal; comprobar que solo ve sus sedes, avisos y facturas; abrir datos de otro cliente de la misma empresa y recibir 403.
- Tamaño: en el límite alto. Un cambio de modelo (`usuarios.cliente_id`/`contacto_id` + tipo de invitación) y un flujo (invitar → activar → portal de solo lectura). La aceptación reutiliza `company-admin-onboarding`. No se recomienda dividir.

## Goal

Administrador y oficina (`clientes.gestionar`) invitan al portal a un contacto con email desde el detalle del cliente. Se crea un usuario de cliente `INACTIVO`, ligado a su `cliente_id` y a su `contacto_id`, con una invitación de 7 días. El enlace solo se muestra durante 60 s desde una cookie flash (recargar en ese plazo lo vuelve a mostrar). El contacto lo abre en `/invitacion/<token>` (el mismo flujo atómico de un solo uso), define su contraseña y entra en `/portal`. Allí ve los datos de su cliente y sus sedes, y nada de otros clientes de la empresa.

### Cómo se cumple «ve solo sus sedes, avisos y facturas»

Al especificar esta feature, avisos y facturas todavía no existían (`office-aviso-creation`, `client-aviso-creation` y `client-invoice-access` venían después). Nota de integración: `office-aviso-creation` llegó antes a `main`; el usuario de cliente recibe 403 en `/panel/avisos/*` y en `POST /api/panel/avisos`, cubierto por `src/lib/portal/panel-avisos-access.test.ts` y por el bloque `SMOKE_CLIENTE_*` de `validate-smoke.sh`. Esta feature no crea tablas, pantallas ni estados vacíos de avisos o facturas. Lo cumple así:

1. **Sedes:** el portal lista solo las sedes de `session.cliente.id`, y `/portal/sedes/<id>` de cualquier otra sede responde 403.
2. **Contrato de alcance de cliente**, listo para avisos y facturas: `requirePortalSession`, `clienteScope(session)` y `clienteFilter(scope)` en `src/lib/portal/scope.ts`. Probado en `test:db` con sedes de dos clientes de la misma empresa y de dos empresas. La regla queda en `CONSTRAINTS.md`: toda consulta del portal filtra por `empresa_id` **y** `cliente_id` de la sesión, nunca por ids de la petición.
3. **Nada más visible:** el usuario de cliente no tiene ningún permiso de empresa (`can()` devuelve `false`), así que `/panel/*` (incluidos los futuros avisos y facturas de oficina) le devuelve 403 o le redirige a `/portal`.

Las features futuras de avisos y facturas del portal deben usar este contrato y añadir su caso al test de aislamiento.

## Non-Goals

- Avisos o facturas en el portal, o sus secciones vacías. Alta de aviso desde el portal (`client-aviso-creation`) y facturas del portal (`client-invoice-access`).
- Retirar el acceso o desactivar usuarios de portal (`user-deactivation`). Editar un usuario de portal. Envío real de email.
- Rol `CLIENTE` en el enum `rol_usuario` (ver Decisiones). Cambios en la matriz de permisos de empresa.
- Editar datos desde el portal: el portal es de solo lectura. No hay route handlers `/api/portal/*`.
- Auditoría de invitaciones y aceptaciones (`audit-trail-view`). Cambios de seed. RLS. Playwright.

## Job Story

Cuando un cliente quiere seguir sus trabajos sin llamar a la oficina,
quiero invitar a su persona de contacto al portal con un enlace,
para que entre con su propia contraseña y vea solo lo de su empresa cliente.

## Users And Permissions

- **Administrador y oficina** (`clientes.gestionar`): invitan o generan un enlace nuevo para un contacto con email de un cliente de su empresa. Ven el estado del acceso de cada contacto. No se añade un permiso nuevo.
- **Técnico, usuario sin roles y superadmin:** 403 en el POST de invitación, como en el resto de `/api/panel/clientes/*`.
- **Usuario de cliente** (`usuarios.cliente_id` no nulo, `roles = {}`): solo `/portal` y `/portal/sedes/[id]` de su cliente. `/panel` le lleva a `/portal` (307). Las páginas `/panel/*` con permiso, `/superadmin` y las APIs de panel le devuelven 403.
- **Usuarios de empresa y superadmin en `/portal`:** 403 con la UI propia del portal. **Anónimo:** 307 a `/login?next=%2Fportal...`.

## Acceptance Scenarios

1. **Invitar.** La oficina abre el detalle de un cliente. El contacto «Ana» (con email) muestra «Sin acceso al portal» y el botón «Invitar al portal». Al pulsarlo, `POST /api/panel/clientes/portal` responde 303 a `/panel/clientes/<id>?ok=invitado` con la cookie flash `central_invitacion_portal`. En una transacción se crea un usuario `INACTIVO` sin `password_hash` (email y nombre del contacto, `empresa_id`, `cliente_id`, `contacto_id`, `roles {}`) y una invitación `CONTACTO_CLIENTE` de 7 días, guardada como SHA-256. El detalle muestra el enlace `/invitacion/<token>` durante 60 s y el estado «Invitación pendiente».
2. **Rechazos de invitación** (303 con `?error=` y BD sin cambios):
   - Contacto sin email → `contacto-sin-email` (el botón no aparece).
   - Email ya usado por cualquier usuario → `email-en-uso`.
   - Contacto con usuario `ACTIVO` → `ya-activo`.
   - Contacto o cliente de otra empresa, inexistente o no UUID → `no-encontrado`.
   - Contacto de otro cliente de la misma empresa → `no-encontrado`.
3. **Enlace nuevo.** Si el usuario del contacto sigue `INACTIVO` (pendiente o caducada), el botón dice «Generar nuevo enlace». Crea una invitación nueva y marca como caducadas (`expira_en = now`) las pendientes anteriores de ese usuario. El enlace anterior pasa a «ha caducado».
4. **Activar.** `/invitacion/<token>` muestra «Portal de cliente», la razón social del cliente, la empresa de servicios, el nombre y el email. Con una contraseña válida, `POST /api/invitaciones/aceptar` responde 303 a **`/portal`** con `central_sesion`. Todas las reglas de `company-admin-onboarding` se mantienen para los dos tipos: un solo uso, concurrencia, caducada, empresa suspendida, `same-origin`, `no-store`, 405 y errores de contraseña. La invitación de administrador sigue llevando a `/panel`.
5. **Portal.** `/portal` muestra el nombre del usuario, el cliente (razón social, NIF y dirección de facturación) y la lista de **sus** sedes con enlace a `/portal/sedes/<id>` (nombre y dirección). No muestra sedes, contactos ni datos de otros clientes. Tampoco muestra tarifa.
6. **Otro cliente, 403.** Con dos clientes C1 y C2 de la misma empresa, el usuario de C1 abre `/portal/sedes/<sede de C2>` y recibe 403 con la UI del portal, sin datos de C2. Un id de otra empresa, inexistente o que no es UUID devuelve el mismo 403 genérico (ver Decisiones).
7. **Fronteras.** El usuario de cliente:
   - `/panel` → 307 a `/portal`.
   - `/panel/clientes`, `/panel/clientes/<id de C1>`, `/panel/usuarios`, `/panel/empresa` y `/superadmin` → 403.
   - POST a `/api/panel/clientes/*` → 403.

   Usuarios de empresa (admin, oficina, técnico) y superadmin reciben 403 en `/portal`. Un anónimo recibe 307 a `/login?next=%2Fportal`.
8. **Login posterior.** Tras cerrar sesión, el usuario de cliente entra por `/login` (con `next=/panel` por defecto) y termina en `/portal`.
9. **Sin efectos colaterales.**
   - `/panel/usuarios` no lista usuarios de cliente, y `POST /api/panel/usuarios/roles` con su id devuelve `?error=no-encontrado`.
   - Las vistas de superadmin (listado, detalle, contador de pendientes) siguen mostrando solo la invitación de administrador.
10. **Integridad en BD.** La base rechaza:
    - un usuario con `cliente_id` de otra empresa (FK compuesto);
    - un usuario de cliente con roles, superadmin o sin empresa (CHECK);
    - `contacto_id` sin `cliente_id` (CHECK);
    - dos usuarios con el mismo `contacto_id` (UNIQUE).
11. **Navegador real.** El formulario de invitación y el de activación se envían con clic real desde Edge, con `Origin: http://localhost:3106`.
12. **Gate sin BD.** `init.sh` pasa sin `DATABASE_URL`.

## Repository Research

### Files Inspected

- `AGENTS.md`, `PROGRESS.md`, `feature_list.json`, `CONSTRAINTS.md`, `DESIGN.md` (portal mobile-first, «no mostrar datos de otro cliente ni en errores»), `docs/user-and-access-model.md`, `docs/domain-model.md` (grep), `docs/specs/company-admin-onboarding.md`, `docs/specs/client-records.md`.
- `prisma/schema.prisma`: `Usuario` sin `cliente_id`; `TipoInvitacion` solo `ADMINISTRADOR_EMPRESA`; `Cliente @@unique([id, empresaId])` (destino de FK compuesto); `Contacto.email` nullable y normalizado.
- `src/lib/onboarding/invitation-acceptance.ts`: `classifyInvitation` rechaza cualquier tipo distinto de `ADMINISTRADOR_EMPRESA` (→ `NO_ENCONTRADA`); la transacción y el `updateMany` condicionado se reutilizan.
- `src/app/api/invitaciones/aceptar/route.ts` (redirige siempre a `/panel`) y `src/app/invitacion/[token]/page.tsx` (texto fijo de administrador).
- `src/lib/auth/session.ts` (`AuthenticatedUser` sin cliente), `current-session.ts`, `src/lib/authz/permissions.ts` (`can`), `guards.ts`, `navigation.ts` y `panel-guards.test.ts`.
- `src/app/panel/layout.tsx` y `page.tsx`: un usuario sin roles hoy ve «Sin roles asignados».
- `src/lib/clientes/clientes.ts`, `src/app/panel/clientes/[id]/page.tsx` y `src/app/api/panel/clientes/_shared/respond.ts`: patrón `openClientesRequest`, `redirectTo` y `?ok/?error`.
- `src/lib/superadmin/companies.ts`, `invitations.ts` y `(protected)/empresas/[id]/page.tsx` + `copy-link.tsx`: token, cookie flash y `invitaciones[0]` sin filtrar por tipo.
- `src/lib/empresa/usuarios.ts`: listado y cambio de roles sin excluir usuarios de cliente.
- `scripts/validate-smoke.sh`: estructura y variables `SMOKE_*`.

### Existing Patterns To Follow

- Lógica en `src/lib/<módulo>/` con el cliente Prisma explícito. Cuerpos transaccionales exportados (`...InTransaction`) para `inRollback`.
- Route handlers con `isSameOrigin`, `authorizeCompanyRequest`, 405 en `GET` y 303 con `?ok=`/`?error=`. Páginas `force-dynamic` con `params: Promise`.
- Token de 32 bytes base64url, SHA-256 en BD y cookie flash HttpOnly/SameSite=Strict/60 s con `Path` acotado (`superadmin-company-plan`).
- Guard por página y layout que no redirige, con un test estático que lo exige (`panel-guards.test.ts`). `forbidden.tsx` por segmento.

### Current Gaps

- No hay `cliente_id` en usuarios ni tipo de invitación para contactos. No existen la superficie `/portal` ni un guard de portal.
- `can()` y `visibleNavItems` no distinguen al usuario de cliente. Hoy sería un «usuario sin roles» en `/panel`.
- Las consultas de superadmin y de `/panel/usuarios` asumen que todos los usuarios e invitaciones son de empresa.
- `docs/specs/role-based-permissions.md` anticipó un `ALTER TYPE rol_usuario ADD VALUE 'CLIENTE'`. Esta spec lo sustituye (ver Decisiones).

## Decisiones

1. **Sin rol `CLIENTE`.** El usuario de cliente se identifica por `cliente_id IS NOT NULL` con `roles = '{}'` (CHECK). Así no puede combinarse con roles de empresa y su alcance (`cliente_id`) es obligatorio por construcción. `can()` devuelve `false` si la sesión tiene cliente.
2. **Usuario ligado al contacto.** `usuarios.contacto_id` UNIQUE impide dos accesos por contacto y permite mostrar el estado en el detalle. FK simple a `contactos(id)`; la regla «el contacto es del mismo cliente y empresa» se aplica en el repositorio y se cubre en `test:db` (mismo patrón que `contactos.sede_id`). `cliente_id` usa FK compuesto `(cliente_id, empresa_id) → clientes(id, empresa_id)`. El email del usuario se copia del contacto al invitar y no se sincroniza después.
3. **403 uniforme en el portal.** Cualquier sede fuera del cliente de la sesión (de otro cliente, de otra empresa, inexistente o mal formada) devuelve el mismo `forbidden()` sin datos. Cumple el «403» de `feature_list.json` sin revelar existencia. Es una excepción **nombrada** a la regla «404 en las páginas» de `CONSTRAINTS.md`, que se documenta allí y se limita a `/portal`.
4. **Enlace nuevo para invitaciones de portal.** Lo emite la oficina y el enlace solo se ve 60 s. Sin enlace nuevo, un contacto quedaría bloqueado para siempre (email y `contacto_id` únicos). Las invitaciones de administrador siguen sin reenvío.
5. **Permiso:** se reutiliza `clientes.gestionar`. No se añade ningún permiso nuevo.

## Technical Approach

1. **Migración** `prisma/migrations/<timestamp posterior a 20261114190000>_portal_cliente/`:
   - `ALTER TYPE tipo_invitacion ADD VALUE 'CONTACTO_CLIENTE'` (no se usa en la misma migración).
   - `usuarios.cliente_id` y `usuarios.contacto_id`, `uuid NULL`.
   - FK `usuarios_cliente_id_empresa_id_fkey` `(cliente_id, empresa_id) → clientes(id, empresa_id)` Restrict, FK `contacto_id → contactos(id)` Restrict, UNIQUE `contacto_id` e índice `cliente_id`.
   - CHECK `usuarios_cliente_coherente`: `cliente_id IS NULL OR (es_superadmin = false AND empresa_id IS NOT NULL AND cardinality(roles) = 0)`.
   - CHECK `usuarios_contacto_requiere_cliente`: `contacto_id IS NULL OR cliente_id IS NOT NULL`.
   - Prisma: `Usuario.cliente` con fields `[clienteId, empresaId]` (ambos opcionales), `Usuario.contacto` con `contactoId @unique`, y las relaciones inversas en `Cliente` y `Contacto`.
   - `office-aviso-creation` avanza en paralelo y también añadirá migración: el timestamp se revisa al rebasar.
2. **Sesión** (`session.ts`): `AuthenticatedUser.cliente: { id; razonSocial } | null` (include `cliente` en login y en `getSessionByToken`). Un usuario de cliente cuyo `cliente.empresaId` no coincida no autentica (defensa). `AuthzSubject` gana `cliente?: { id } | null` y `can()` devuelve `false` si existe.
3. **`src/lib/portal/scope.ts`** (puro, con test unitario): `isPortalSession`, `clienteScope(session) → { empresaId, clienteId }` (lanza si no es de portal) y `clienteFilter(scope) → { empresaId, clienteId }` para `where` de Prisma. Comentario: contrato obligatorio para avisos y facturas del portal.
4. **`src/lib/portal/guards.ts`:** `requirePortalSession(nextPath)`. Anónimo → `redirect` al login con `next`; sesión sin cliente → `forbidden()`. Devuelve la sesión y el `scope`.
5. **`src/lib/portal/portal.ts`:** `getPortalCliente(db, scope)` (razón social, NIF, dirección y sedes con `clienteFilter`) y `getPortalSede(db, scope, sedeId)` (`null` si no es UUID o está fuera del alcance).
6. **`src/lib/portal/invitaciones.ts`:**
   - `invitePortalContactInTransaction(tx, { empresaId, clienteId, contactoId, now })` y su envoltorio. Resuelve cliente y contacto con `tenantFilter` y `clienteId`, y aplica los errores del escenario 2. Crea el usuario y la invitación, o en el caso del escenario 3 caduca las pendientes (`where creadaEn < now`, por el CHECK de expiración) y crea una nueva. Devuelve el token crudo. Si salta una violación única de email o `contacto_id` en una carrera, devuelve `email-en-uso` / `ya-activo`.
   - `listPortalAccess(db, empresaId, clienteId)` → por contacto: `sin-acceso | pendiente(expiraEn) | caducada | activo`.
7. **Onboarding:**
   - `classifyInvitation` acepta los dos tipos con coherencia por tipo: `ADMINISTRADOR_EMPRESA` exige `clienteId` nulo y `CONTACTO_CLIENTE` exige `clienteId` no nulo y `cliente.empresaId` igual al de la invitación.
   - `ValidInvitation` añade `tipo` y `cliente: { razonSocial } | null`. `AcceptInvitationResult` añade `destino: "/panel" | "/portal"`.
   - La ruta de aceptación redirige a `destino`. La página adapta el texto al tipo.
8. **Office UI:**
   - `/panel/clientes/[id]` muestra en cada contacto su estado de portal (chip con texto, no solo color) y un formulario POST con `clienteId`/`contactoId` («Invitar al portal» o «Generar nuevo enlace»).
   - Bloque del enlace flash, reutilizando `CopyInvitationLink`. Se muestra solo si el hash de la cookie corresponde a una invitación pendiente de un usuario de ese cliente.
   - Route handler `src/app/api/panel/clientes/portal/route.ts` con `openClientesRequest`. Cookie `central_invitacion_portal`: HttpOnly, SameSite=Strict, `Max-Age=60`, `Path=/panel/clientes`. El token nunca va en la URL.
9. **Superficie `/portal`:**
   - `src/app/portal/layout.tsx`: cabecera con wordmark, nombre, email · razón social y «Cerrar sesión». No redirige ni deniega.
   - `src/app/portal/forbidden.tsx`: «403 · No autorizado», texto genérico y enlace a `/portal`.
   - `src/app/portal/page.tsx` y `src/app/portal/sedes/[id]/page.tsx` llaman a `requirePortalSession`. La sede fuera de alcance llama a `forbidden()`.
   - `metadata.robots` noindex.
10. **Ajustes:**
    - `/panel/page.tsx`: si `session.cliente`, `redirect("/portal")`.
    - `listCompanyUsers` y `updateUserRolesInTransaction` filtran `clienteId: null`.
    - `listCompaniesWithInvitations`, `getCompanyDetail` y `countPendingInvitations` filtran `tipo: "ADMINISTRADOR_EMPRESA"`.
    - `portal-guards.test.ts` exige `requirePortalSession(` en cada `page.tsx` de `src/app/portal`.

## Expected File Changes

- `prisma/schema.prisma`, `prisma/migrations/<ts>_portal_cliente/migration.sql`: crear o modificar.
- `src/lib/portal/{scope.ts,scope.test.ts,guards.ts,portal.ts,invitaciones.ts,portal.db.test.ts,invitaciones.db.test.ts}`: crear.
- `src/lib/portal/portal-guards.test.ts` (o en `src/lib/authz/`): crear.
- `src/lib/auth/session.ts`, `src/lib/auth/auth.db.test.ts`, `src/lib/authz/permissions.ts`, `permissions.test.ts`, `navigation.test.ts`: modificar.
- `src/lib/onboarding/invitation-acceptance.ts`, `.test.ts`, `.db.test.ts`: modificar.
- `src/app/invitacion/[token]/page.tsx`, `src/app/api/invitaciones/aceptar/route.ts`: modificar.
- `src/app/api/panel/clientes/portal/route.ts`: crear. `src/app/panel/clientes/[id]/page.tsx` y `_components/mensajes.ts`: modificar.
- `src/app/portal/{layout.tsx,forbidden.tsx,page.tsx,sedes/[id]/page.tsx}`: crear. `src/app/panel/page.tsx`: modificar.
- `src/lib/empresa/usuarios.ts` (+ db test) y `src/lib/superadmin/companies.ts` (+ db test): modificar.
- `src/db/schema.db.test.ts`, `src/db/tenant-isolation.db.test.ts`: modificar.
- `scripts/validate-smoke.sh`: anónimo `/portal` y `/portal/sedes/<uuid>` 307; `GET /api/panel/clientes/portal` 405; Origin ajeno 403. Opcionales `SMOKE_CLIENTE_EMAIL`/`SMOKE_CLIENTE_PASSWORD`: `/portal` 200, `/panel` 307 → `/portal`, `/panel/clientes` y `/superadmin` 403, sede aleatoria 403. Los roles de empresa existentes comprueban `/portal` 403.
- `init.sh`: solo el mensaje final (ruta `/portal`), si procede.
- Documentación: ver abajo.

## Visual Design Impact

- UI: sí. Fuente: `DESIGN.md` y los componentes de `src/app/panel/_components/ui.tsx`.
- Portal: mobile-first a 390 px, shell más simple que el panel (sin navegación de oficina). Una tarjeta del cliente con `<dl>` y una lista de sedes como tarjetas enlazables de 48 px como mínimo. Un 403 propio en español.
- Detalle de cliente: chip de estado de acceso con texto (Sin acceso / Invitación pendiente hasta … / Invitación caducada / Acceso activo), botón secundario de invitación y bloque del enlace con borde latón, como en el superadmin.
- Página de invitación: eyebrow «Portal de cliente» y texto específico.
- Foco latón de 2 px, errores `role="alert"`, éxito `role="status"` y sin `text-accent` en texto.
- Pregunta abierta de `DESIGN.md` («shell del portal»): se resuelve con un shell simplificado y se anota allí.

## Durable Documentation Impact

- `CONSTRAINTS.md`: actualizar.
  - MUST: toda consulta del portal usa `clienteFilter(clienteScope(session))` (empresa y cliente de la sesión).
  - MUST: usuario de cliente sin roles ni permisos de empresa (CHECK y `can()`).
  - MUST: cada `page.tsx` de `/portal` llama a `requirePortalSession`.
  - Excepción nombrada: el 403 uniforme del portal.
  - Cookie flash `central_invitacion_portal`.
  - Las vistas de superadmin filtran la invitación por tipo.
- `ARCHITECTURE.md`: actualizar. Módulo `src/lib/portal/`, superficie `/portal`, columnas nuevas y destino de la aceptación por tipo.
- `AGENTS.md` y `README.md`: actualizar. Rutas `/portal`, `/portal/sedes/<id>`, `POST /api/panel/clientes/portal` y `SMOKE_CLIENTE_*`.
- `docs/user-and-access-model.md`: actualizar. Comportamiento implementado del usuario de cliente y nota de que avisos y facturas del portal usan el contrato de alcance.
- `docs/domain-model.md`: actualizar. Usuario de cliente y tipo de invitación.
- `docs/risks-and-open-questions.md`: actualizar.
  - `email-en-uso` revela que el email existe.
  - `contacto_id` con regla solo de aplicación.
  - Sin retirada de acceso hasta `user-deactivation`.
  - Email del usuario no sincronizado con el contacto.
- `DESIGN.md`: actualizar la pregunta abierta del shell del portal. `docs/specs/role-based-permissions.md`: no se toca (la decisión queda aquí).

## Implementation Tasks

- [ ] Migración, esquema, `db:generate`; tests de esquema e integridad (escenario 10).
- [ ] Sesión con `cliente`, `can()` y tests de permisos (usuario de cliente sin permisos).
- [ ] `src/lib/portal/` (scope, guards, repositorio, invitaciones) con tests unitarios y `test:db`: aislamiento entre C1 y C2 de la misma empresa y entre empresas, rechazos, enlace nuevo, carrera de email.
- [ ] Onboarding generalizado por tipo, con tests (incluida la aceptación de un contacto que termina en `/portal` y una sesión con cliente).
- [ ] UI de oficina, route handler y cookie flash.
- [ ] Superficie `/portal`, redirect de `/panel` y `portal-guards.test.ts`.
- [ ] Ajustes en usuarios y superadmin con sus tests.
- [ ] `validate-smoke.sh`, documentación durable, evidencia en `feature_list.json` y `PROGRESS.md`.

## Verification Plan

Entorno: Git Bash, `.env` del worktree con `DATABASE_URL` hacia **`central_de_avisos_client_portal_invitation`**. Nunca `central_de_avisos` ni otras bases. Antes de cada comando con BD, comprobar `DATABASE_URL`. Temporales (cookies, logs, scripts, perfil de Edge, capturas) solo en `D:/desarrollo/CursoAIExpert/central-de-avisos-worktrees/.tmp-client-portal-invitation`, borrados al terminar.

1. **BD:**
   - `npm run db:deploy`, `npm run db:status` (up to date) y `npx prisma migrate diff --from-config-datasource --to-schema` (vacío).
   - Base vacía temporal `central_de_avisos_cpi_verify`: `db:deploy` con todas las migraciones y `test:db` sobre ella. Después, `dropdb`.
   - `npm run test:db` en la base del worktree y `npm run db:seed` dos veces (idempotente, sin usuarios de cliente).
2. **Gate:** `npm run lint`, `typecheck`, `npm test`, `build` y `env -u DATABASE_URL bash init.sh`, todos con exit 0.
3. **Smoke:** comprobar que el puerto 3106 está libre. `next start -p 3106`. Ejecutar `SMOKE_PORT=3106 bash scripts/validate-smoke.sh` con superadmin, administrador, oficina y técnico. Repetirlo con `SMOKE_CLIENTE_*` del usuario creado en el paso 4.
4. **Matriz HTTP** (`curl --max-time 10`), escenarios 1-3 y 6-9:
   - Dos clientes C1 y C2 de Empresa Demo y una empresa B creada por `psql` en la base del worktree.
   - md5 de `usuarios` e `invitaciones` idéntico en cada rechazo.
   - `psql` del usuario creado: `INACTIVO`, hash nulo, `cliente_id`, `contacto_id`, `roles {}`, invitación `CONTACTO_CLIENTE` de 7 días con hash de 64 caracteres y token crudo ausente.
5. **Navegador real** (obligatorio por `CONSTRAINTS.md`). Edge headless con `--remote-debugging-port=9234` y perfil en el directorio temporal, contra 3106:
   - Login de oficina desde el formulario y clic real en «Invitar al portal». POST con `Origin: http://localhost:3106`, 303 y enlace visible.
   - Cerrar sesión, abrir el enlace, enviar la activación con clic real. 303 a `/portal` con el cliente y sus sedes.
   - Abrir la sede de C2: 403 propio sin datos de C2.
   - `/panel` lleva a `/portal`.
   - «Generar nuevo enlace» deja el enlace anterior caducado.
   - Vista a 390 px sin scroll horizontal, controles ≥ 48 px, foco latón y orden de tabulación en `/portal`, en la invitación y en el detalle de cliente.
6. **Limpieza:** matar los árboles de `next start` y de Edge, y comprobar que 3106 y 9234 quedan sin LISTEN. Borrar los datos de prueba (B, C1, C2, usuarios de cliente, invitaciones y sesiones) dejando la base del worktree con el seed. Vaciar el directorio temporal.

No existe un harness E2E persistente (no hay Playwright). La cobertura persistente son `test:db`, `portal-guards.test.ts` y `validate-smoke.sh`. El navegador se usa como verificación manual registrada.

## Evidence To Capture

- Salidas de migración, status y diff; recuentos de `test:db` (base del worktree y base vacía), de `npm test` y del build con `/portal`, `/portal/sedes/[id]` y `/api/panel/clientes/portal`.
- `init.sh` sin `DATABASE_URL`. Resultado de `validate-smoke.sh` con los cinco perfiles.
- Matriz HTTP con códigos, `Location` y flags de cookie; consultas `psql` y md5.
- Resultados de Edge: `Origin`, 303, textos visibles, 403 sin datos de C2, 390 px y foco.
- Limpieza de procesos, puertos, datos y temporales.

## Notas de implementación

Ajustes menores descubiertos al implementar (no cambian el alcance):

- Migración `20261115100000_portal_cliente`.
- «Generar nuevo enlace» responde `?ok=nuevo-enlace` (la primera invitación,
  `?ok=invitado`).
- `CopyInvitationLink` se movió a `src/app/_components/copy-invitation-link.tsx`
  para que `/panel` no importe la UI del superadmin; el superadmin importa la
  misma pieza.
- `src/lib/portal/db-test-fixtures.ts` comparte el escenario A/B con C1/C2 entre
  los tests `*.db.test.ts`.
- El layout del portal pinta la cabecera sin datos de usuario a sesiones que no
  son de cliente (reciben el 403). El enlace del 403 del portal va a `/panel`,
  que lleva al usuario de cliente a `/portal` y al resto a su panel.
- El texto de invitación caducada de `/invitacion/<token>` pasa a ser genérico
  («Pide a quien te invitó un enlace nuevo»), válido para los dos tipos.
- La ficha de cliente busca los mensajes `?ok/?error` con `Object.hasOwn`
  (`messageFor`), para que `?error=__proto__` no rompa la página que toca esta
  feature.
- `portal-guards.test.ts` comprueba además que el layout no deniega y que no
  existe `src/app/api/portal`.

## Validator Checklist

- [ ] El usuario de cliente solo ve su cliente y sus sedes. Cualquier otra sede da 403 uniforme y sin datos. `/panel/*` y `/superadmin` le niegan el acceso.
- [ ] Toda consulta del portal usa `clienteFilter(clienteScope(session))`. El aislamiento C1/C2 y A/B está probado en `test:db`.
- [ ] La invitación es transaccional, el token solo se guarda hasheado, la cookie flash es de 60 s y los rechazos dejan la BD sin cambios. El enlace nuevo caduca el anterior.
- [ ] La aceptación sigue siendo atómica y de un solo uso para los dos tipos, y el destino es correcto según el tipo.
- [ ] Ni `/panel/usuarios` ni el superadmin muestran usuarios o invitaciones de cliente como si fueran de empresa.
- [ ] CHECK, FK y UNIQUE nuevos presentes y probados. Sin rol `CLIENTE`, sin avisos ni facturas, sin `/api/portal/*` y sin cambios de seed.
- [ ] Formularios probados en Edge real (puerto 3106, CDP 9234) y en la base `central_de_avisos_client_portal_invitation`. Nada vivo ni temporal al terminar.
- [ ] Documentación durable, `feature_list.json` y `PROGRESS.md` actualizados.
