# Feature Implementation Spec: Clientes con sedes y contactos

## Source Feature

- `id`: `client-records`
- `area`: `clients`
- `depends_on`: `role-based-permissions` (status `accepted`)
- `status` en planificación: `not_started`
- `source`: `feature_list.json`. Verificación fuente: crear un cliente con dos sedes y dos contactos, editarlo y listarlo; comprobar que la factura se asocia al cliente y no a la sede; leer un cliente de otra empresa y recibir 404 o 403.
- Tamaño: en el límite alto, pero es un único agregado (cliente → sedes, contactos) con un único flujo de oficina. No se recomienda dividirlo.

## Goal

Administrador y oficina (permiso `clientes.gestionar`) dan de alta clientes de su empresa con datos de facturación, una o varias sedes y uno o varios contactos. Pueden editarlos y verlos en un listado. El cliente es el sujeto fiscal: razón social, NIF y dirección de facturación están solo en el cliente, y la sede es solo el lugar de la intervención. Estas tablas son la base de `office-aviso-creation`, `client-portal-invitation` e `invoice-draft`.

## Non-Goals

- Borrar o desactivar clientes, sedes o contactos. Tampoco fusionar duplicados.
- Portal de cliente, rol `CLIENTE`, `cliente_id` en usuarios e invitaciones de contacto (`client-portal-invitation`).
- Avisos, facturas y la tabla `facturas`. La asociación factura → cliente se fija aquí solo como modelo y documentación.
- Búsqueda, filtros y paginación del listado. Importación CSV.
- Marcar un «contacto principal» de sede.
- Acceso del superadmin a clientes (`superadmin-tenant-view`). Auditoría de cambios (`audit-trail-view`).
- Cambiar el seed, la matriz de permisos, RLS o Playwright.

## Job Story

Cuando la oficina recibe a un cliente nuevo con varias naves y varias personas de contacto,
quiero registrar sus datos de facturación, sus sedes y sus contactos en un solo sitio,
para que los avisos y las facturas futuras usen siempre los datos correctos del cliente.

## Users And Permissions

- **Administrador y oficina** (`clientes.gestionar`): ven `/panel/clientes`, dan de alta y editan clientes, sedes y contactos de su empresa. La navegación muestra «Clientes».
- **Técnico, usuario sin roles y superadmin:** reciben 403 con la UI propia en las páginas y 403 en las APIs. No ven «Clientes».
- **Anónimo:** 307 a `/login?next=%2Fpanel%2Fclientes...` en las páginas y en los POST.
- Lo que llegue en la petición nunca sirve como autorización: `empresaId` sale de la sesión, y `clienteId`, `sedeId` y `contactoId` se resuelven siempre con `tenantFilter`.

## Acceptance Scenarios

1. **Alta.** Dada una sesión de oficina, cuando envía `/panel/clientes/nuevo` con razón social, NIF (`b12345678 ` se guarda como `B12345678`), dirección de facturación, tarifa opcional, la primera sede y el primer contacto, entonces se crean las tres filas en una transacción y se obtiene un 303 a `/panel/clientes/<id>?ok=creado`.
2. **Dos sedes y dos contactos.** En el detalle, añade una segunda sede y un segundo contacto vinculado a esa sede. El detalle muestra 2 sedes y 2 contactos, con la sede de cada contacto. El listado muestra el cliente con «2 sedes · 2 contactos».
3. **Edición.** Edita la razón social, la dirección de una sede y el teléfono de un contacto. Cada formulario responde 303 con `?ok=` y los cambios persisten al recargar.
4. **Validación.** Ninguno de estos casos cambia nada y cada uno muestra su mensaje (`role="alert"`):
   - NIF con formato inválido → `?error=nif`.
   - NIF repetido en la misma empresa → `?error=nif-duplicado`. El mismo NIF en otra empresa sí se permite.
   - Campos obligatorios vacíos o demasiado largos → `?error=campos`.
   - Email de contacto inválido → `?error=email`.
   - Teléfono inválido → `?error=telefono`.
   - Contacto sin teléfono ni email → `?error=contacto`.
   - Tarifa negativa o con más de 2 decimales → `?error=tarifa`.
   - Sede de otro cliente en el contacto → `?error=sede`.
