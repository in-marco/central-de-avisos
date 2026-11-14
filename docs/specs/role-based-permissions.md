# Feature Implementation Spec: Permisos por rol en servidor

## Source Feature

- `id`: `role-based-permissions`
- `area`: `auth`
- `title`: Permisos por rol en servidor
- `depends_on`: `company-admin-onboarding` (status `accepted` en `feature_list.json`)
- `status` en planificación: `not_started`
- `source`: `feature_list.json`. Verificación fuente: matriz de pruebas por rol sobre rutas y acciones clave; 403 en acciones no permitidas y navegación coherente; los roles combinables suman permisos.
- El implementador actualizará `feature_list.json` y `PROGRESS.md` con evidencia real.

## Goal

Los usuarios de empresa tienen roles persistidos y combinables (`ADMINISTRADOR`, `OFICINA`, `TECNICO`). Una matriz de permisos en código, derivada de `docs/user-and-access-model.md`, decide en servidor qué puede hacer cada usuario. Los permisos de varios roles se suman. Se crean los guards que usarán las features siguientes: uno para páginas (redirige al login o lanza `forbidden()`) y otro para route handlers (307 o 403). La navegación del panel se construye a partir de esos permisos y oculta lo que el usuario no puede usar.

Para que haya una ruta y una acción reales que proteger, el administrador gestiona los roles de los usuarios de su empresa en `/panel/usuarios`. El resto de áreas (clientes, avisos, partes, facturas) solo se declaran como permisos y se protegerán en sus propias features.

## Non-Goals

- Rol `CLIENTE` y portal de cliente: necesitan `cliente_id`, que no existe todavía. Los añadirá `client-portal-invitation` con su migración (`ALTER TYPE ... ADD VALUE`).
- Invitar o crear usuarios de oficina o técnicos desde la interfaz, desactivar usuarios (`user-deactivation`) o editar nombre y email.
- Páginas provisionales de clientes, avisos, partes, facturación o configuración de empresa.
- Cambiar la autorización de proveedor: `/superadmin` sigue con `requireSuperadmin` (`es_superadmin` y `empresa_id` nulo). El superadmin no recibe roles de empresa ni gestiona roles desde `/superadmin`.
- Registro de auditoría de los cambios de rol (`audit-trail-view`). Queda como riesgo documentado.
- RLS, middleware o proxy de autorización, Playwright.

## Job Story

Cuando dirijo una empresa de servicios con oficina y técnicos,
quiero que cada persona vea y haga solo lo que le corresponde según sus roles,
para que nadie pueda tocar configuración o datos que no le tocan, aunque conozca la URL.

## Users And Permissions

- **Administrador:** ve `/panel` y `/panel/usuarios`, y cambia los roles de cualquier usuario de su empresa. No puede quitarse a sí mismo `ADMINISTRADOR`.
- **Oficina y técnico:** ven `/panel` con sus roles. `/panel/usuarios` y su API les devuelven 403 y la navegación no muestra «Usuarios».
- **Roles combinados:** por ejemplo, `ADMINISTRADOR` + `TECNICO` tiene la unión de los permisos de ambos.
- **Usuario de empresa sin roles:** solo ve `/panel` con el aviso «Sin roles asignados». Por defecto se deniega todo.
- **Superadmin:** no tiene permisos de empresa. `/panel/usuarios` y la API le devuelven 403. Su navegación muestra «Panel de proveedor».
- **Anónimo:** las rutas privadas redirigen con 307 a `/login?next=...`.

### Matriz de permisos (`src/lib/authz/permissions.ts`)

| Permiso | ADMINISTRADOR | OFICINA | TECNICO |
| --- | --- | --- | --- |
| `panel.ver` | Sí | Sí | Sí |
| `empresa.configurar` | Sí | No | No |
| `usuarios.gestionar` | Sí | No | No |
| `usuarios.desactivar` | Sí | No | No |
| `clientes.gestionar` | Sí | Sí | No |
| `avisos.crear`, `avisos.validar`, `avisos.asignar` | Sí | Sí | No |
| `avisos.tomar` | No | No | Sí |
| `partes.editar_propios` | No | No | Sí |
| `partes.editar_cualquiera` | No | Sí | No |
| `partes.aprobar` | Sí | Sí | No |
| `facturas.ver`, `facturas.emitir` | Sí | Sí | No |
| `auditoria.ver` | Sí | Sí | No |

