# Feature Implementation Spec: Alta de aviso desde oficina

## Source Feature

- `id`: `office-aviso-creation`
- `area`: `avisos`
- `status` tras la implementación: `passing` (pendiente de validación independiente)
- `depends_on`: `client-records` (status `accepted`, ya en `main`)
- `status` en planificación: `not_started`
- `source`: `feature_list.json`. Verificación fuente: crear avisos con prioridad Normal, Alta y Urgente; comprobar que faltan campos obligatorios y se muestran errores; ver el aviso en el listado y en su detalle.
- Tamaño: correcto. Una tabla (`avisos`) y un flujo de oficina (alta, listado, detalle). Desbloquea `aviso-validation-pool` y, más adelante, `client-aviso-creation`.

## Goal

Administrador y oficina (permiso `avisos.crear`) registran un aviso de su empresa eligiendo cliente, sede y contacto, con la descripción de la avería y la prioridad (Normal, Alta o Urgente). El aviso nace en estado `NUEVO` con origen `OFICINA`, aparece en el listado `/panel/avisos` y tiene una página de detalle. La base de datos impide mezclar empresas, clientes, sedes y contactos.

## Non-Goals

- Validar, poner en bolsa, cancelar, asignar o tomar avisos, y cualquier transición de estado (`aviso-validation-pool`, `office-aviso-assignment`, `technician-aviso-claim`). El enum de estados se crea completo, pero aquí solo se escribe `NUEVO`. Tampoco se ofrece «validar en el mismo acto».
- Editar o borrar avisos. Cambiar cliente, sede o contacto después del alta.
- Alta desde el portal de cliente, rol `CLIENTE` y origen `CLIENTE` en uso (`client-aviso-creation`, `client-portal-invitation`).
- Bandeja del técnico, orden por prioridad y vista móvil del técnico (`technician-inbox`).
- Número correlativo de aviso por empresa, filtros, búsqueda y paginación del listado.
- Partes, facturas, auditoría (`audit-trail-view`), notificaciones y adjuntos.
- Cambios en `permissions.ts`, el seed, RLS, Playwright o las páginas de clientes.

## Job Story

Cuando un cliente llama a la oficina para comunicar una avería,
quiero registrar el aviso con su cliente, la sede afectada, la persona de contacto y la urgencia,
para que quede constancia en un listado y pueda validarse y asignarse después.

## Users And Permissions

- **Administrador y oficina** (`avisos.crear`, incluidas sus combinaciones con Técnico, p. ej. el encargado): ven «Avisos» en la navegación y usan `/panel/avisos`, `/panel/avisos/nuevo`, `/panel/avisos/[id]` y `POST /api/panel/avisos`.
- **Técnico, usuario sin roles y superadmin:** 403 con la UI propia en las páginas y 403 en la API. No ven «Avisos».
- **Anónimo:** 307 a `/login?next=...` en las páginas y en el POST.
- `empresaId` y `creado_por_id` salen de la sesión. `clienteId`, `sedeId` y `contactoId` del formulario se resuelven siempre con `tenantFilter`; `empresaId`, `estado`, `origen` o `creadoPorId` enviados en el formulario se ignoran.

## Acceptance Scenarios