5. **La factura va al cliente.** Los campos fiscales (razón social, NIF, dirección de facturación) solo existen en `clientes`. `sedes` no tiene NIF ni razón social, y el formulario de sede no los pide. `docs/domain-model.md` y `ARCHITECTURE.md` dejan escrito que la futura factura de trabajo tendrá un FK `cliente_id` y no `sede_id`. Un test de esquema comprueba las columnas de `sedes`.
6. **Aislamiento.** Con dos empresas A y B, un usuario de A que abre `/panel/clientes/<id de B>` recibe un 404 con la UI propia, sin datos de B. Pasa lo mismo con un id inexistente o que no es un UUID. Los POST de A con ids de B (cliente, sede o contacto) responden 303 `?error=no-encontrado` y B queda intacta. El listado de A nunca incluye clientes de B.
7. **Permisos.** El técnico y el superadmin reciben 403 en `/panel/clientes`, `/nuevo`, `/[id]` y en los cuatro POST. Un anónimo recibe 307 con `next`. `GET` a las APIs devuelve 405 `Allow: POST`. Un POST con `Origin` ajeno devuelve 403.
8. **Integridad en BD.** La base de datos rechaza cualquier sede o contacto con un `empresa_id` distinto del de su cliente, un NIF no normalizado, una tarifa negativa, un contacto sin teléfono ni email y un email de contacto no normalizado.
9. **Navegador real.** Los formularios de alta, sede y contacto se envían con clic real desde Edge. El POST lleva `Origin: http://localhost:3104` y el resultado es 303 con el mensaje visible.
10. **Gate sin BD.** `init.sh` pasa sin `DATABASE_URL`.

## Repository Research

### Files Inspected

- `AGENTS.md`, `PROGRESS.md`, `feature_list.json`: `role-based-permissions` está aceptada. `company-billing-settings` avanza en paralelo en otro worktree.
- `CONSTRAINTS.md`, `ARCHITECTURE.md`: `empresa_id` en toda tabla operable, `tenantFilter`/`assertTenantAccess`, guards por página, `forbidden()` solo bajo el boundary, formularios probados con navegador real y RLS a reevaluar «al añadir la primera tabla operativa».
- `docs/domain-model.md`, `docs/user-and-access-model.md`, `CONTEXT.md`, `docs/build-brief.md`: el cliente lleva razón social, NIF y dirección de facturación; la sede lleva dirección operativa; el contacto pertenece al cliente o a una sede; la factura va al cliente; existe una tarifa acordada por cliente que sustituye a la de empresa.
- `DESIGN.md`: oficina desktop-first, formularios a una columna en móvil y dos en escritorio, tablas con scroll horizontal controlado, objetivos de 48 px.
- `prisma/schema.prisma` y las migraciones `20261114015000_superadmin_invitations` (CHECK de NIF normalizado) y `20261114120000_roles_usuario`.
- `src/lib/authz/permissions.ts` (`clientes.gestionar` ya existe para ADMINISTRADOR y OFICINA), `navigation.ts`, `guards.ts`, `panel-guards.test.ts`.
- `src/lib/empresa/usuarios.ts`, `src/app/panel/usuarios/page.tsx` y `src/app/api/panel/usuarios/roles/route.ts`: el patrón que hay que copiar.
- `src/lib/superadmin/validation.ts` (`normalizeNif`, `isValidNif`, `isValidUserEmail`, `isUuid`, `parseImporteMensual`, `formString`), `db-errors.ts` (`isUniqueViolation`).
- `src/app/superadmin/(protected)/_components/ui.tsx` y `empresas/nueva/page.tsx`: clases de inputs y botones y estructura de formulario.
- `src/db/tenant.ts`, `scripts/validate-smoke.sh` (`expect_status`, roles opcionales).