Esta tabla reproduce las columnas Administrador, Oficina y Técnico de `docs/user-and-access-model.md`. Si se encuentra una discrepancia, manda el documento de dominio y se corrige el código.

## Acceptance Scenarios

1. **Roles persistidos.** Una vez aplicada la migración, cada usuario de empresa existente tiene `roles = {ADMINISTRADOR}`, el superadmin tiene `{}` y la base de datos rechaza un superadmin con roles.
2. **Alta de empresa.** Cuando el superadmin da de alta una empresa, el administrador invitado se crea con `roles = {ADMINISTRADOR}`, dentro de la misma transacción.
3. **Matriz pura.** `can()` devuelve exactamente lo que dice la tabla para cada rol solo, para `ADMINISTRADOR+TECNICO`, `OFICINA+ADMINISTRADOR`, `OFICINA+TECNICO`, para `[]` y para el superadmin. La combinación es la unión de los permisos de sus roles.
4. **Página permitida.** Un administrador abre `/panel/usuarios` (200) y ve los usuarios de su empresa con sus roles. No aparecen usuarios de otras empresas ni el superadmin.
5. **Página denegada.** Oficina, técnico, usuario sin roles y superadmin reciben en `/panel/usuarios` un 403 real con la UI propia (`src/app/panel/forbidden.tsx`: «403 · No autorizado» y enlace a `/panel`), no la página por defecto en inglés. Un anónimo recibe 307 a `/login?next=%2Fpanel%2Fusuarios`.
6. **Acción permitida.** El administrador cambia los roles de un técnico a `TECNICO+OFICINA` con el formulario. El servidor responde 303 a `/panel/usuarios?ok=roles` y la base de datos lo refleja.
7. **Acción denegada.** `POST /api/panel/usuarios/roles` devuelve 403 a oficina, técnico y superadmin, y 307 a `/login?next=%2Fpanel%2Fusuarios` a un anónimo, sin cambiar nada. `GET` devuelve 405 y un `Origin` ajeno devuelve 403.
8. **Efecto inmediato.** Si un administrador da `ADMINISTRADOR` a un usuario de oficina, la siguiente petición de ese usuario, con la misma sesión, obtiene 200 en `/panel/usuarios` y ve «Usuarios» en la navegación. Si se le retira, vuelve a recibir 403. Los roles se leen de la base de datos en cada petición.
9. **Validaciones.** Se rechazan sin cambios: una lista de roles vacía (`?error=sin-roles`), un rol desconocido (`?error=rol-invalido`), quitarse el propio `ADMINISTRADOR` (`?error=propio-admin`) y un `usuarioId` de otra empresa o inexistente (`?error=no-encontrado`). Los duplicados se normalizan.
10. **Último administrador.** Si dos administradores se quitan `ADMINISTRADOR` el uno al otro a la vez, la empresa conserva al menos un administrador `ACTIVO`. La operación que lo dejaría a cero se revierte con `?error=ultimo-admin`.
11. **Navegación coherente.** La cabecera de `/panel` muestra «Inicio» a todos; «Usuarios», solo con `usuarios.gestionar`, y «Panel de proveedor», solo al superadmin. «Tu cuenta» muestra los roles en español: «Administrador · Técnico».
12. **Gate sin BD.** `init.sh` pasa sin PostgreSQL ni `DATABASE_URL`.

## Repository Research

### Files Inspected