1. **Alta Normal.** Dada una sesión de oficina y un cliente con dos sedes y dos contactos, cuando elige el cliente en `/panel/avisos/nuevo`, después una sede y un contacto, escribe la descripción y envía con la prioridad Normal (preseleccionada), entonces se crea una fila en `avisos` con `estado=NUEVO`, `origen=OFICINA`, `prioridad=NORMAL` y `creado_por_id` = usuario de la sesión, y se obtiene un 303 a `/panel/avisos/<id>?ok=creado` con el mensaje «Aviso creado.» (`role="status"`).
2. **Alta y Urgente.** Lo mismo con Alta y con Urgente. El detalle y el listado muestran el chip de prioridad con icono y texto (Normal neutro, Alta warning, Urgente danger), nunca solo color.
3. **Listado.** `/panel/avisos` muestra los avisos de la empresa del más reciente al más antiguo, con prioridad, estado «Nuevo», cliente, sede, inicio de la descripción y fecha de creación (Europe/Madrid), y un enlace al detalle. Sin avisos, muestra un estado vacío con el botón «Nuevo aviso».
4. **Detalle.** `/panel/avisos/<id>` muestra estado, prioridad, origen «Oficina», cliente (enlace a `/panel/clientes/<id>`), sede (nombre y dirección), contacto (nombre, teléfono y email), la descripción completa con sus saltos de línea, quién lo creó y cuándo.
5. **Campos obligatorios.** En el navegador, los campos `required` (cliente, sede, contacto, descripción, prioridad) impiden el envío vacío. Si llegan vacíos o inválidos al servidor, no se crea nada y vuelve a `/panel/avisos/nuevo?clienteId=<id>&error=<código>` con una alerta (`role="alert"`) y `aria-invalid` en el campo:
   - descripción vacía (o solo espacios) o de más de 2000 caracteres → `descripcion`;
   - prioridad ausente o distinta de `NORMAL|ALTA|URGENTE` → `prioridad`;
   - sede ausente, no UUID, de otro cliente o de otra empresa → `sede`;
   - contacto ausente, no UUID, de otro cliente, de otra empresa o vinculado a una sede distinta de la elegida → `contacto`.
6. **Cliente ajeno.** Un `clienteId` vacío, no UUID, inexistente o de otra empresa, en la página (`?clienteId=`) o en el POST, vuelve al paso 1 (`/panel/avisos/nuevo?error=no-encontrado`) sin mostrar datos de nadie. Un aviso de otra empresa, inexistente o con id no UUID en `/panel/avisos/<id>` da el 404 propio, sin datos.
7. **Permisos y transporte.** Técnico y superadmin: 403 en las tres páginas y en el POST. Anónimo: 307 con `next`. `GET /api/panel/avisos` → 405 `Allow: POST`. POST con `Origin` ajeno → 403. Ninguno crea filas.
8. **Integridad en BD.** PostgreSQL rechaza un aviso cuyo cliente sea de otra empresa, cuya sede no sea de ese cliente o cuyo contacto no sea de ese cliente (FK compuestos), una descripción vacía y valores fuera de los enums.
9. **Navegador real** (obligatorio, `CONSTRAINTS.md`). Los tres avisos del escenario 1-2 se crean con clic real desde Edge; cada POST lleva `Origin: http://localhost:3105` y responde 303 con el mensaje visible.
10. **Gate sin BD.** `init.sh` pasa sin `DATABASE_URL`.

## Repository Research

### Files Inspected

- `AGENTS.md`, `PROGRESS.md`, `feature_list.json`: `client-records` aceptada y en `main`; `aviso-validation-pool` depende solo de esta feature (Session 023). `client-portal-invitation` puede avanzar en paralelo en otro worktree.
- `CONTEXT.md`, `docs/domain-model.md`: el aviso lleva empresa, cliente, sede, contacto, descripción, prioridad Normal/Alta/Urgente, origen Oficina/Cliente y estado (`Nuevo → Pendiente → Asignado → En curso → Resuelto → Facturado`, `Cancelado`).
- `docs/user-and-access-model.md` y `src/lib/authz/permissions.ts`: `avisos.crear` ya existe para ADMINISTRADOR y OFICINA; no hay que tocar la matriz.
- `CONSTRAINTS.md`: `empresa_id` y FK compuesto en tablas hijas; ids ajenos tratados como inexistentes; guard por página; `forbidden()` bajo el boundary; formularios verificados con navegador real; lista de CHECK en SQL.
- `DESIGN.md`: oficina desktop-first, chip de prioridad (Normal neutro, Alta warning, Urgente danger) con icono y texto, errores inline y resumen, 48 px, foco latón.
- `prisma/schema.prisma`: `Cliente @@unique([id, empresaId])`, `Sede @@unique([id, clienteId])`; `Contacto` no tiene `@@unique([id, clienteId])`.
- `src/lib/clientes/clientes.ts`, `validation.ts`; `src/app/api/panel/clientes/route.ts` y `_shared/respond.ts`; `src/app/panel/clientes/nuevo/page.tsx` y `_components/mensajes.ts`; `src/app/panel/_components/ui.tsx`; `src/app/panel/empresa/page.tsx` (`aria-invalid`/`aria-describedby`); `src/lib/authz/navigation.ts`, `panel-guards.test.ts`; `src/db/tenant.ts`, `db-test-utils.ts` (`inRollback`); `scripts/validate-smoke.sh`.