### Existing Patterns To Follow

- Lógica en `src/lib/<área>/` con `db` explícito y funciones `...InTransaction` que se prueban con `inRollback`. Rutas en `src/app/`.
- Formularios HTML con `POST` a route handlers: `isSameOrigin` → `authorizeCompanyRequest` → `formData` → 303 con `?ok=`/`?error=`. `GET` responde 405. Ante un fallo inesperado, `?error=servicio`, sin registrar datos personales.
- Mensajes en la página con `role="status"`/`role="alert"`. Tarjetas en lugar de tablas a 390 px.

### Current Gaps

- No existen tablas de clientes, sedes ni contactos, ni entrada «Clientes» en la navegación.
- La UI compartida vive bajo `superadmin/(protected)/_components`, y `/panel` no debe importarla.
- No hay `not-found.tsx` en `/panel`. Hay que crear uno.
- No hay harness E2E persistente.

## Technical Approach

1. **Migración `prisma/migrations/<ts>_clientes_sedes_contactos/migration.sql`** (generada con `db:migrate --create-only` y completada a mano):
   - `clientes`: `id` uuid, `empresa_id` (FK `empresas` Restrict), `razon_social` text, `nif` text, `direccion_facturacion` text, `tarifa_horaria` decimal(12,2) NULL, `creado_en` y `actualizado_en`.
     - `UNIQUE (empresa_id, nif)` y `UNIQUE (id, empresa_id)`, este último como destino de los FK compuestos.
     - CHECK `clientes_nif_normalizado` (`nif = upper(btrim(nif))`) y CHECK `clientes_tarifa_no_negativa` (`tarifa_horaria IS NULL OR tarifa_horaria >= 0`).
   - `sedes`: `id`, `empresa_id`, `cliente_id`, `nombre`, `direccion`, timestamps.
     - FK compuesto `(cliente_id, empresa_id) → clientes(id, empresa_id)` Restrict.
     - `UNIQUE (id, cliente_id)` e índice por `cliente_id`.
   - `contactos`: `id`, `empresa_id`, `cliente_id`, `sede_id` NULL, `nombre`, `telefono` NULL, `email` NULL, timestamps.
     - FK compuesto `(cliente_id, empresa_id) → clientes(id, empresa_id)` Restrict y FK `sede_id → sedes(id)` Restrict.
     - CHECK `contactos_telefono_o_email` y CHECK `contactos_email_normalizado` (`email IS NULL OR email = lower(btrim(email))`).
     - Índices por `cliente_id` y `sede_id`.
   - Prisma:
     - modelos `Cliente`, `Sede` y `Contacto` con `@@map`/`@map`;
     - `@@unique([id, empresaId])` en `Cliente` y `@@unique([id, clienteId])` en `Sede`;
     - relación `cliente` por `[clienteId, empresaId]` con `onDelete: Restrict`;
     - `Empresa.clientes`.
   - **Limitación de Prisma:** una relación opcional no puede usar `clienteId`, que es obligatorio. Por eso `contactos.sede_id` es un FK simple, y la regla «la sede del contacto pertenece al mismo cliente» se aplica en la aplicación (punto 2) y se cubre con `test:db`. Si se añade un FK compuesto solo en SQL, `prisma migrate diff` lo marcará como deriva, así que no se añade.
   - Comprobar que `prisma migrate diff --from-config-datasource --to-schema` sale vacío.
2. **`src/lib/clientes/validation.ts` (puro).**
   - `parseClienteForm`, `parseSedeForm` y `parseContactoForm` devuelven `{ ok, value } | { ok:false, error }` con los códigos del escenario 4.
   - Reutiliza `normalizeNif`/`isValidNif`, `isValidUserEmail`/`normalizeUserEmail`, `parseImporteMensual` (tarifa) e `isUuid` de `src/lib/superadmin/validation.ts`, igual que ya hace `empresa/usuarios.ts`.
   - Límites: razón social ≤ 160; direcciones ≤ 240; nombre de sede y de contacto ≤ 120; teléfono `^\+?[0-9 ()-]{6,20}$` con al menos 6 dígitos (se guarda recortado); email ≤ 254.
   - Una cadena vacía se convierte en `null`.