- `AGENTS.md`, `PROGRESS.md`, `feature_list.json`: estado (`company-admin-onboarding` aceptada), higiene de validación y Definition of Done.
- `CONSTRAINTS.md`, `ARCHITECTURE.md`: tenancy por `tenantFilter`, `requireSession` en cada ruta y sin middleware. La autorización de proveedor queda separada de los roles «hasta `role-based-permissions`». Hay que verificar los formularios con un navegador real.
- `docs/user-and-access-model.md`, `docs/domain-model.md`: matriz de permisos, roles combinables y aislamiento.
- `prisma/schema.prisma`: `Usuario` sin roles. El CHECK `usuarios_superadmin_empresa_coherente` sigue vigente.
- `src/lib/auth/session.ts`, `current-session.ts`: `CurrentSession`, `getSessionByToken` (se consulta en cada petición) y `requireSession`.
- `src/lib/superadmin/authorization.ts`: patrón de guard para páginas (`forbidden()`) y para route handlers (307/403).
- `src/app/superadmin/forbidden.tsx` y el route group `(protected)`: el boundary 403 debe quedar por encima del segmento que lanza.
- `src/app/panel/layout.tsx`, `page.tsx`: cabecera sin navegación y sección de proveedor condicionada a `esSuperadmin`.
- `src/lib/superadmin/companies.ts`: creación del administrador invitado (línea 98).
- `src/db/tenant.ts`, `src/db/db-test-utils.ts`, `src/db/*.db.test.ts`, `src/lib/auth/auth.db.test.ts`: fixtures que crean usuarios.
- `prisma/seed.ts`, `.env.example`, `scripts/validate-smoke.sh`: seed idempotente y smoke con `SMOKE_*`.
- `DESIGN.md`: botones de 48 px, nada escondido en menús de tres puntos y el navy reservado para la navegación.

### Existing Patterns To Follow

- Lógica pura en `src/lib/`, rutas en `src/app/`. Mutaciones `POST` con formulario, `isSameOrigin`, 303 con `?error=`/`?ok=` y 405 en `GET`.
- La base de datos se recibe explícitamente (`AuthDb`), y las transacciones exportan `...InTransaction` para probarlas con `inRollback`.
- `forbidden()` con `experimental.authInterrupts` ya está activo en `next.config.ts`.

### Current Gaps

- No hay columna de roles ni matriz de permisos. Todos los usuarios de empresa son, de hecho, administradores.
- No existe `src/app/panel/forbidden.tsx` ni navegación en el panel.
- No existe ningún flujo para crear usuarios de oficina o técnicos, y ninguna feature de `feature_list.json` lo cubre. En esta feature los crea el seed (ver riesgos).

## Technical Approach

1. **Esquema y migración** (`prisma/migrations/<ts>_roles_usuario/migration.sql`):
   - `CREATE TYPE rol_usuario AS ENUM ('ADMINISTRADOR','OFICINA','TECNICO')`.
   - `ALTER TABLE usuarios ADD COLUMN roles rol_usuario[] NOT NULL DEFAULT '{}'`.
   - Backfill: `UPDATE usuarios SET roles = '{ADMINISTRADOR}' WHERE es_superadmin = false`.
   - CHECK `usuarios_superadmin_sin_roles` (`es_superadmin = false OR cardinality(roles) = 0`) y CHECK `usuarios_roles_sin_nulos` (`array_position(roles, NULL) IS NULL`).
   - Prisma: `enum RolUsuario { ... @@map("rol_usuario") }` y `roles RolUsuario[] @default([])`.
   - No se exige al menos un rol en la base de datos para no tocar todas las fixtures. Un usuario sin roles no tiene permisos; el mínimo de un rol se aplica en la aplicación.
2. **Sesión.** `AuthenticatedUser` y `CurrentSession` añaden `roles: RolUsuario[]`, cargados en `getSessionByToken` y en `authenticateCredentials`. Para el superadmin se fuerza `[]`.
3. **`src/lib/authz/permissions.ts` (puro).** Contiene `ROLES`, la unión `Permiso`, `ROLE_PERMISSIONS` según la tabla y estas funciones:
   - `permissionsFor(roles)`: unión de los permisos de los roles.
   - `can(session, permiso)`: `false` si la sesión es nula, si es superadmin o si no hay empresa.
   - `normalizeRoles(input)`: deduplica, valida contra el enum y ordena.
   - `ROLE_LABELS`: Administrador, Oficina, Técnico.