### Existing Patterns To Follow

- Repositorio en `src/lib/<área>/` con `db` explícito, `tenantFilter` y funciones `...InTransaction` probadas con `inRollback`; validación pura en `validation.ts` con `ParseResult`.
- Route handler: `GET` → 405; `isSameOrigin` → `authorizeCompanyRequest(request, permiso, next)` → `formData` → 303 con `?ok=`/`?error=`; fallo inesperado → `?error=servicio` sin registrar datos personales.
- Páginas `force-dynamic` con `requirePermission(...)` en cada `page.tsx`; mensajes con `ErrorNotice`/`OkNotice`; `not-found.tsx` propio por segmento `[id]`.

### Current Gaps

- No existe la tabla `avisos`, ni sus enums, ni la entrada «Avisos» en la navegación.
- `contactos` necesita `UNIQUE (id, cliente_id)` para ser destino de un FK compuesto.
- Hallazgo previo (Low): buscar `?error=` en un objeto literal da 500 con `__proto__`. Las páginas nuevas deben usar `Object.hasOwn`.
- No hay harness E2E persistente.

## Technical Approach

1. **Migración `prisma/migrations/<ts>_avisos/migration.sql`** (`db:migrate --create-only`, completada a mano; timestamp posterior a `20261114190000`):
   - enums `prioridad_aviso` (`NORMAL`, `ALTA`, `URGENTE`), `origen_aviso` (`OFICINA`, `CLIENTE`) y `estado_aviso` (`NUEVO`, `PENDIENTE`, `ASIGNADO`, `EN_CURSO`, `RESUELTO`, `FACTURADO`, `CANCELADO`);
   - `CREATE UNIQUE INDEX contactos_id_cliente_id_key ON contactos (id, cliente_id)`;
   - tabla `avisos`: `id` uuid, `empresa_id`, `cliente_id`, `sede_id`, `contacto_id` (todos NOT NULL), `descripcion` text, `prioridad` (default `NORMAL`), `origen`, `estado` (default `NUEVO`), `creado_por_id` uuid NOT NULL, `creado_en`, `actualizado_en`;
   - FK compuestos Restrict: `(cliente_id, empresa_id) → clientes(id, empresa_id)`, `(sede_id, cliente_id) → sedes(id, cliente_id)`, `(contacto_id, cliente_id) → contactos(id, cliente_id)`; FK simple `empresa_id → empresas(id)` y `creado_por_id → usuarios(id)`, Restrict;
   - CHECK `avisos_descripcion_no_vacia` (`length(btrim(descripcion)) > 0`);
   - índices `(empresa_id, creado_en)`, `cliente_id`, `sede_id`, `contacto_id`.
   - Prisma: enums `PrioridadAviso`, `OrigenAviso`, `EstadoAviso`; modelo `Aviso` con relaciones `cliente` `[clienteId, empresaId]`, `sede` `[sedeId, clienteId]`, `contacto` `[contactoId, clienteId]` y `creadoPor`; `Contacto @@unique([id, clienteId])`; inversas en `Empresa`, `Cliente`, `Sede`, `Contacto` y `Usuario`. Todas las columnas que comparten relación son obligatorias, así que Prisma admite el solapamiento de `cliente_id`. Si Prisma lo rechazara, usar FK simples para sede y contacto, aplicar la regla en el repositorio, cubrirla con `test:db` y anotarlo en «Decisiones de implementación».
   - `prisma migrate diff --from-config-datasource --to-schema` debe salir vacío.
   - Que el contacto sea «de todo el cliente o de la sede elegida» no lo puede expresar un FK: lo aplica el repositorio.
