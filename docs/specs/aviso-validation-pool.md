# Feature Implementation Spec: Validación de avisos y bolsa de pendientes

## Source Feature

- `id`: `aviso-validation-pool`
- `area`: `avisos`
- `depends_on`: `office-aviso-creation` (status `accepted`, en `main`)
- `status` en planificación: `not_started`
- `source`: `feature_list.json`. Verificación fuente: validar un aviso Nuevo y comprobar que pasa a Pendiente y aparece en la bolsa; cancelar un aviso con motivo y comprobar que sale de la bolsa; intentar validar un aviso incompleto y recibir un error claro.
- Tamaño: correcto. Una migración que amplía `avisos` (sin tabla nueva) y un flujo de oficina (validar, cancelar, ver la bolsa). Desbloquea `technician-inbox`.

## Goal

Administrador y oficina (permiso `avisos.validar`) revisan un aviso `NUEVO` desde su detalle y lo validan, con lo que pasa a `PENDIENTE` y entra en la bolsa de pendientes de su empresa, o lo cancelan con un motivo obligatorio (`NUEVO` o `PENDIENTE` → `CANCELADO`), con lo que sale de la bolsa. Si el aviso ya no tiene datos coherentes, la validación se rechaza con un mensaje claro. `/panel/avisos` gana vistas por estado, incluida «En bolsa», ordenada por prioridad y antigüedad. Las transiciones son atómicas, las hace solo el servidor y dejan quién y cuándo.

## Non-Goals

- Bandeja del técnico, que el técnico vea la bolsa y tomar avisos (`technician-inbox`, `technician-aviso-claim`). Asignar o reasignar (`office-aviso-assignment`).
- Cancelar avisos `ASIGNADO` o `EN_CURSO` (necesitan reglas de partes); deshacer una validación o una cancelación; volver a `NUEVO`.
- «Validar en el mismo acto» del alta (cambiar el formulario de `/panel/avisos/nuevo`). Ver Open Questions.
- Editar el aviso para completarlo. Para corregir un contacto incoherente se edita el contacto en la ficha del cliente, que ya existe.
- Registro de auditoría append-only (`audit-trail-view`), notificaciones, número correlativo, paginación y búsqueda.
- Cambios en `permissions.ts`, el portal, el seed (`db:seed` y `demo:seed`), RLS y Playwright.

## Job Story

Cuando entra un aviso nuevo,
quiero revisarlo y publicarlo en la bolsa, o cancelarlo dejando el motivo,
para que los técnicos solo vean trabajo válido y quede constancia de las decisiones.

## Users And Permissions

- **Administrador, oficina y sus combinaciones** (`avisos.validar`): ven las acciones en el detalle y usan `POST /api/panel/avisos/validar` y `POST /api/panel/avisos/cancelar`. La cancelación usa también `avisos.validar`: la matriz no tiene un permiso propio y la fila «Validar aviso y poner en bolsa» cubre esta decisión de oficina. `permissions.ts` no cambia.
- **Técnico, usuario sin roles, usuario de cliente y superadmin:** 403 en los dos POST (y en las páginas de avisos, como hoy). No ven las acciones.
- **Anónimo:** 307 a `/login?next=%2Fpanel%2Favisos` en los POST.
- `empresaId`, `validado_por_id` y `cancelado_por_id` salen de la sesión. El `avisoId` del formulario se resuelve con `tenantFilter`. `estado`, `empresaId` y cualquier campo de usuario enviados en el formulario se ignoran.

## Acceptance Scenarios