4. **`src/lib/authz/navigation.ts` (puro).** `NAV_ITEMS` con `{ href, label, permiso | "superadmin" | null }` y `visibleNavItems(session)`. Las features futuras añaden aquí sus entradas.
5. **`src/lib/authz/guards.ts` (servidor).**
   - `requirePermission(permiso, nextPath)`: `requireSession`, y `forbidden()` si `!can`.
   - `authorizeCompanyRequest(request, permiso, nextPath)`: sin sesión, 307 a `/login?next=`; sin permiso, 403 en texto; si todo va bien, `{ ok, session }`.
   - Ambos guards consultan la base de datos en cada petición mediante `getCurrentSession`. La interfaz nunca es la frontera de seguridad.
6. **`src/lib/empresa/usuarios.ts`.**
   - `listCompanyUsers(db, empresaId)` con `tenantFilter`, ordenado por nombre. Devuelve id, nombre, email, estado y roles.
   - `updateUserRolesInTransaction(tx, { empresaId, actorId, usuarioId, roles })`:
     - a. Valida con `normalizeRoles` y exige al menos un rol.
     - b. Bloquea la fila de la empresa con `SELECT id FROM empresas WHERE id = $1::uuid FOR UPDATE`.
     - c. Carga el usuario con `{ id, ...tenantFilter(empresaId), esSuperadmin: false }`. Si no existe, devuelve `no-encontrado`.
     - d. Si `actorId === usuarioId` y falta `ADMINISTRADOR`, devuelve `propio-admin`.
     - e. Hace el `update`.
     - f. Cuenta los administradores `ACTIVO` con `roles: { has: "ADMINISTRADOR" }`. Si quedan cero, lanza para revertir y devuelve `ultimo-admin`.
   - `updateUserRoles(db, ...)` envuelve todo en `db.$transaction`.
7. **Ruta `src/app/panel/usuarios/page.tsx`.**
   - `force-dynamic` y `requirePermission("usuarios.gestionar", "/panel/usuarios")`.
   - Por cada usuario, una tarjeta (sin tabla, para que funcione a 390 px) con un formulario `POST /api/panel/usuarios/roles` que contiene:
     - `usuarioId` oculto;
     - tres checkboxes `roles` dentro de etiquetas de 48 px;
     - el botón secundario «Guardar roles».
   - En la fila propia, el checkbox de Administrador va marcado y `disabled`, con un `input hidden roles=ADMINISTRADOR` y la ayuda «No puedes quitarte el rol de administrador».
   - Los mensajes de `?ok=`/`?error=` usan `role="status"` y `role="alert"`.
8. **`src/app/panel/forbidden.tsx`.** UI 403 equivalente a la de superadmin, con el texto «Tu rol no permite acceder a esta sección». Como el guard está en la página hija y no en `panel/layout.tsx`, el boundary la captura. Hay que comprobarlo en un navegador.
9. **Route handler `src/app/api/panel/usuarios/roles/route.ts`.**
   - Solo `POST`; `GET` devuelve 405 `Allow: POST`.
   - Comprueba `isSameOrigin`, aplica `authorizeCompanyRequest(request, "usuarios.gestionar", "/panel/usuarios")` y lee `formData.getAll("roles")`.
   - Responde 303 a `/panel/usuarios?ok=roles` o a `?error=<código>`.
   - Ante un fallo inesperado, `?error=servicio`. No registra ningún dato personal.
10. **Panel.**
    - `panel/layout.tsx` muestra un `<nav aria-label="Secciones">` con `visibleNavItems(session)`.
    - `panel/page.tsx` muestra los roles en «Tu cuenta» o «Sin roles asignados». La sección de proveedor se mantiene.