2. **`src/lib/avisos/validation.ts` (puro).** `parseNuevoAvisoForm(formData)` → `ParseResult<{ clienteId, sedeId, contactoId, descripcion, prioridad }>` con los códigos `no-encontrado` (cliente), `sede`, `contacto`, `descripcion`, `prioridad`. Descripción recortada, 1-2000 caracteres (se conservan saltos de línea). Constantes `PRIORIDADES`, `PRIORIDAD_LABELS` y `ESTADO_LABELS` en español.
3. **`src/lib/avisos/avisos.ts` (repositorio, siempre `tenantFilter(empresaId)`):**
   - `listAvisos(db, empresaId)`: orden `creadoEn desc`; devuelve id, prioridad, estado, fecha, descripción y nombre de cliente y sede.
   - `getAvisoDetalle(db, empresaId, avisoId)`: `null` si no es UUID o no es de la empresa; incluye cliente, sede, contacto y nombre del creador.
   - `getClienteParaAviso(db, empresaId, clienteId)`: cliente con sus sedes y contactos (para el paso 2) o `null`.
   - `createAviso(db, empresaId, usuarioId, values)`: resuelve cliente (`no-encontrado`), sede `{ id, clienteId, ...filter }` (`sede`) y contacto `{ id, clienteId, ...filter }` con `sedeId` nulo o igual a la sede (`contacto`); inserta con `origen: OFICINA` y `estado: NUEVO` fijos. Se ejecuta en una transacción (`createAvisoInTransaction` para `inRollback`).
4. **Route handler `src/app/api/panel/avisos/route.ts`**: `GET` 405; `POST` con `isSameOrigin` y `authorizeCompanyRequest(request, "avisos.crear", "/panel/avisos/nuevo")`. Éxito → `/panel/avisos/<id>?ok=creado`. Error con cliente válido → `/panel/avisos/nuevo?clienteId=<id>&error=<código>`; cliente inválido o ajeno → `/panel/avisos/nuevo?error=no-encontrado`; excepción → `?error=servicio`. Reutilizar `methodNotAllowed`/`redirectTo` copiándolos a un `_shared` propio de avisos o moviéndolos solo si no rompe clientes (preferir copia acotada).
5. **Páginas** (todas `force-dynamic` con `requirePermission("avisos.crear", <ruta>)`):
   - `src/app/panel/avisos/page.tsx`: cabecera con «Nuevo aviso»; tabla en escritorio con scroll horizontal controlado y tarjetas a 390 px; estado vacío.
   - `src/app/panel/avisos/nuevo/page.tsx`, sin JavaScript de cliente:
     - paso 1 (sin `clienteId` válido): formulario `GET` a la misma página con un `select` de clientes de la empresa y el botón «Continuar». Sin clientes: aviso con enlace a `/panel/clientes/nuevo`.
     - paso 2 (`?clienteId=` válido): cliente elegido con enlace «Cambiar cliente»; formulario `POST` con `clienteId` oculto, `select` de sede (preseleccionada si solo hay una), `select` de contacto con etiquetas «Nombre · Todo el cliente» o «Nombre · Sede X» y ayuda «Elige un contacto de todo el cliente o de la sede elegida», `textarea` de descripción (`required`, `maxLength=2000`), grupo de radios de prioridad en un `fieldset` con `legend` (Normal marcada) y «Crear aviso».
     - errores: `ErrorNotice` arriba y `aria-invalid` + `aria-describedby` en el campo del código. Mensajes buscados con `Object.hasOwn`.
   - `src/app/panel/avisos/[id]/page.tsx` y `[id]/not-found.tsx` (404 en español, enlace a `/panel/avisos`, sin datos).
   - Componentes propios en `src/app/panel/avisos/_components/` (chip de prioridad y de estado con icono SVG `aria-hidden` y texto, mensajes). Fechas con `Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid" })`.