1. **Validar.** Dada una sesión de oficina y un aviso `NUEVO` coherente de su empresa, cuando pulsa «Validar y publicar en la bolsa» en `/panel/avisos/<id>`, entonces el aviso queda `PENDIENTE` con `validado_en` y `validado_por_id` = usuario de la sesión, 303 a `/panel/avisos/<id>?ok=validado`, se ve «Aviso validado y publicado en la bolsa.» (`role="status"`), el chip muestra «Pendiente» y el aviso aparece en `/panel/avisos?vista=bolsa`.
2. **Bolsa.** `/panel/avisos?vista=bolsa` lista solo avisos `PENDIENTE` de la empresa, ordenados por prioridad (Urgente, Alta, Normal) y después por antigüedad (el más antiguo primero). `?vista=por-validar` lista los `NUEVO` con el mismo orden; `?vista=cancelados`, los `CANCELADO` (el más reciente primero); sin `vista` o con un valor desconocido (`__proto__` incluido) se ve «Todos», como hoy. Las pestañas son enlaces con `aria-current="page"` en la activa y muestran el recuento. Cada vista vacía tiene su propio texto.
3. **Cancelar con motivo.** Dado un aviso `NUEVO` o `PENDIENTE`, cuando escribe el motivo, marca «Confirmo que este aviso no se ejecutará» y pulsa «Cancelar aviso», entonces queda `CANCELADO` con `motivo_cancelacion` (recortado), `cancelado_en` y `cancelado_por_id`, 303 a `?ok=cancelado` con «Aviso cancelado.», y el detalle muestra el motivo, quién y cuándo. Si estaba en la bolsa, ya no aparece en `?vista=bolsa` y sí en `?vista=cancelados`. Si estaba `PENDIENTE`, conserva `validado_en`/`validado_por_id`.
4. **Errores de cancelación.** Motivo vacío, de solo espacios o de más de 500 caracteres → `?error=motivo`; sin la casilla de confirmación → `?error=confirmacion`. Alerta (`role="alert"`), `aria-invalid` + `aria-describedby` en el campo y BD sin cambios. En el navegador, `required` y `maxLength=500` lo impiden antes.
5. **Validar un aviso incompleto.** Dado un aviso `NUEVO` cuyo contacto se ha vinculado después a otra sede (edición desde la ficha del cliente), entonces el detalle muestra un aviso warning «Para validar este aviso, revisa: el contacto ya no es de todo el cliente ni de la sede del aviso», con enlace a la ficha del cliente, y el botón sigue disponible. Al pulsarlo, el servidor responde 303 a `?error=incompleto` con la alerta «No se puede validar: el contacto … » y el aviso sigue `NUEVO`. Tras corregir el contacto, la validación funciona.
6. **Transición no permitida.** Validar un aviso que no está `NUEVO` (ya validado o cancelado), o cancelar uno que no está `NUEVO`/`PENDIENTE`, → `?error=estado` («El aviso ya no está en un estado que permita esta acción. Revisa su estado actual.») sin cambios. Dos validaciones o cancelaciones concurrentes reales del mismo aviso: una gana y la otra recibe `estado`; nunca se escriben dos veces.
7. **Aviso ajeno.** `avisoId` vacío, no UUID, inexistente o de otra empresa → 303 a `/panel/avisos?error=no-encontrado` con alerta en el listado, sin datos ni escritura.
8. **Detalle por estado.** `NUEVO`: botón de validar y formulario de cancelación. `PENDIENTE`: «Validado el … por …», «En la bolsa de pendientes» y formulario de cancelación. `CANCELADO`: motivo (con saltos de línea), cancelado por y cuándo; sin formularios. Otros estados: sin acciones.
9. **Permisos y transporte.** Técnico, superadmin y usuario de cliente: 403 en los dos POST. Anónimo: 307. `GET` de ambas rutas → 405 `Allow: POST`. `Origin` ajeno → 403. Ninguno escribe.
10. **Integridad en BD.** PostgreSQL rechaza: `CANCELADO` sin motivo/fecha/autor; datos de cancelación con otro estado; motivo vacío; `PENDIENTE` (y estados posteriores salvo `CANCELADO`) sin `validado_en`/`validado_por_id`; `NUEVO` con datos de validación; fecha de validación sin autor o al revés.
11. **Navegador real (obligatorio, `CONSTRAINTS.md`).** Validar, cancelar y el intento de validar un aviso incompleto se hacen con clic real desde Edge. Cada POST lleva `Origin: http://localhost:3108` y responde 303 con el mensaje visible.
12. **Gate sin BD.** `init.sh` pasa sin `DATABASE_URL`.

## Repository Research

### Files Inspected