11. **Alta de empresa.** `companies.ts` crea el administrador con `roles: ["ADMINISTRADOR"]`.
12. **Seed.**
    - El admin demo queda con `roles: [ADMINISTRADOR]` y el superadmin con `roles: []`.
    - En «Empresa Demo» se añaden `oficina@demo.local` (OFICINA), `tecnico@demo.local` (TECNICO) y `encargado@demo.local` (ADMINISTRADOR+TECNICO), con contraseña `SEED_EQUIPO_PASSWORD` y emails opcionales `SEED_OFICINA_EMAIL`, `SEED_TECNICO_EMAIL` y `SEED_ENCARGADO_EMAIL`.
    - Las ejecuciones repetidas restauran los roles demo.
13. **Smoke.** `validate-smoke.sh` admite `SMOKE_OFICINA_EMAIL/PASSWORD` y `SMOKE_TECNICO_EMAIL/PASSWORD`, opcionales. Con ellos comprueba `/panel` 200, `/panel/usuarios` 403 y el POST de roles 403, y después hace logout. Añade además:
    - sin sesión: `GET /panel/usuarios` 307, `GET /api/panel/usuarios/roles` 405, POST con Origin ajeno 403;
    - con `SMOKE_NORMAL_*` (administrador): `/panel/usuarios` 200;
    - con `SMOKE_*` (superadmin): `/panel/usuarios` 403.

## Expected File Changes

- `prisma/schema.prisma`, `prisma/migrations/<ts>_roles_usuario/migration.sql`: crear o modificar.
- `src/lib/authz/permissions.ts`, `permissions.test.ts`, `navigation.ts`, `navigation.test.ts`, `guards.ts`: crear.
- `src/lib/empresa/usuarios.ts`, `usuarios.db.test.ts`: crear.
- `src/lib/auth/session.ts`: modificar (roles en la sesión). `auth.db.test.ts`: añadir una aserción de roles.
- `src/lib/superadmin/companies.ts` y `companies.db.test.ts`: modificar (rol del administrador invitado).
- `src/db/schema.db.test.ts`: tests de los CHECK nuevos y del default `{}`. `src/db/tenant-isolation.db.test.ts`: un administrador de A no edita ni lista usuarios de B.
- `src/app/panel/layout.tsx`, `page.tsx`: modificar. `src/app/panel/forbidden.tsx`, `src/app/panel/usuarios/page.tsx`, `src/app/api/panel/usuarios/roles/route.ts`: crear.
- `prisma/seed.ts`, `.env.example`, `scripts/validate-smoke.sh`: modificar.
- Documentación (ver abajo), `PROGRESS.md` y `feature_list.json`.

## Visual Design Impact

- UI involved: yes. Fuente: `DESIGN.md` y los tokens de `globals.css`.
- Pantallas:
  - navegación del panel (escritorio y 390 px, enlaces de 48 px en móvil, `aria-current="page"` en la activa);
  - `/panel/usuarios`: lista de tarjetas, éxito, cada error, fila propia bloqueada y estado `INACTIVO` visible;
  - 403 del panel;
  - «Tu cuenta» con los roles.
- Sin menús de tres puntos ni `text-accent` en texto. El foco de 2 px es latón.
- No hace falta un artefacto de diseño nuevo.

## Durable Documentation Impact

- `CONSTRAINTS.md`: actualizar.
  - MUST: toda página o route handler de empresa usa `requirePermission` o `authorizeCompanyRequest` con un `Permiso` de la matriz; ocultar en la interfaz nunca basta.
  - MUST: los roles se leen de la base de datos en cada petición.
  - MUST: la empresa conserva al menos un administrador activo y nadie se quita su propio `ADMINISTRADOR`.
  - MUST: el superadmin no tiene roles (CHECK).
  - MUST: nuevos `forbidden()` solo por debajo del boundary.
  - Reformular la regla de proveedor (`es_superadmin` sigue siendo la única regla de `/superadmin`).