6. **Navegación**: `{ href: "/panel/avisos", label: "Avisos", requiere: "avisos.crear" }` justo después de «Inicio». Actualizar `navigation.test.ts` y añadir las tres páginas a `panel-guards.test.ts`.
7. **Smoke**: ampliar `scripts/validate-smoke.sh` con anónimo (`/panel/avisos` y `/nuevo` 307, `GET /api/panel/avisos` 405, POST Origin ajeno 403, POST anónimo 307), administrador y oficina 200, técnico y superadmin 403 en página y POST. Cambios en bloques nuevos para minimizar conflictos.

## Expected File Changes

- `prisma/schema.prisma`, `prisma/migrations/<ts>_avisos/migration.sql`: modificar / crear.
- `src/lib/avisos/validation.ts`, `validation.test.ts`, `avisos.ts`, `avisos.db.test.ts`: crear.
- `src/db/schema.db.test.ts` (enums, CHECK, FK compuestos, UNIQUE de contactos) y `src/db/tenant-isolation.db.test.ts` (A/B en avisos): modificar.
- `src/lib/authz/navigation.ts`, `navigation.test.ts`, `panel-guards.test.ts`: modificar.
- `src/app/panel/avisos/page.tsx`, `nuevo/page.tsx`, `[id]/page.tsx`, `[id]/not-found.tsx`, `_components/*`: crear.
- `src/app/api/panel/avisos/route.ts` (y `_shared/` si hace falta): crear.
- `scripts/validate-smoke.sh`, `init.sh` (solo el mensaje final con `/panel/avisos`): modificar.
- Documentación (abajo), `PROGRESS.md`, `feature_list.json`.

## Visual Design Impact

- UI involved: sí. Fuente: `DESIGN.md` y tokens de `globals.css`. Sin artefacto nuevo.
- Estados: listado vacío y con datos; paso 1 con y sin clientes; paso 2 con 1 y con N sedes; cada `?error=` con campo marcado; `?ok=creado`; detalle; 404 propio; 403 propio existente; chips de las tres prioridades y del estado «Nuevo».
- Una columna a 390 px y dos en escritorio donde tenga sentido; controles ≥ 48 px (radios dentro de etiquetas de 48 px); foco latón de 2 px; sin `text-accent` como texto; sin menús de tres puntos; sin scroll horizontal a 390 px salvo dentro del contenedor de la tabla.

## Durable Documentation Impact

- `ARCHITECTURE.md`: actualizar. `src/lib/avisos/`, tabla `avisos` con sus FK compuestos, rutas nuevas y que las transiciones de estado pertenecen a features posteriores.
- `CONSTRAINTS.md`: actualizar. Añadir `avisos_descripcion_no_vacia` a la lista de CHECK; MUST: un aviso referencia cliente, sede y contacto por FK compuesto con `cliente_id`/`empresa_id`, y el contacto es de todo el cliente o de la sede del aviso (regla en el repositorio); MUST: el alta fija `origen` y `estado` en servidor, nunca desde el formulario.
- `AGENTS.md` y `README.md`: rutas `/panel/avisos`, `/nuevo`, `/<id>` y quién las usa.
- `docs/domain-model.md`: «Implementado» en Aviso (campos, enums, `creado_por_id`, sin número correlativo).
- `docs/user-and-access-model.md`: comportamiento implementado de `avisos.crear`.
- `docs/risks-and-open-questions.md`: alta sin auditoría; sin número de aviso legible; la descripción se pierde si el servidor rechaza el envío; listado sin paginación; regla contacto/sede solo en la aplicación.
- `DESIGN.md`, `CONTEXT.md`: no hace falta.

## Implementation Tasks