- `AGENTS.md`, `PROGRESS.md` (Sessions 024-032), `feature_list.json`: dependencia aceptada; `technician-inbox` depende de esta feature.
- `CONTEXT.md` (bolsa = avisos validados y sin asignar), `docs/domain-model.md` (ciclo `Nuevo → Pendiente`, `Cancelado` con motivo), `docs/user-and-access-model.md` (fila «Validar aviso y poner en bolsa»: Administrador y Oficina), `docs/risks-and-open-questions.md`.
- `CONSTRAINTS.md`: transiciones solo en la feature que las define; `origen/estado` fijados por servidor; ids ajenos tratados como inexistentes; `Object.hasOwn`; CHECK listados en SQL; formularios con navegador real; guard por página y `forbidden()` bajo boundary.
- `DESIGN.md`: chips con icono y texto; «Acción destructiva: solo texto danger o botón con confirmación».
- `prisma/schema.prisma` (`Aviso`, `Usuario.avisosCreados`), `prisma/migrations/` (última `20261115120000_limites_login`; avisos en `20261115090000_avisos`).
- `src/lib/avisos/avisos.ts` y `validation.ts`; `src/app/api/panel/avisos/route.ts`; `src/app/panel/avisos/page.tsx`, `[id]/page.tsx`, `_components/chips.tsx`, `_components/mensajes.ts`; `src/lib/authz/permissions.ts`; `src/lib/clientes/clientes.ts` (la edición de contacto permite cambiar su sede); `prisma/seed/presentacion.ts` (actualiza avisos existentes sin tocar `estado`); `scripts/validate-smoke.sh` (`check_avisos_access`).

### Existing Patterns To Follow

- Repositorio en `src/lib/avisos/` con `db` explícito, `tenantFilter` y funciones `...InTransaction` probadas con `inRollback`; validación pura con `ParseResult`.
- Route handler: `GET` → 405; `isSameOrigin` → `authorizeCompanyRequest(request, permiso, next)` → `formData` → 303 con `?ok=`/`?error=`; excepción → `?error=servicio` sin datos personales. `methodNotAllowed`/`redirectTo` copiados en cada ruta (patrón de avisos).
- Escrituras condicionadas con `updateMany` y comprobación de `count` (patrón de aceptación de invitaciones) para concurrencia.

### Current Gaps

- `avisos` no tiene columnas de validación ni de cancelación, ni índice por estado.
- `EstadoChip` usa el mismo estilo e icono para todos los estados.
- Hallazgo previo: las fechas escritas por la app salen en psql desfasadas una hora respecto a `now()` (Session 013). No crear CHECK que comparen fechas escritas por la app con `creado_en` (default `now()` en BD).
- No hay harness E2E persistente.

## Technical Approach

1. **Migración `prisma/migrations/20261115130000_avisos_validacion/migration.sql`** (timestamp posterior a `20261115120000`; escrita o completada a mano):
   - columnas nullables en `avisos`: `validado_en timestamptz(3)`, `validado_por_id uuid`, `cancelado_en timestamptz(3)`, `cancelado_por_id uuid`, `motivo_cancelacion text`;
   - FK `avisos_validado_por_id_fkey` y `avisos_cancelado_por_id_fkey` → `usuarios(id)` Restrict;
   - CHECK `avisos_validacion_coherente`: `(validado_en IS NULL) = (validado_por_id IS NULL)` y `estado <> 'NUEVO' OR validado_en IS NULL` y `estado IN ('NUEVO','CANCELADO') OR validado_en IS NOT NULL`;
   - CHECK `avisos_cancelacion_coherente`: `(cancelado_en IS NULL) = (cancelado_por_id IS NULL)`, `(cancelado_en IS NULL) = (motivo_cancelacion IS NULL)` y `(estado = 'CANCELADO') = (cancelado_en IS NOT NULL)`;
   - CHECK `avisos_motivo_cancelacion_no_vacio`: `motivo_cancelacion IS NULL OR length(btrim(motivo_cancelacion)) > 0`;
   - índice `(empresa_id, estado)`; índices de `validado_por_id` y `cancelado_por_id` si Prisma los declara.
   - Las filas existentes son todas `NUEVO` sin datos nuevos: la migración se aplica sin backfill.
   - Prisma: campos `validadoEn`, `validadoPorId`, `canceladoEn`, `canceladoPorId`, `motivoCancelacion`; relaciones con nombre (`"AvisoCreadoPor"`, `"AvisoValidadoPor"`, `"AvisoCanceladoPor"`) y sus inversas en `Usuario` sin cambiar nombres físicos. `prisma migrate diff --from-config-datasource --to-schema` debe salir vacío.