3. **`src/lib/clientes/clientes.ts` (repositorio, siempre `tenantFilter(empresaId)`).**
   - Lectura:
     - `listClientes(db, empresaId)`: orden por razón social; devuelve id, razón social, NIF y `_count` de sedes y contactos.
     - `getClienteDetalle(db, empresaId, clienteId)`: devuelve `null` si el id no es un UUID o no es de la empresa; incluye sedes y contactos ordenados por nombre.
   - Escritura (cada función devuelve un resultado tipado):
     - `createClienteInTransaction`/`createCliente`: cliente + sede + contacto, con el contacto vinculado opcionalmente a esa primera sede.
     - `updateCliente`.
     - `upsertSede`: crea sin `sedeId` y edita con él; busca con `{ id, clienteId, ...tenantFilter }`.
     - `upsertContacto`: si llega `sedeId`, comprueba que la sede es `{ id, clienteId, ...tenantFilter }`; si no, `sede`.
   - Un `P2002` (`isUniqueViolation`) se traduce a `nif-duplicado`. Un cliente, sede o contacto ajeno o inexistente devuelve `no-encontrado`.
   - Las ediciones son «última escritura gana». No hay concurrencia crítica.
4. **Route handlers** (solo `POST` y `GET` → 405; `isSameOrigin`; `authorizeCompanyRequest(request, "clientes.gestionar", <next>)`):
   - `src/app/api/panel/clientes/route.ts`: alta. Responde 303 a `/panel/clientes/<id>?ok=creado` o a `/panel/clientes/nuevo?error=`.
   - `src/app/api/panel/clientes/datos/route.ts`: recibe `clienteId` y los datos fiscales → `?ok=datos`.
   - `src/app/api/panel/clientes/sedes/route.ts`: recibe `clienteId` y `sedeId?` → `?ok=sede-creada|sede`.
   - `src/app/api/panel/clientes/contactos/route.ts`: recibe `clienteId`, `contactoId?` y `sedeId?` → `?ok=contacto-creado|contacto`.
   - Los errores de un cliente válido vuelven a `/panel/clientes/<id>?error=`. Un `clienteId` ajeno o inválido vuelve a `/panel/clientes?error=no-encontrado`.
5. **Páginas** (todas `force-dynamic` con `requirePermission("clientes.gestionar", <ruta>)`):
   - `src/app/panel/clientes/page.tsx`: listado en tarjetas o en una tabla con scroll horizontal controlado. Incluye estado vacío y el botón «Nuevo cliente».
   - `src/app/panel/clientes/nuevo/page.tsx`: tres secciones (Datos de facturación, Primera sede, Primer contacto) con `required`, `maxLength`, `type="email"` e `inputMode="tel"`.
   - `src/app/panel/clientes/[id]/page.tsx`:
     - sección «Datos de facturación» con un formulario editable y una ayuda: «Las facturas se emiten a este cliente, no a la sede»;
     - sección «Sedes»: una tarjeta por sede con su formulario y el formulario «Añadir sede»;
     - sección «Contactos»: una tarjeta por contacto con un `select` de sede opcional («Todo el cliente» o una sede del cliente) y el formulario «Añadir contacto»;
     - `notFound()` si el detalle es `null`.
   - `src/app/panel/clientes/[id]/not-found.tsx`: 404 en español con enlace a `/panel/clientes` y sin ningún dato.
   - `src/app/panel/_components/ui.tsx`: clases de input, botón, tarjeta y avisos para `/panel`. Copia acotada; no se refactoriza `superadmin`.