- [ ] Migración y esquema; `db:deploy`, `db:status`, `migrate diff` vacío; tests de esquema.
- [ ] `validation.ts` con tests unitarios de tabla (prioridades, descripción vacía/espacios/2000/2001, ids no UUID).
- [ ] `avisos.ts` con `test:db`: alta en las tres prioridades, `origen`/`estado` fijos aunque el formulario los envíe, sede de otro cliente, contacto de otro cliente, contacto de otra sede, contacto de todo el cliente aceptado, ids de otra empresa, listado y detalle aislados A/B.
- [ ] Páginas, componentes, `not-found`, navegación y tests de guards.
- [ ] Route handler.
- [ ] `validate-smoke.sh` e `init.sh` (mensaje).
- [ ] Verificación completa, documentación, `PROGRESS.md` y `feature_list.json`.

## Verification Plan

Entorno: worktree `office-aviso-creation`, base propia `central_de_avisos_office_aviso_creation` (la de su `.env`; no tocar `central_de_avisos`). `next start` en **3105**, Edge headless con `--remote-debugging-port=9233`, y todos los temporales (perfil de Edge, cookies, logs, scripts CDP) en `D:/desarrollo/CursoAIExpert/central-de-avisos-worktrees/.tmp-office-aviso-creation`. Comprobar antes que 3105 y 9233 están libres. `curl --max-time 10` en todo.

1. **BD**: `npm run db:deploy`, `db:status` («up to date»), `migrate diff` vacío, `npm run test:db` verde. Desde base vacía: crear `central_de_avisos_oac_verify`, `db:deploy` + `db:status` + `test:db` con `DATABASE_URL` apuntando a ella y `DROP DATABASE` al terminar.
2. **Gate**: `npm run lint`, `typecheck`, `npm test`, `npm run build` (lista `/panel/avisos`, `/nuevo`, `/[id]` y `/api/panel/avisos`); `env -u DATABASE_URL bash init.sh` con Git Bash.
3. **Smoke**: `SMOKE_PORT=3105 bash scripts/validate-smoke.sh` con `SMOKE_*` de superadmin, administrador, oficina y técnico.
4. **Matriz HTTP** (curl, 3105): anónimo, superadmin, administrador, oficina, técnico y encargado contra las tres páginas y el POST (escenario 7); cada `?error=` del escenario 5 y el cliente ajeno del 6 con recuento/md5 de `avisos` sin cambios; `estado=PENDIENTE`, `origen=CLIENTE` y `empresaId` ajeno en el cuerpo ignorados; aislamiento con una segunda empresa creada por psql (detalle 404, POST `no-encontrado`/`sede`/`contacto`, listado sin datos de B).
5. **Navegador real (obligatorio)**: Edge headless por CDP en 9233 contra `next start -p 3105`.
   - a. Oficina inicia sesión desde el formulario y ve «Avisos» con `aria-current` en su página.
   - b. Paso 1 con clic real; paso 2 con un cliente de dos sedes y dos contactos (creado antes por la UI de clientes o por psql en la base del worktree).
   - c. Crea tres avisos (Normal, Alta, Urgente) con clic real: cada POST con `Origin: http://localhost:3105`, 303 a `/panel/avisos/<id>?ok=creado`, mensaje visible y fila en BD comprobada con `psql`.
   - d. Envío vacío bloqueado por el navegador (`validity.valueMissing`, sin POST). Quitando `required` por DOM: descripción en blanco → alerta `descripcion` con `aria-invalid=true`; contacto de otra sede → alerta `contacto`; BD sin cambios.
   - e. Listado con los tres avisos (más reciente primero, chips con texto) y detalle con todos los datos y saltos de línea.
   - f. Técnico sin «Avisos» y 403 propio en `/panel/avisos`; id de otra empresa → 404 propio.
   - g. A 390 px: listado, paso 1, paso 2 y detalle sin scroll horizontal fuera de la tabla, controles ≥ 48 px, foco `solid 2px` latón y tabulación sede → contacto → descripción → prioridad → Crear aviso.
6. **E2E persistente**: no existe harness; lo cubren tests unitarios, `test:db`, `validate-smoke.sh` y el punto 5.
7. **Limpieza**: matar los árboles de `next start` y Edge y comprobar 3105 y 9233 sin LISTEN; vaciar `.tmp-office-aviso-creation`; borrar la base temporal, la empresa B y los datos de prueba (o dejarlos documentados); revocar las sesiones de prueba.