2. **`src/lib/avisos/validation.ts` (puro, ampliar):** `parseAvisoIdForm`, `parseCancelacionForm(formData)` → `{ avisoId, motivo }` con códigos `motivo` (recortado, 1-500, `\r\n` → `\n`) y `confirmacion` (`confirmar === "si"`). `problemasParaValidar(aviso)` → lista de códigos; hoy solo `contacto-sede` (el `contacto.sedeId` no es nulo ni igual a `aviso.sedeId`). Pensada para ampliarse en `client-aviso-creation`. `VISTAS` (`todos`, `por-validar`, `bolsa`, `cancelados`) con `parseVista` vía `Object.hasOwn`/`Map`. `ESTADOS_CANCELABLES = ["NUEVO","PENDIENTE"]`.
3. **`src/lib/avisos/avisos.ts` (ampliar, siempre `tenantFilter`):**
   - `listAvisos(db, empresaId, vista)`: `por-validar` y `bolsa` ordenados por `prioridad desc` (orden de declaración del enum en PostgreSQL: `NORMAL < ALTA < URGENTE`; cubrir con `test:db`), `creadoEn asc` e `id`; `todos` y `cancelados` por `creadoEn desc`. `countAvisosPorVista(db, empresaId)` con `groupBy` por estado.
   - `listBolsa(db, empresaId)`: alias de la vista `bolsa`, exportado para que lo reutilice `technician-inbox`.
   - `getAvisoDetalle`: añade `contacto.sedeId`, datos de validación y cancelación y los nombres de quien validó o canceló.
   - `validarAvisoInTransaction(tx, empresaId, usuarioId, avisoId)` y `validarAviso(db, …)`: resuelve el aviso (`no-encontrado`), exige `NUEVO` (`estado`), calcula `problemasParaValidar` (`incompleto`) y escribe con `updateMany({ where: { id, ...filter, estado: "NUEVO" }, data: { estado: "PENDIENTE", validadoEn: new Date(), validadoPorId } })`; `count 0` → `estado`.
   - `cancelarAvisoInTransaction` / `cancelarAviso`: igual con `estado in ESTADOS_CANCELABLES` y `motivoCancelacion`, `canceladoEn`, `canceladoPorId`.
4. **Route handlers** `src/app/api/panel/avisos/validar/route.ts` y `cancelar/route.ts`: `GET` 405; `POST` con `isSameOrigin` y `authorizeCompanyRequest(request, "avisos.validar", "/panel/avisos")`. Éxito → `/panel/avisos/<id>?ok=validado|cancelado`. Error con aviso de la empresa → `/panel/avisos/<id>?error=<código>`. Aviso inválido o ajeno → `/panel/avisos?error=no-encontrado`. Excepción → `?error=servicio` en el detalle si el aviso es de la empresa; si no, en el listado.
5. **Páginas:**
   - `[id]/page.tsx`: lee `?ok=`/`?error=`; nueva sección «Validación y bolsa» según el escenario 8, visible solo si `can(session, "avisos.validar")`. El formulario de validación es un `POST` con `avisoId` oculto. Cancelación en una tarjeta aparte: `textarea` «Motivo de la cancelación» (`required`, `maxLength=500`, ayuda visible), casilla de confirmación `required` en etiqueta de 48 px y botón danger «Cancelar aviso». Problemas de validación en un aviso warning con icono y texto. Guard de la página sin cambios (`avisos.crear`).
   - `page.tsx`: pestañas de vista como `nav` con enlaces (`aria-current`, recuentos, 48 px, desplazamiento horizontal propio a 390 px si no caben) y `ErrorNotice` para `?error=no-encontrado`. Mismo diseño de tabla y tarjetas.
   - `_components/mensajes.ts`: códigos nuevos (`validado`, `cancelado`, `incompleto`, `estado`, `motivo`, `confirmacion`, `no-encontrado` del listado, `servicio`) con `Object.hasOwn`.
   - `_components/chips.tsx`: icono por estado (Nuevo, Pendiente, Cancelado al menos), texto siempre visible y contraste AA. Sin `text-accent` como texto.
6. **Smoke** (`scripts/validate-smoke.sh`, bloques nuevos): anónimo `POST` validar/cancelar 307 y `GET` 405; `Origin` ajeno 403; técnico, superadmin y cliente 403 en los dos POST; administrador y oficina con `avisoId=00000000-0000-4000-8000-000000000000` → 303 `Location` con `/panel/avisos?error=no-encontrado` (no escribe nada). `/panel/avisos?vista=bolsa` 200 para administrador y oficina.

## Expected File Changes