- `ARCHITECTURE.md`: actualizar. Módulo `src/lib/authz/`, `src/lib/empresa/`, columna `roles` y su CHECK, navegación por permisos y `/panel/usuarios`.
- `AGENTS.md`, `README.md`: actualizar. Ruta `/panel/usuarios`, usuarios demo por rol, `SEED_EQUIPO_PASSWORD` y `SMOKE_OFICINA_*`/`SMOKE_TECNICO_*`.
- `docs/user-and-access-model.md`: actualizar «Comportamiento implementado». `docs/domain-model.md`: roles como atributo del usuario; `CLIENTE` diferido.
- `docs/risks-and-open-questions.md`: los cambios de rol no se auditan y no hay alta de usuarios de oficina o técnicos en el backlog.
- `DESIGN.md`, `CONTEXT.md`: no hace falta.

## Implementation Tasks

- [ ] Migración `roles_usuario` y esquema; `db:deploy` y `db:status`; tests de esquema.
- [ ] `permissions.ts` y `navigation.ts` con tests unitarios de tabla, incluidas las combinaciones.
- [ ] Roles en la sesión; `guards.ts`.
- [ ] `src/lib/empresa/usuarios.ts` con tests de integración: validaciones, aislamiento, propio admin y último admin concurrente con dos transacciones reales.
- [ ] Alta de empresa con `ADMINISTRADOR`.
- [ ] `panel/forbidden.tsx`, navegación, página `/panel/usuarios` y route handler.
- [ ] Seed y `.env.example`; `validate-smoke.sh`.
- [ ] Verificación completa, documentación, `PROGRESS.md` y `feature_list.json`.

## Verification Plan

Entorno de este worktree: `.env` apunta a `central_de_avisos_role_based_permissions`. No se toca `central_de_avisos`. `next start` usa el puerto **3101** (`SMOKE_PORT=3101`), comprobando antes que está libre.

1. **Base de datos:** `npm run db:deploy`, `npm run db:status` («up to date»), `npm run test:db` y `npm run db:seed` dos veces (idempotente: 1 plan, 1 empresa, 5 usuarios, roles correctos por `psql`). Migración desde vacía: crear `central_de_avisos_rbp_verify`, `db:deploy`, `db:status` y `test:db` con `DATABASE_URL` apuntando a ella, y después `DROP DATABASE`.
2. **Gate:** `npm run lint`, `npm run typecheck`, `npm test` y `npm run build`. `init.sh` con Git Bash y sin `DATABASE_URL` (`env -u DATABASE_URL`).
3. **Smoke:** `SMOKE_PORT=3101` y todas las variables `SMOKE_*` (superadmin, administrador, oficina y técnico) con `bash scripts/validate-smoke.sh`.
4. **Matriz HTTP** (curl `--max-time 10`, puerto 3101), por cada uno de anónimo, superadmin, administrador, oficina, técnico y encargado (ADMINISTRADOR+TECNICO):
   - `GET /panel`, `GET /panel/usuarios`, `GET /superadmin` y `POST /api/panel/usuarios/roles`;
   - se esperan 307/200/403 según los escenarios 4, 5 y 7.
   - Escenario 8: con la sesión de oficina abierta, el administrador le añade `ADMINISTRADOR` y luego se lo quita. Se observan 200 y 403 sin repetir el login.
   - Escenario 9: cada `?error=` por POST, y la base de datos sin cambios.
5. **Navegador real (obligatorio por `CONSTRAINTS.md`):** Edge headless por CDP contra `next start -p 3101`.
   - a. El administrador inicia sesión desde el formulario y ve «Usuarios» en la navegación.
   - b. Cambia los roles del técnico con clic real. El POST lleva `Origin: http://localhost:3101` y el servidor responde 303 a `?ok=roles`; el mensaje es visible y la base de datos refleja el cambio.
   - c. Envía la fila propia sin `ADMINISTRADOR` manipulando el DOM: aparece el error `propio-admin`.
   - d. Oficina: la navegación no muestra «Usuarios» y `/panel/usuarios` muestra la UI 403 propia (`h1` «403 · No autorizado») con estado 403.
   - e. A 390 px no hay scroll horizontal, los controles miden al menos 48 px y el foco es visible.
   - f. Restaurar los roles demo con `npm run db:seed`.