6. **Navegación.** Añadir `{ href: "/panel/clientes", label: "Clientes", requiere: "clientes.gestionar" }` a `NAV_ITEMS` y actualizar `navigation.test.ts`. En `panel-guards.test.ts`, incluir las tres páginas nuevas en `arrayContaining`.
7. **Smoke.** Ampliar `scripts/validate-smoke.sh`:
   - anónimo: `GET /panel/clientes` 307, `GET /api/panel/clientes` 405, `POST` con Origin ajeno 403;
   - administrador y oficina: `/panel/clientes` 200;
   - técnico y superadmin: `/panel/clientes` 403 y `POST /api/panel/clientes` 403.
8. **Decisión sobre la tarifa.** `tarifa_horaria` del cliente es opcional y se incluye aquí porque el formulario del cliente vive en esta feature e `invoice-draft` necesita el fallback cliente → empresa. Solo se guarda: no se calcula nada con ella.

## Expected File Changes

- `prisma/schema.prisma` y `prisma/migrations/<ts>_clientes_sedes_contactos/migration.sql`: crear o modificar.
- `src/lib/clientes/validation.ts`, `validation.test.ts`, `clientes.ts` y `clientes.db.test.ts`: crear.
- `src/db/schema.db.test.ts` (CHECK, FK compuesto, `UNIQUE`, columnas de `sedes`) y `src/db/tenant-isolation.db.test.ts` (A/B en clientes, sedes y contactos): modificar.
- `src/lib/authz/navigation.ts`, `navigation.test.ts` y `panel-guards.test.ts`: modificar.
- `src/app/panel/_components/ui.tsx`, `src/app/panel/clientes/page.tsx`, `nuevo/page.tsx`, `[id]/page.tsx` y `[id]/not-found.tsx`: crear.
- `src/app/api/panel/clientes/route.ts`, `datos/route.ts`, `sedes/route.ts` y `contactos/route.ts`: crear.
- `scripts/validate-smoke.sh`: modificar.
- Documentación (ver abajo), `PROGRESS.md` y `feature_list.json`.

## Visual Design Impact

- UI involved: sí. Fuente: `DESIGN.md` y los tokens de `globals.css`. No hace falta un artefacto de diseño nuevo.
- Estados que hay que cubrir:
  - listado vacío y con datos;
  - alta;
  - detalle con 1 y con N sedes y contactos;
  - cada `?ok=` y `?error=`;
  - 404 propio y 403 propio (ya existente);
  - contacto «Todo el cliente» frente a contacto con sede.
- Formularios a una columna a 390 px y a dos en escritorio. Controles de al menos 48 px, foco de 2 px en latón, sin `text-accent` en el texto y sin menús de tres puntos. Sin scroll horizontal a 390 px, salvo dentro de una tabla con contenedor propio.

## Durable Documentation Impact

- `ARCHITECTURE.md`: actualizar. Añadir `src/lib/clientes/`, las tablas `clientes`/`sedes`/`contactos`, el FK compuesto con `empresa_id`, la limitación de `contactos.sede_id`, las rutas nuevas y que la factura futura referenciará `cliente_id`.
- `CONSTRAINTS.md`: actualizar.
  - MUST: toda tabla hija de un recurso de tenant lleva `empresa_id` y un FK compuesto `(padre_id, empresa_id)` cuando Prisma lo permite.
  - MUST: los ids recibidos en formularios se resuelven con `tenantFilter`, y un recurso ajeno se trata como inexistente (404 o `no-encontrado`, nunca un 403 que revele que existe).
  - Añadir los CHECK nuevos a la lista de CHECK mantenidos en SQL.
  - Registrar la reevaluación de RLS. Propuesta: sigue diferida porque no hay consultas cruzadas, pero hay que confirmarlo.
- `AGENTS.md` y `README.md`: actualizar las rutas `/panel/clientes` y quién puede usarlas.
- `docs/domain-model.md`: «Implementado» en Cliente, Sede y Contacto (campos, sede opcional del contacto, tarifa opcional y factura → `cliente_id`).
- `docs/user-and-access-model.md`: comportamiento implementado de `clientes.gestionar`.
- `docs/risks-and-open-questions.md`: sin borrado ni desactivación, sin auditoría, listado sin paginación y regla de la sede del contacto aplicada solo en la aplicación.
- `DESIGN.md`, `CONTEXT.md`: no hace falta.