- `prisma/schema.prisma`, `prisma/migrations/20261115130000_avisos_validacion/migration.sql`: modificar / crear.
- `src/lib/avisos/validation.ts`, `validation.test.ts`, `avisos.ts`, `avisos.db.test.ts`: modificar.
- `src/db/schema.db.test.ts` (columnas, CHECK, FK, índice) y `src/db/tenant-isolation.db.test.ts` (A no valida, no cancela ni ve en la bolsa avisos de B): modificar.
- `src/app/api/panel/avisos/validar/route.ts`, `cancelar/route.ts`: crear.
- `src/app/panel/avisos/page.tsx`, `[id]/page.tsx`, `_components/chips.tsx`, `_components/mensajes.ts`, `mensajes.test.ts`: modificar (componentes nuevos en `_components/` si hace falta).
- `scripts/validate-smoke.sh`; `init.sh` solo si cambia el mensaje final.
- Documentación (abajo), `PROGRESS.md`, `feature_list.json`.

## Visual Design Impact

- UI: sí. Fuente: `DESIGN.md` y tokens de `globals.css`. No hace falta un artefacto nuevo.
- Estados: pestañas de vista (con y sin avisos); detalle `NUEVO` coherente, `NUEVO` incompleto (warning), `PENDIENTE`, `CANCELADO`; cada `?ok=`/`?error=`; alerta del listado `no-encontrado`.
- Validar = botón primario. Cancelar = botón danger con casilla de confirmación (sin JS ni diálogos). Controles ≥ 48 px, foco latón de 2 px, sin scroll horizontal a 390 px (salvo en la tabla y en la fila de pestañas), sin menús de tres puntos y sin estados indicados solo con color.

## Durable Documentation Impact

- `ARCHITECTURE.md`: actualizar. Las rutas `/api/panel/avisos/validar` y `/cancelar`, las vistas del listado, las transiciones en `src/lib/avisos/avisos.ts` con `updateMany` condicionado y `listBolsa` como punto de reutilización.
- `CONSTRAINTS.md`: actualizar. Añadir los tres CHECK nuevos a la lista. MUST: toda transición de estado del aviso se hace en el repositorio con `updateMany` condicionado al estado de origen y fija en servidor el autor y la fecha. MUST: la validación recalcula `problemasParaValidar` en servidor. MUST: la cancelación exige motivo. MUST NOT: añadir CHECK que comparen fechas escritas por la app con defaults `now()` de la BD (desfase conocido).
- `AGENTS.md` y `README.md`: vistas de `/panel/avisos`, acciones del detalle y rutas POST con su permiso.
- `docs/domain-model.md`: «Implementado» para Nuevo → Pendiente y Nuevo/Pendiente → Cancelado, campos nuevos y definición operativa de «incompleto».
- `docs/user-and-access-model.md`: cancelar usa `avisos.validar`.
- `docs/risks-and-open-questions.md`: validación y cancelación sin auditoría append-only; un contacto editado tras validar no invalida el aviso; `demo:seed` no devuelve a `NUEVO` los avisos validados o cancelados en la demo; `validado_por_id`/`cancelado_por_id` son FK simples (la empresa la garantiza la sesión).
- `DESIGN.md`, `CONTEXT.md`: no hace falta.

## Implementation Plan

1. Migración y esquema; `db:deploy`, `db:status`, `migrate diff` vacío; tests de esquema.
2. Validación pura y repositorio con `test:db` (incluida la concurrencia).
3. Route handlers.
4. Detalle, listado, chips y mensajes.
5. Smoke, verificación completa, documentación, `PROGRESS.md` y `feature_list.json`.

## Implementation Tasks

- [ ] Migración `20261115130000_avisos_validacion` + `schema.prisma` con relaciones con nombre; `schema.db.test.ts` (CHECK de los escenarios 10, FK, índice).
- [ ] `validation.ts` + tests de tabla (motivo vacío/espacios/500/501, `\r\n`, confirmación, vistas incluidas `__proto__`/`constructor`, `problemasParaValidar`).
- [ ] `avisos.ts` + `avisos.db.test.ts`: validar coherente; incompleto (contacto movido de sede con `src/lib/clientes/clientes.ts`); validar `PENDIENTE`/`CANCELADO` → `estado`; cancelar `NUEVO` y `PENDIENTE` (conserva validación); cancelar `CANCELADO` → `estado`; ids de B, inexistente y no UUID → `no-encontrado`; orden de la bolsa (Urgente antiguo, Urgente reciente, Alta, Normal); vistas y recuentos; dos `validarAviso` y dos `cancelarAviso` concurrentes reales con un solo ganador; campos del formulario ignorados.
- [ ] `tenant-isolation.db.test.ts` con A/B.
- [ ] Rutas `validar` y `cancelar`.
- [ ] Páginas, chips y mensajes; tests unitarios de mensajes.
- [ ] `validate-smoke.sh`.
- [ ] Documentación durable, `PROGRESS.md` y `feature_list.json`.