6. **E2E persistente:** no existe un harness (sin Playwright). Cubren el caso la matriz unitaria, `test:db`, `validate-smoke.sh` ampliado y la verificación en navegador del punto 5.
7. **Limpieza:** matar el árbol de procesos de Next y Edge, comprobar que 3101 queda libre y borrar cookies, logs, perfil y la base temporal. La base del worktree queda con los datos del seed.

## Evidence To Capture

- Nombre de la migración, `db:status` y `psql` con `roles` por usuario y los CHECK presentes.
- Número de tests de `npm test` y `test:db`. Salida del gate y de `init.sh` sin BD.
- Salida de `validate-smoke.sh` y tabla de la matriz HTTP con códigos reales.
- Del navegador: Origin del POST, 303, mensaje mostrado, `h1` del 403 y medidas a 390 px.
- Confirmación de la limpieza de procesos, puerto y bases.

## Implementation Findings

- **`next` del login perdido por el layout.** Con `requireSession("/panel")` en
  `src/app/panel/layout.tsx`, un anónimo en `/panel/usuarios` recibía 307 a
  `/login?next=%2Fpanel` (el redirect del layout gana al de la página),
  incumpliendo el escenario 5. Next documenta que un layout no controla si la
  página se renderiza, así que no es una frontera de seguridad. Cambio: el
  layout lee la sesión con `getCurrentSession` y, sin sesión, devuelve solo
  `children`; cada página llama a su guard y fija su propio `next`. Se añade
  `src/lib/authz/panel-guards.test.ts`, que falla si un `page.tsx` de `/panel`
  no llama a `requireSession` o `requirePermission`, y la regla queda en
  `CONSTRAINTS.md`.
- **Navegación activa:** el layout no conoce la ruta, así que la navegación es
  un componente de cliente (`src/app/panel/_components/panel-nav.tsx`) que
  recibe las entradas ya filtradas en servidor y marca `aria-current` con
  `usePathname`.
- **Columna `roles` NOT NULL:** Prisma genera las listas como nullable, pero
  `prisma migrate diff` tras la migración con `NOT NULL` devuelve una
  migración vacía, así que no hay deriva.
- **Último administrador:** solo es alcanzable en concurrencia (el actor es
  siempre un administrador activo). Se cubre con dos `updateUserRoles`
  simultáneos reales y con `updateUserRolesInTransaction` sobre una empresa
  cuyo otro administrador está `INACTIVO`.
- **Location de los route handlers:** `request.url` en `next start` usa
  `localhost` aunque la petición llegue a `127.0.0.1` (patrón previo del repo);
  la matriz compara solo la ruta.

## Validator Checklist

- [ ] La matriz de `permissions.ts` coincide con `docs/user-and-access-model.md`, y las combinaciones suman permisos.
- [ ] Toda ruta o acción nueva de empresa se autoriza en servidor. Ocultar en la interfaz no es la única defensa.
- [ ] Oficina, técnico y superadmin reciben 403 (página con UI propia y API). El anónimo recibe 307.
- [ ] Los roles se leen de la base de datos en cada petición. Un cambio surte efecto sin volver a iniciar sesión.
- [ ] Aislamiento: nunca se listan ni se editan usuarios de otra empresa.
- [ ] No se puede dejar a una empresa sin administrador activo, ni siquiera en concurrencia.
- [ ] El formulario se verificó en un navegador real en el puerto 3101.
- [ ] No hay rol `CLIENTE`, invitaciones de equipo, desactivación, auditoría ni páginas provisionales de otras áreas.
- [ ] El gate e `init.sh` pasan sin BD. La migración se aplica desde una base vacía. Documentación, `PROGRESS.md` y `feature_list.json` están actualizados.