## Implementation Tasks

- [ ] Migración y esquema. `db:deploy`, `db:status`, `migrate diff` vacío y tests de esquema.
- [ ] `validation.ts` con tests unitarios de tabla (NIF, teléfono, email, tarifa, vacíos y longitudes).
- [ ] `clientes.ts` con `test:db`: alta transaccional (rollback si falla el contacto), upserts, NIF duplicado por empresa, sede de otro cliente y aislamiento A/B.
- [ ] UI compartida del panel, las cuatro páginas y `not-found`. Navegación y tests de guards.
- [ ] Los cuatro route handlers.
- [ ] `validate-smoke.sh`.
- [ ] Verificación completa, documentación, `PROGRESS.md` y `feature_list.json`.

## Verification Plan

Entorno: worktree `client-records` con su propia base (la de `.env`; no tocar `central_de_avisos`). `next start` en el puerto **3104**, Edge headless con depuración remota en **9232** y todos los temporales (perfil de Edge, cookies, logs y scripts CDP) en `D:/desarrollo/CursoAIExpert/central-de-avisos-worktrees/.tmp-client-records`. Antes de arrancar, comprobar que 3104 y 9232 están libres. Usar `curl --max-time 10` en todo.

1. **BD:**
   - `npm run db:deploy`, `npm run db:status` («up to date») y `migrate diff` vacío. `npm run test:db` en verde.
   - Desde base vacía: crear `central_de_avisos_cr_verify`, ejecutar `db:deploy`, `db:status` y `test:db` con `DATABASE_URL` apuntando a ella, y hacer `DROP DATABASE` al terminar.
2. **Gate:** `npm run lint`, `npm run typecheck`, `npm test` y `npm run build` (el build lista las rutas nuevas). `init.sh` con Git Bash y `env -u DATABASE_URL`.
3. **Smoke:** `SMOKE_PORT=3104 bash scripts/validate-smoke.sh` con `SMOKE_*` de superadmin, administrador, oficina y técnico.
4. **Matriz HTTP** (curl, puerto 3104):
   - anónimo, superadmin, administrador, oficina, técnico y encargado contra `/panel/clientes`, `/nuevo`, `/[id]` y los cuatro POST, según los escenarios 6 y 7;
   - cada `?error=` del escenario 4, comprobando en BD que no cambió nada;
   - aislamiento con una segunda empresa creada por el superadmin (o en `test:db`): GET 404 y POST `no-encontrado`.
5. **Navegador real (obligatorio por `CONSTRAINTS.md`):** Edge headless por CDP en 9232 contra `next start -p 3104`.
   - a. Oficina inicia sesión desde el formulario y ve «Clientes».
   - b. Da de alta el cliente con clic real. El POST lleva `Origin: http://localhost:3104` y responde 303 a `/panel/clientes/<id>?ok=creado`.
   - c. Añade la segunda sede y el segundo contacto vinculado a ella, y edita los datos fiscales, una sede y un contacto. Comprobar cada mensaje y la BD con `psql`.
   - d. Provoca `nif-duplicado` y `contacto` y comprueba que la alerta se ve.
   - e. El listado muestra «2 sedes · 2 contactos».
   - f. El técnico no ve «Clientes» y recibe el 403 propio. Un id de otra empresa muestra el 404 propio.
   - g. A 390 px: sin scroll horizontal, controles de al menos 48 px y foco visible en el listado, el alta y el detalle.
6. **E2E persistente:** no existe un harness. Lo cubren los tests unitarios, `test:db`, `validate-smoke.sh` y el punto 5.
7. **Limpieza:**
   - matar los árboles de procesos de `next start` y de Edge, y comprobar que 3104 y 9232 quedan sin LISTEN;
   - vaciar `.tmp-client-records`;
   - borrar la base temporal y los clientes de prueba (o dejarlos documentados);
   - revocar las sesiones de prueba.