## Verification Plan

Entorno: worktree `aviso-validation-pool`, base propia `central_de_avisos_aviso_validation_pool` (la de su `.env`; no tocar `central_de_avisos` ni las bases de otros worktrees). `next start` en **3108**; Edge headless con `--remote-debugging-port=9238`; todos los temporales (perfil de Edge, cookies, logs, scripts CDP) en `D:/desarrollo/CursoAIExpert/central-de-avisos-worktrees/.tmp-aviso-validation-pool`. Comprobar antes que 3108 y 9238 están libres. Usar `curl --max-time 10` en todo y Git Bash para los scripts.

1. **BD:** `npm run db:deploy`, `db:status` («up to date», 11 migraciones), `migrate diff` vacío, `psql \d avisos`, `npm run test:db` verde. Desde base vacía: crear `central_de_avisos_avp_verify`, `db:deploy` + `db:status` + `test:db` con `DATABASE_URL` apuntando a ella y `DROP DATABASE` al terminar. Comprobar también que la migración se aplica sobre la base del worktree con avisos `NUEVO` existentes.
2. **Gate:** `npm run lint`, `typecheck`, `npm test`, `npm run build` (lista `/api/panel/avisos/validar` y `/cancelar`); `env -u DATABASE_URL bash init.sh`.
3. **Smoke:** `SMOKE_PORT=3108 bash scripts/validate-smoke.sh` con `SMOKE_*` de superadmin, administrador, oficina y técnico, y `SMOKE_CLIENTE_*` si hay un usuario de cliente activado.
4. **Matriz HTTP** (curl, 3108): escenarios 6, 7 y 9 por perfil (anónimo, superadmin, administrador, oficina, técnico, encargado y cliente si existe), con recuento y md5 de `avisos` sin cambios en cada rechazo; errores `motivo` (vacío, espacios, 501) y `confirmacion`; `estado=CANCELADO`, `validadoPorId` o `empresaId` ajenos en el cuerpo ignorados; aislamiento con una segunda empresa creada por psql (POST con aviso de B → `no-encontrado`, la bolsa sin datos de B).
5. **Navegador real (obligatorio):** Edge headless por CDP en 9238 contra `next start -p 3108`.
   - a. Oficina inicia sesión desde el formulario; crea por la UI (o por psql) un cliente con dos sedes y avisos `NUEVO` de prioridades distintas.
   - b. Valida un aviso con clic real: POST con `Origin: http://localhost:3108`, 303 a `?ok=validado`, mensaje visible, chip «Pendiente»; psql `PENDIENTE|validado_en|validado_por_id`. En la pestaña «En bolsa», el aviso aparece con el orden prioridad → antigüedad (comprobado con al menos tres avisos validados).
   - c. Cancela un aviso `PENDIENTE` con motivo con acentos y salto de línea: 303 `?ok=cancelado`, motivo visible e idéntico en psql, el aviso desaparece de «En bolsa» y aparece en «Cancelados». Cancela también uno `NUEVO`.
   - d. Envío de cancelación vacío o sin confirmar: bloqueado por el navegador (`valueMissing`, sin POST). Quitando `required` por DOM: `?error=motivo` y `?error=confirmacion` con `aria-invalid=true`; BD sin cambios.
   - e. Incompleto: edita desde la ficha del cliente el contacto de un aviso `NUEVO` para vincularlo a la otra sede; el detalle muestra el warning; el clic en validar devuelve `?error=incompleto` con alerta y psql sigue `NUEVO`. Corrige el contacto y la validación funciona.
   - f. Segunda pestaña con el mismo aviso ya validado: validar de nuevo → `?error=estado`.
   - g. El técnico no ve acciones y recibe el 403 propio en `/panel/avisos`; un aviso de otra empresa → 404 propio.
   - h. A 390 px: listado con pestañas y detalle en cada estado sin scroll horizontal (salvo la tabla y la fila de pestañas), controles ≥ 48 px, foco `solid 2px` latón y tabulación motivo → confirmación → Cancelar aviso.