## Evidence To Capture

- Nombre de la migración, `db:status`, `migrate diff` y `psql \d avisos` con FKs, CHECK e índices.
- Recuentos de `npm test` y `test:db` (base del worktree y vacía); salida del gate y de `init.sh` sin BD.
- Salida de `validate-smoke.sh` y matriz HTTP con códigos reales y md5/recuentos.
- Navegador: Origin y 303 de cada POST, mensajes, `aria-invalid`, `h1` del 403 y del 404, medidas a 390 px.
- Limpieza de procesos, puertos, temporales y bases.

## Open Questions

- ¿Contacto obligatorio? Se propone que sí (`contacto_id` NOT NULL): el dominio lo incluye y todo cliente se crea con al menos un contacto. `client-aviso-creation` podrá relajarlo con una migración si el portal lo necesita.
- ¿Restringir el contacto a «todo el cliente o la sede elegida»? Se propone que sí; la alternativa es aceptar cualquier contacto del cliente.
- ¿Número correlativo de aviso por empresa? Se propone dejarlo fuera; hoy se identifica por fecha, cliente y sede.
- Conflictos previsibles con la feature paralela (`client-portal-invitation`) en `schema.prisma`, orden de migraciones, `navigation.ts`, `validate-smoke.sh`, `init.sh` y documentación durable: rebasar sobre `main` y repetir `db:status`, `migrate diff` y `test:db` antes del merge.

## Decisiones de implementación

- Preguntas abiertas resueltas con las propuestas: contacto obligatorio
  (`contacto_id` NOT NULL), contacto restringido a «todo el cliente o la sede
  elegida» y sin número correlativo.
- Prisma aceptó los tres FK compuestos con `cliente_id` compartido; no hizo
  falta el plan B de FK simples. `prisma migrate diff` sale vacío.
- Migración `20261115090000_avisos` (escrita a mano siguiendo el formato de
  Prisma).
- La página `/panel/avisos/nuevo?clienteId=<vacío|no UUID|inexistente|ajeno>`
  redirige (307) a `/panel/avisos/nuevo?error=no-encontrado`.
- La ruta usa `findClienteIdParaAviso` (repositorio) para decidir si un error
  vuelve al paso 2 con `clienteId` o al paso 1: un error de campo con un
  cliente ajeno también responde `no-encontrado`, sin revelar nada.
- `methodNotAllowed`/`redirectTo` se copiaron dentro de
  `src/app/api/panel/avisos/route.ts` (una sola ruta; sin `_shared`).
- Chip «Alta»: borde, fondo e icono en warning y texto en color de texto,
  porque `#B4771B` no llega a 4.5:1 sobre blanco. «Urgente» usa texto danger.
- La descripción normaliza `\r\n` a `\n` antes de contar, para que el límite
  de 2000 coincida con el `maxLength` del navegador.
- Las etiquetas de `<option>` se generan como una sola cadena para que React
  no intercale comentarios en el texto.

## Validator Checklist

- [ ] Las tres páginas usan `requirePermission("avisos.crear")` y el POST `authorizeCompanyRequest`; técnico y superadmin 403, anónimo 307.
- [ ] Toda consulta usa `tenantFilter`; ids ajenos dan 404 o códigos de error sin revelar datos; los FK compuestos rechazan mezclas en BD.
- [ ] `origen=OFICINA`, `estado=NUEVO` y `creado_por_id` los fija el servidor.
- [ ] Avisos Normal, Alta y Urgente creados desde Edge real en 3105 con el Origin correcto, visibles en listado y detalle; errores visibles con `aria-invalid`.
- [ ] Migración aplicada desde base vacía, `migrate diff` vacío y CHECK/FK cubiertos por `test:db`.
- [ ] Sin transiciones de estado, edición, portal, numeración, auditoría ni cambios de seed o permisos.
- [ ] Gate e `init.sh` sin BD en verde; documentación, `PROGRESS.md` y `feature_list.json` actualizados; sin procesos ni temporales residuales.