## Evidence To Capture

- Nombre de la migración, `db:status`, `migrate diff` y `psql` con las constraints nuevas.
- Recuento de tests de `npm test` y de `test:db` (en la base del worktree y en la vacía). Salida del gate y de `init.sh` sin BD.
- Salida de `validate-smoke.sh` y la matriz HTTP con los códigos reales.
- Del navegador: el Origin de cada POST, el 303, los mensajes, el `h1` del 403 y del 404, y las medidas a 390 px.
- Confirmación de la limpieza de procesos, puertos, temporales y bases.

## Open Questions

- ¿Incluir `tarifa_horaria` del cliente aquí? Se propone que sí, opcional. La alternativa es trasladarla a `invoice-draft`.
- ¿NIF obligatorio para particulares? Se propone que sí para el MVP, porque la factura completa lo exige. Hay que confirmarlo con la gestoría.
- ¿Hace falta un «contacto principal» de sede antes de `office-aviso-creation`? Se propone que no; el aviso elige el contacto.
- Conflictos de merge previsibles con `company-billing-settings` en `navigation.ts`, `validate-smoke.sh`, `ARCHITECTURE.md`, `CONSTRAINTS.md` y en el orden de las migraciones. Las migraciones tocan tablas distintas; hay que rebasar y volver a ejecutar `db:status` antes del merge.

## Decisiones de implementación

- Preguntas abiertas resueltas con las propuestas por defecto del planner:
  `tarifa_horaria` opcional incluida (solo se guarda), NIF obligatorio para
  todo cliente, sin «contacto principal» de sede y RLS diferida con la
  reevaluación registrada en `CONSTRAINTS.md` y `ARCHITECTURE.md`.
- Migración: `prisma/migrations/20261114190000_clientes_sedes_contactos` (creada como `20261114140733_...` y renombrada al rebasar sobre `main` para aplicarse después de `20261114180000_empresa_facturacion`; mismo contenido).
- El alta tiene una casilla «Vincular este contacto a la primera sede»
  (`contactoEnSede`); sin marcar, el primer contacto es de todo el cliente.
- Además de los códigos del escenario 4, el repositorio distingue
  `cliente-no-encontrado` (la ruta vuelve a `/panel/clientes?error=no-encontrado`)
  de `no-encontrado` (sede o contacto ajeno: vuelve al detalle con
  `?error=no-encontrado`). Una sede ajena elegida en un contacto devuelve
  `?error=sede`, igual que una inexistente, sin revelar nada.
- Si el formulario de datos, sede o contacto falla la validación, la ruta
  comprueba antes que el `clienteId` es de la empresa: un cliente ajeno nunca
  recibe un `?error=` en su URL de detalle.
- Además del pre-chequeo de NIF duplicado (para poder probarlo dentro de
  `inRollback`), un `P2002` por carrera se traduce también a `nif-duplicado`.

## Validator Checklist

- [ ] Todas las páginas usan `requirePermission("clientes.gestionar")` y todas las APIs, `authorizeCompanyRequest`. El técnico y el superadmin reciben 403 y el anónimo, 307.
- [ ] Toda consulta lleva `tenantFilter`. Un id ajeno da 404 o `no-encontrado` sin filtrar datos. El FK compuesto rechaza las mezclas de empresa.
- [ ] Los campos fiscales están solo en `clientes`. La sede no tiene NIF ni razón social, y está documentado que la factura va a `cliente_id`.
- [ ] El cliente con 2 sedes y 2 contactos se creó, se editó y se listó desde un navegador real en el puerto 3104, con el Origin correcto.
- [ ] La migración se aplica desde una base vacía y `migrate diff` sale vacío. Los CHECK están cubiertos por `test:db`.
- [ ] No se añadió borrado, portal, avisos, facturas, búsqueda, auditoría ni cambios de seed o de permisos.
- [ ] El gate e `init.sh` pasan sin BD. Documentación, `PROGRESS.md` y `feature_list.json` están actualizados. Sin procesos ni temporales residuales.