6. **E2E persistente:** no existe harness; lo cubren los tests unitarios, `test:db`, `validate-smoke.sh` y el punto 5.
7. **Limpieza:** matar los árboles de `next start` y Edge, comprobar 3108 y 9238 sin LISTEN, vaciar `.tmp-aviso-validation-pool`, borrar la base temporal, la empresa B y los datos de prueba (o dejarlos documentados) y revocar las sesiones de prueba.

## Evidence To Capture

- Nombre de la migración, `db:status`, `migrate diff` y `psql \d avisos` con columnas, FK, CHECK e índice.
- Recuentos de `npm test` y `test:db` (base del worktree y base vacía); salida del gate y de `init.sh` sin BD.
- Salida de `validate-smoke.sh`; matriz HTTP con códigos reales y md5/recuentos.
- Navegador: `Origin` y 303 de cada POST, mensajes, `aria-invalid`, orden de la bolsa, filas de psql antes y después, medidas a 390 px.
- Limpieza de procesos, puertos, temporales y bases.

## Open Questions

- ¿Qué cuenta como «incompleto»? Hoy todos los campos del aviso son obligatorios en BD, así que se propone un único caso alcanzable: el contacto ya no es de todo el cliente ni de la sede del aviso. `problemasParaValidar` queda lista para reglas de `client-aviso-creation` (p. ej. un contacto opcional). Si el producto quiere más reglas (descripción mínima, teléfono obligatorio…), hay que decidirlas antes de implementar.
- ¿Cancelar con `avisos.validar` o con un permiso nuevo `avisos.cancelar`? Se propone reutilizar `avisos.validar` (mismos roles) y documentarlo.
- ¿Validar en el mismo acto del alta? Se propone dejarlo fuera: es un cambio del formulario de alta y se puede añadir después llamando a `validarAvisoInTransaction` en la misma transacción.
- ¿Cancelar `ASIGNADO`/`EN_CURSO`? Se deja para las features de asignación y partes.
- ¿Se pueden reabrir los cancelados? Se propone que no en el MVP.

## Implementation Findings

- Las preguntas abiertas se resolvieron con las propuestas por defecto de esta
  spec (incompleto = solo `contacto-sede`; cancelar con `avisos.validar`; sin
  validación en el alta; sin cancelar `ASIGNADO`/`EN_CURSO` ni reabrir).
- Comprobar la migración sobre datos existentes exige aplicar antes las 10
  migraciones previas: se hizo con `psql -f` + `prisma migrate resolve
  --applied` por migración, seed y dos avisos `NUEVO`, y después
  `npm run db:deploy` (aplica solo la nueva).
- psql 18 imprime un booleano concatenado con `||` como `true`/`false`, no
  `t`/`f`; los scripts de verificación deben esperarlo.

## Validator Checklist

- [ ] Los POST usan `authorizeCompanyRequest(request, "avisos.validar", …)` e `isSameOrigin`; técnico, superadmin y cliente 403, anónimo 307, GET 405.
- [ ] Toda consulta usa `tenantFilter`; un aviso ajeno da `no-encontrado` sin datos ni escritura.
- [ ] Las transiciones son `NUEVO → PENDIENTE` y `NUEVO|PENDIENTE → CANCELADO`, con `updateMany` condicionado, autor y fecha fijados en servidor, y la concurrencia probada con un solo ganador.
- [ ] Los CHECK nuevos están en SQL y cubiertos por `test:db`; la migración se aplica desde base vacía y `migrate diff` sale vacío.
- [ ] La bolsa solo contiene `PENDIENTE`, ordenados por prioridad y antigüedad; los cancelados salen de ella.
- [ ] Validar, cancelar y el error de aviso incompleto se probaron desde Edge real en 3108 con el `Origin` correcto y mensajes visibles; los errores llevan `aria-invalid`.
- [ ] Sin bandeja del técnico, toma, asignación, edición, alta con validación, auditoría ni cambios de permisos, portal o seed.
- [ ] Gate e `init.sh` sin BD en verde; documentación, `PROGRESS.md` y `feature_list.json` actualizados; sin procesos ni temporales residuales.
