# Feature Implementation Spec: Alta de empresa y plan por el superadmin

## Source Feature

- `id`: `superadmin-company-plan`
- `area`: `tenancy`
- `title`: Alta de empresa y plan por el superadmin
- `depends_on`: `email-password-auth` (status `accepted` en `feature_list.json`)
- `status` en planificación: `not_started`
- `source`: `feature_list.json`; verificación fuente: crear empresa con plan, verla en el listado con invitación y recibir 403 con un rol que no sea superadmin.
- Esta spec no modifica código ni estados; el implementador actualizará `feature_list.json` y `PROGRESS.md` con evidencia real.

## Goal

Dar al superadmin (`usuarios.es_superadmin = true`, `empresa_id` nulo) una superficie privada para gestionar el catálogo global de planes y dar de alta empresas de servicios con datos fiscales, plan fijo mensual y estado. En la misma transacción se crea el usuario administrador invitado, sin contraseña y en estado `INACTIVO`, y una invitación con token hasheado, caducidad y estado derivado.

La aceptación de la invitación, el alta de contraseña y el primer login del administrador pertenecen a `company-admin-onboarding`; los roles combinables y permisos generales a `role-based-permissions`. Esta feature deja el registro de invitación listo y muestra el enlace en local desde una cookie temporal, sin enviar email real.

## Non-Goals

- Aceptar la invitación, definir contraseña, activar al administrador invitado o permitir su login (`company-admin-onboarding`).
- Crear roles, permisos por rol, menús por rol o sustituir `es_superadmin` por un sistema de roles (`role-based-permissions`).
- Facturación mensual de cuotas, importes con IVA, PDF, firma o periodos (`monthly-plan-invoice-batch`).
- Editar o borrar empresas, reasignarles plan, suspenderlas después del alta o borrar usuarios.
- Reenviar/regenerar/revocar invitaciones, limpiar caducadas o consultar auditoría avanzada (`audit-trail-view`).
- Envío real de email, proveedor SMTP, plantillas o colas; solo se muestra el enlace en pantalla.
- RLS, E2E con Playwright, CI/CD, despliegue, rediseño visual global o tablas de dominio posteriores.

## Job Story

Cuando el proveedor SaaS incorpora una nueva empresa de servicios,
quiero crear su plan si hace falta, dar de alta la empresa con sus datos fiscales e invitar a su administrador,
para que la empresa quede registrada y el administrador pueda activar su cuenta en el siguiente paso.

## Users And Permissions

- **Superadmin autenticado:** único actor con acceso a `/superadmin` y a las mutaciones `/api/superadmin/*`. Puede crear y editar planes, crear empresas y generar la invitación de su administrador.
- **Usuario de empresa autenticado:** no puede abrir `/superadmin` ni ejecutar sus mutaciones; recibe 403. No ve enlaces de superadmin en `/panel`.
- **Anónimo:** `/superadmin` redirige a `/login?next=...`; las mutaciones no se ejecutan. No se expone información de empresas ni planes.
- **Administrador invitado:** existe como `usuarios` con `empresa_id`, `password_hash` nulo y `estado INACTIVO`; no puede iniciar sesión todavía. La activación la hará `company-admin-onboarding`.
- **Regla de autorización:** se usa solo `es_superadmin` y `empresa_id` nulo, sin tabla de roles; el guard se ejecuta en servidor en layout, páginas y route handlers.

## Acceptance Scenarios

1. **Alta correcta:** dado un superadmin con sesión y un plan activo, cuando envía el formulario con nombre, NIF, dirección fiscal, email de facturación, plan, estado y datos del administrador, entonces se crean `empresas`, `usuarios` (invitado) e `invitaciones` en una transacción, recibe 303 al detalle y ve el enlace desde la cookie temporal.
2. **Listado:** dado un alta correcta, cuando el superadmin abre `/superadmin/empresas`, entonces ve la empresa con NIF, plan, importe mensual, estado, email del administrador y estado de la invitación.
3. **Plan nuevo:** dado un superadmin, cuando crea un plan con nombre e importe `49,90`, entonces se guarda `importe_mensual = 49.90`, aparece en el listado y queda seleccionable para nuevas empresas.
4. **Edición de plan:** dado un plan existente, cuando el superadmin cambia nombre, importe o `activo`, entonces el cambio persiste; no se borra ningún plan ni empresa asociada.
5. **Importe inválido:** dado un importe negativo, vacío, con más de dos decimales, no numérico o mayor que `9999999999.99`, cuando se envía, entonces se rechaza con error visible y no se crea ni actualiza el plan.
6. **Datos fiscales obligatorios:** dado un formulario sin nombre, NIF, dirección fiscal, email de facturación, plan activo o datos del administrador, cuando se envía, entonces se rechaza y no se crea ninguna fila.
7. **NIF o email duplicados:** dado un NIF ya usado o un email de administrador ya existente, cuando se intenta el alta, entonces se rechaza con error claro y la transacción no deja empresa, usuario ni invitación parciales.
8. **Plan no válido:** dado un plan inexistente o inactivo, cuando se intenta asignar en el alta, entonces se rechaza; solo se ofrecen planes activos.
9. **Invitación:** dado un alta correcta, cuando se inspecciona la invitación, entonces `token_hash` es SHA-256 del token crudo, el token crudo no está en base de datos ni en logs, `expira_en > creado_en` (7 días) y el estado derivado es `Pendiente` o `Caducada`.
10. **Enlace local:** dado un alta correcta, cuando se muestra el detalle, entonces el enlace `/invitacion/<token>` aparece en HTML (no en la URL ni en una redirección) desde una cookie temporal y deja de estar disponible al caducar la cookie.
11. **Autorización:** dado un usuario de empresa autenticado, cuando abre `/superadmin/empresas` o hace POST a `/api/superadmin/empresas`, entonces recibe 403 y no se modifica nada; dado un anónimo, recibe 307 al login.
12. **Gate sin BD:** dado un clon sin PostgreSQL ni `DATABASE_URL`, cuando ejecuto `npm run build` e `init.sh`, entonces lint, typecheck, tests unitarios y build pasan; no se conecta a la base ni se arranca servidor.

## Repository Research

### Files Inspected

- `AGENTS.md`, `PROGRESS.md`, `feature_list.json` — workflow, estado aceptado de `email-password-auth` y alcance exacto.
- `ARCHITECTURE.md`, `CONSTRAINTS.md` — capas, Prisma perezoso, tenancy, migraciones, superadmin como excepción y reglas MUST/MUST NOT.
- `docs/specs/email-password-auth.md`, `docs/specs/database-foundation.md` — formato, migraciones, tests y decisiones previas.
- `CONTEXT.md`, `docs/build-brief.md`, `docs/domain-model.md`, `docs/user-and-access-model.md` — empresa, plan fijo, datos fiscales, invitación, superadmin y caducidad.
- `docs/technical-discovery.md`, `docs/risks-and-open-questions.md`, `DESIGN.md` — email simulado, panel de superadmin, accesibilidad y riesgos.
- `prisma/schema.prisma`, las tres migraciones y `prisma/seed.ts` — modelos, CHECKs, mapping snake_case, FK `Restrict` e idempotencia.
- `src/lib/auth/session.ts`, `current-session.ts`, `session-token.ts`, `password.ts`, `origin.ts`, `redirect.ts` — sesión, `requireSession`, token opaco, same-origin y `safeNextPath`.
- `src/app/panel/*`, `src/app/login/page.tsx`, `src/app/api/auth/*` — layout protegido, formularios server-rendered, POST, 303, 403 y 405.
- `src/db/client.ts`, `tenant.ts`, `db-test-utils.ts`, `schema.db.test.ts` — cliente perezoso, contrato de tenant y patrón `inRollback`.
- `package.json`, `init.sh`, `.env.example`, `next.config.ts`, `src/app/globals.css` — scripts, gate, seed, configuración y tokens visuales.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/forbidden.md`, `.../05-config/01-next-config-js/authInterrupts.md`, `.../03-file-conventions/forbidden.md` — `forbidden()` experimental y flag `experimental.authInterrupts`.

### Existing Patterns To Follow

- App Router en `src/app/`; lógica testeable en `src/lib/`; datos en `src/db/`; `src/lib` no importa de `src/app`. Mutaciones por route handler `POST` con `application/x-www-form-urlencoded`, `isSameOrigin`, 303 y `GET` 405; sin middleware de autorización.
- `getDb()` perezoso y páginas privadas con `dynamic = "force-dynamic"` para que el build no abra conexiones.
- Migraciones SQL versionadas con `npm run db:migrate`/`db:deploy`; nunca `db push`; CHECKs que Prisma no modela en SQL.
- `npm test` unitario sin BD; `*.db.test.ts` con `npm run test:db` e `inRollback`.
- `init.sh` ejecuta `db:generate` + lint + typecheck + test + build; no arranca PostgreSQL, seed ni servidor.

### Current Gaps

- No existe rol ni permiso; solo `es_superadmin`. No hay superficie `/superadmin` ni navegación de proveedor.
- `empresas` no tiene dirección fiscal; el seed no la rellena.
- No existe modelo de invitaciones, token de invitación, caducidad ni estado.
- No hay formularios de alta ni tablas de listado; `/panel` solo muestra la cuenta.
- `schema.db.test.ts` espera exactamente cuatro tablas; añadir `invitaciones` obliga a actualizarlo.
- No hay email real, auditoría ni E2E; el enlace debe mostrarse en pantalla.

### Open Unknowns (marcar como unknown hasta verificar)

- **PostgreSQL real:** esta planificación no ejecutó migraciones ni `test:db`; el planner no tiene shell. La migración y los CHECK se confirman al implementar.
- **`forbidden()` con Next 16.4.6:** la documentación instalada lo marca experimental y exige `authInterrupts`; comprobar que devuelve 403 antes de streaming en este build y que el `forbidden.tsx` del segmento se renderiza.
- **Cookie flash:** confirmar en runtime que una cookie `HttpOnly` de 60 s con `Path=/superadmin/empresas` se lee en el detalle y no se cachea.
- **Importe máximo:** `Decimal(12,2)` admite hasta `9999999999.99`; confirmar el parseo sin coma flotante.
- **NIF:** no se implementa validación de dígito de control; solo estructura y normalización. Confirmar que no rechaza NIE/CIF válidos del demo.

## Technical Approach

1. **Superficie de superadmin.** Crear `src/app/superadmin/layout.tsx` con navegación sobria (“Empresas”, “Planes”, “Cerrar sesión”, enlace a `/panel`) y `requireSuperadmin()` en el layout. Rutas: `/superadmin` (resumen/enlaces), `/superadmin/empresas`, `/superadmin/empresas/nueva`, `/superadmin/empresas/[id]`, `/superadmin/planes` y `/superadmin/planes/[id]`. Todas `force-dynamic`.

2. **Autorización sin roles.** `src/lib/superadmin/authorization.ts` expone `isSuperadmin(session)` y `requireSuperadmin(nextPath)`; este llama a `requireSession(nextPath)` y, si `esSuperadmin` es falso, a `forbidden()` de `next/navigation`. Activar `experimental.authInterrupts: true` en `next.config.ts` y crear `src/app/superadmin/forbidden.tsx` con un 403 en español y enlace a `/panel`. Los route handlers usan el mismo guard; anónimo → 307 login, autenticado no superadmin → 403.

3. **Planes.** `/superadmin/planes` lista todos los planes (globales, sin `empresa_id`) y permite crear; `/superadmin/planes/[id]` edita `nombre`, `importeMensual` y `activo`. El nombre es obligatorio y único; no se borran planes. El importe se valida como texto decimal con `parseImporteMensual` (coma o punto, 0–2 decimales, máximo `9999999999.99`, sin negativos ni notación científica) y se guarda normalizado (`49.90`). Un plan inactivo sigue visible para empresas existentes pero no se ofrece en altas.

4. **Alta de empresa.** Añadir `empresas.direccion_fiscal` (nullable en BD para no inventar datos de la empresa demo; obligatoria en la validación de alta). Campos obligatorios: `nombre` (razón social), `nif`, `direccionFiscal`, `emailFacturacion`, `planId` activo y `estado` (`ACTIVA` por defecto o `SUSPENDIDA`), más nombre y email del administrador. Normalizar NIF a mayúsculas/trim y email a minúsculas/trim; validar estructura y longitudes; NIF y email únicos. Persistir NIF normalizado y añadir CHECK `empresas_nif_normalizado` (`nif = upper(btrim(nif))`); si hay NIF existentes no normalizados, normalizarlos antes de crear el CHECK.

5. **Invitación de administrador.** Nuevo modelo `Invitacion` (`invitaciones`) con `empresaId`, `usuarioId`, `tipo` (`TipoInvitacion.ADMINISTRADOR_EMPRESA`), `tokenHash` único, `creadaEn`, `expiraEn` y `aceptadaEn` nullable; FKs `empresa` `Restrict` y `usuario` `Cascade`; índices por empresa, usuario y expiración; CHECK `expira_en > creado_en` y `aceptada_en IS NULL OR aceptada_en >= creada_en`. El email no se duplica: es `usuarios.email`. La invitación caduca a 7 días (`INVITATION_DURATION_MS`). Estado derivado: `Aceptada` si `aceptadaEn != null`, `Caducada` si `expiraEn <= now`, si no `Pendiente`. `TipoInvitacion` solo registra el propósito; no concede permisos ni sustituye a roles.

6. **Usuario invitado.** En la misma transacción se crea `usuarios` con `empresaId`, email normalizado, nombre, `passwordHash = null`, `estado = INACTIVO`, `esSuperadmin = false`. El CHECK existente exige empresa para no superadmin y se cumple. El login ya rechaza usuarios sin hash o inactivos con error genérico. **Handoff:** `company-admin-onboarding` deberá, en una transacción, comprobar token no caducado/no aceptado, guardar `passwordHash`, poner `estado ACTIVO` y `aceptadaEn`.

7. **Token y enlace local.** Token opaco de 32 bytes `base64url`; en BD solo SHA-256. Extraer helpers genéricos (`createOpaqueToken`/`hashOpaqueToken`) reutilizados por `session-token.ts` o duplicar con nombre claro, sin cambiar el formato de sesión existente. Tras el alta, el route handler responde 303 al detalle y deja el token crudo en una cookie flash `central_invitacion` `HttpOnly`, `SameSite=Strict`, `Path=/superadmin/empresas`, `Max-Age=60`, `Secure` en HTTPS. El detalle lee la cookie con `cookies()`, muestra el enlace `/invitacion/<token>` y avisa de que no se enviará por email y no se podrá recuperar al caducar la cookie; no se guarda en URL, logs, base de datos ni email. La ruta `/invitacion/[token]` no se crea en esta feature.

8. **Mutaciones y errores.** Route handlers `/api/superadmin/planes` y `/api/superadmin/empresas`, solo `POST`; `GET` 405; `isSameOrigin`; formularios HTML server-rendered. Éxito: 303 al listado/detalle. Error de validación: 303 al formulario con `?error=<código>` y resumen accesible; los códigos se mapean en la página (`campos`, `nif`, `email`, `plan`, `importe`, `servicio`). No devolver JSON ni filtrar errores de base de datos. El alta se ejecuta en `db.$transaction` y cualquier fallo revierte empresa, usuario e invitación.

9. **Aislamiento y auditoría.** `planes` es global; `empresas`, `usuarios` e `invitaciones` son de tenant. Las consultas de superadmin sin `tenantFilter` se aíslan en `src/lib/superadmin/*` y siempre detrás de `requireSuperadmin`; no se añaden consultas sin filtro en otros módulos. No se crea tabla de auditoría en este slice: la traza avanzada queda en `audit-trail-view`; se actualiza `CONSTRAINTS.md` para registrar esta excepción y el riesgo. RLS sigue diferida y se reevalúa al aparecer la primera tabla operativa con consultas cruzadas, sin activarla aquí.

10. **UI y `/panel`.** Añadir en `/panel` un enlace “Abrir panel de proveedor” solo si `session.esSuperadmin`; no cambiar el destino por defecto del login (sigue `/panel`). Las pantallas de superadmin son desktop-first pero usables a 390 px: una columna en móvil, tablas con scroll horizontal controlado, inputs de 44–48 px, etiquetas persistentes, errores con texto y foco latón.

## Expected File Changes

- `prisma/schema.prisma` — modify; `Empresa.direccionFiscal`, modelo `Invitacion`, enum `TipoInvitacion`, relaciones e índices.
- `prisma/migrations/<timestamp>_superadmin_invitations/migration.sql` — create; columna, enum, tabla, FKs, índices y CHECKs.
- `prisma/seed.ts` — modify; dirección fiscal de la empresa demo y, si procede, plan demo ya existente.
- `src/lib/superadmin/authorization.ts` — create; `isSuperadmin`, `requireSuperadmin`.
- `src/lib/superadmin/plans.ts`, `companies.ts`, `invitations.ts`, `validation.ts` y sus `*.test.ts`/`*.db.test.ts` — create; validación, tokens, estados, consultas, transacción y tests.
- `src/app/superadmin/layout.tsx`, `page.tsx`, `forbidden.tsx`, `empresas/*`, `planes/*` — create; guard, navegación, 403, listado, formulario, detalle y edición de plan.
- `src/app/api/superadmin/empresas/route.ts`, `src/app/api/superadmin/planes/route.ts` — create; POST, 405, same-origin y guard.
- `src/app/panel/page.tsx` — modify; enlace a `/superadmin` solo para superadmin.
- `next.config.ts` — modify; `experimental.authInterrupts`.
- `src/db/schema.db.test.ts` — modify; quinta tabla, columnas, enum, FKs, índices y CHECKs.
- `init.sh` — modify solo mensajes finales; añadir `/superadmin` y mantener el gate sin servicios.
- `README.md`, `AGENTS.md`, `ARCHITECTURE.md`, `CONSTRAINTS.md`, `docs/domain-model.md`, `docs/user-and-access-model.md`, `docs/technical-discovery.md`, `docs/risks-and-open-questions.md` — update; ver documentación durable.
- `PROGRESS.md`, `feature_list.json` — modify al implementar; no en esta planificación.

## Visual Design Impact

- UI involved: yes.
- Design source: `DESIGN.md`; reutilizar tokens de `src/app/globals.css`; no se requiere nuevo artefacto visual.
- Screens or states affected: `/superadmin` (resumen), empresas (listado, alta, detalle, enlace de invitación, errores), planes (listado, alta, edición, errores) y `forbidden.tsx` (403).
- Directrices: cabecera sobria con marca y navegación; tablas operativas con cabecera clara; importes alineados a la derecha y cifras tabulares; chips de estado con texto (no solo color); formularios a una columna en móvil y dos en escritorio; botón primario navy; foco latón de 2 px; objetivos táctiles ≥48 px en móvil; nada de gradientes ni ilustraciones.
- El enlace de invitación se muestra en una tarjeta `surface` con texto monoespaciado, aviso de “copia el enlace ahora: no se enviará por email ni se podrá recuperar” y alternativa de copiar; no usar `text-accent` para texto pequeño (contraste insuficiente).

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — superficie `/superadmin`, guard `es_superadmin`, `forbidden()`, modelo de invitaciones, token hasheado, transacción de alta y handoff a onboarding.
- `CONSTRAINTS.md`: update — MUST las consultas de datos de tenant sin `tenantFilter` por motivo superadmin solo en `src/lib/superadmin/*` y detrás de `requireSuperadmin`; MUST token de invitación solo hasheado y nunca en URL/logs; MUST el alta de empresa + usuario invitado + invitación sea transaccional; MUST `es_superadmin` no se sustituye por roles en este slice; auditoría de acciones de superadmin queda pendiente y registrada.
- `AGENTS.md`: update — rutas `/superadmin`, flujo local de invitación, comandos de smoke y que el gate no cambia.
- `README.md`: update — alta de planes/empresas, enlace de invitación temporal no recuperable, 7 días de caducidad y límites (sin email/aceptación).
- `docs/domain-model.md`: update — empresa con dirección fiscal e invitación de administrador con estados/caducidad.
- `docs/user-and-access-model.md`: update — invitación creada por superadmin, usuario `INACTIVO` sin contraseña, 7 días y handoff a `company-admin-onboarding`; roles siguen fuera.
- `docs/technical-discovery.md`: update — `forbidden()`/`authInterrupts`, cookie flash y ausencia de email real.
- `docs/risks-and-open-questions.md`: update — enlace no recuperable, sin reenvío, cambio de importe sin histórico, sin auditoría y RLS diferida.
- `DESIGN.md`, `CONTEXT.md`: not needed — no cambia la dirección visual ni el lenguaje de dominio; la invitación es una entidad de implementación descrita en `domain-model.md`.
- `PROGRESS.md`, `feature_list.json`: update al implementar — obligatorio por la definición de terminado.

## Implementation Plan

1. Leer de nuevo las guías instaladas de Next 16 sobre `forbidden()`, `authInterrupts`, `cookies()` y `params`; confirmar el 403 antes de streaming.
2. Añadir al esquema `direccionFiscal`, `Invitacion` y `TipoInvitacion`; generar la migración y actualizar `schema.db.test.ts`.
3. Implementar helpers de token, validación de importes/NIF/email y estados de invitación con tests unitarios.
4. Implementar `authorization.ts` y el layout `/superadmin` con `forbidden.tsx`; activar `authInterrupts`.
5. Implementar planes (listado, alta, edición) y sus route handlers con same-origin, 405 y errores por código.
6. Implementar la transacción de alta de empresa + usuario invitado + invitación y el detalle con cookie flash.
7. Escribir tests de integración, ejecutar migraciones, `test:db`, gate, `init.sh` sin BD y smoke HTTP; actualizar documentación y evidencia.

## Implementation Tasks

- [x] Confirmar en el runtime las APIs de Next 16 usadas y registrar la decisión de `forbidden()`/`authInterrupts`.
- [x] Añadir `direccion_fiscal`, `invitaciones` y `TipoInvitacion` con migración versionada y CHECKs.
- [x] Actualizar `schema.db.test.ts` para la quinta tabla, columnas, enum, FKs, índices y CHECKs.
- [x] Crear helpers de token opaco/SHA-256 y validación de importe, NIF, email y campos; tests unitarios.
- [x] Implementar `isSuperadmin`/`requireSuperadmin` y las páginas `/superadmin` con 403.
- [x] Implementar planes y la transacción de alta de empresa, usuario `INACTIVO` e invitación.
- [x] Implementar detalle con enlace flash, listado de empresas y enlace desde `/panel`.
- [x] Escribir tests de integración de altas, duplicados, plan inactivo, token hasheado y rollback.
- [x] Ejecutar `db:deploy`, `db:status`, `test:db`, gate, `init.sh` sin BD y smoke HTTP con 403.
- [x] Actualizar documentación durable, `PROGRESS.md` y `feature_list.json` con evidencia real.

## Verification Plan

### Base de datos real

```bash
npm run db:deploy
npm run db:status
npm run test:db
npm run db:seed
```

Comprobar con `psql` que existe `empresas.direccion_fiscal`, la tabla `invitaciones`, el enum `tipo_invitacion`, el CHECK de expiración y que el seed sigue idempotente. Repetir `db:deploy` sobre una base vacía de verificación y borrarla al terminar.

### Gate estándar y `init.sh`

```bash
npm run lint
npm run typecheck
npm test
npm run build
& "C:\Program Files\Git\bin\bash.exe" init.sh
```

Resultado esperado: todo exit 0 sin `DATABASE_URL` ni PostgreSQL. `init.sh` ejecuta `db:generate` + gate, no arranca servicios ni ejecuta el seed; solo imprime comandos manuales y las rutas `/login`, `/panel`, `/superadmin` y `/health`.

### Smoke HTTP

Con PostgreSQL, migraciones y seed aplicados, arrancar `next start` o `npm run dev` y usar Git Bash:

```bash
curl -i http://localhost:3000/superadmin
curl -i -c cookies-super.txt -X POST -H "Origin: http://localhost:3000" \
  -d "email=superadmin@demo.local&password=<SEED_SUPERADMIN_PASSWORD>" \
  http://localhost:3000/api/auth/login
curl -i -b cookies-super.txt http://localhost:3000/superadmin/empresas
curl -i -b cookies-super.txt -X POST -H "Origin: http://localhost:3000" \
  -d "nombre=Empresa Norte&nif=B87654321&direccionFiscal=Calle Mayor 1&emailFacturacion=facturacion@norte.local&planId=<PLAN_ID>&estado=ACTIVA&adminNombre=Ana&adminEmail=ana@norte.local" \
  http://localhost:3000/api/superadmin/empresas
```

Esperado: anónimo 307 a `/login?next=%2Fsuperadmin...`; superadmin 200; alta 303 al detalle con `Set-Cookie` flash; el HTML del detalle contiene `/invitacion/<token>` y la URL no contiene el token. Repetir con `admin@demo.local`: `/superadmin/empresas` y el POST devuelven 403; un POST con `Origin` distinto también devuelve 403. Probar `planId` inactivo, NIF duplicado, email duplicado e importe `-1`/`49.999` y comprobar que no se crean filas. Comprobar con `psql` que solo se guarda `token_hash` y que el usuario invitado queda `INACTIVO` con `password_hash` nulo.

### E2E

No se añade Playwright: no existe harness y el flujo se cubre con tests unitarios/integración y HTTP real con cookie jar. El primer flujo con interacción de cliente (bandeja del técnico) introducirá Playwright; si se añade antes, no debe exigir BD en `init.sh`.

## Evidence To Capture

- Versión de Node/npm/Next/Prisma, nombre de la migración y salida de `db:status`.
- Salida de `test:db` con altas, duplicados, plan inactivo, token hasheado, rollback y estados de invitación.
- Salida de `db:seed` dos veces sin duplicar y con la dirección fiscal demo.
- Códigos 0 de lint, typecheck, test, build e `init.sh` sin BD; confirmación de que no arranca servicios.
- Salidas `curl` con 307 anónimo, 200 superadmin, 403 usuario normal, 303 de alta y enlace en HTML sin token en la URL.
- Consulta `psql` que demuestre `token_hash`, ausencia de token crudo, `expira_en`, `aceptada_en` nulo y usuario `INACTIVO`.
- Captura o descripción de `/superadmin/empresas` y formularios a 390 px y con teclado.
- Documentación durable actualizada y riesgos registrados (enlace irrecuperable, sin auditoría, RLS); `PROGRESS.md` y `feature_list.json` con evidencia o `blocked` con motivo.

## Validator Checklist

- [ ] `/superadmin` existe, usa `requireSuperadmin`/`forbidden()` y devuelve 403 a usuario de empresa; el anónimo va al login.
- [ ] No se introducen roles ni permisos por rol; la autorización usa solo `es_superadmin` y `empresa_id`.
- [ ] Planes: alta/edición con importe validado, sin borrado y con selección solo de planes activos.
- [ ] Empresa: datos fiscales obligatorios, NIF único normalizado, estado y plan persistidos; dirección fiscal coherente con la decisión nullable.
- [ ] Invitación: modelo, token hasheado, 7 días, estado derivado, email desde `usuarios`, usuario `INACTIVO` sin contraseña; enlace mostrado desde cookie temporal y no recuperable, sin email real ni token en URL, logs o base de datos.
- [ ] Alta atómica: NIF/email duplicados o plan inválido no dejan filas parciales.
- [ ] Aceptación de invitación, login del invitado, roles, facturación, borrado, auditoría y email real NO están implementados.
- [ ] No se usó `db push`; la migración se aplica desde base vacía y `schema.db.test.ts` está actualizado.
- [ ] `init.sh`, build y tests unitarios pasan sin PostgreSQL ni `DATABASE_URL`; `init.sh` no arranca servicios.
- [ ] Smoke HTTP verificado con superadmin, usuario normal (403), anónimo (307) y same-origin; `ARCHITECTURE.md`, `CONSTRAINTS.md`, `AGENTS.md`, `README.md`, dominio, acceso, discovery, riesgos, `PROGRESS.md` y `feature_list.json` actualizados.
- [ ] No se commitearon `.env`, cookies, tokens, contraseñas ni credenciales reales.

## Implementación: hallazgos verificados

- **`forbidden()` con Next 16.4.6:** funciona de forma fiable con
  `experimental.authInterrupts: true` siempre que el `throw` quede por debajo
  del boundary. El layout con `requireSuperadmin` vive en
  `src/app/superadmin/(protected)/layout.tsx`, junto con las páginas, y
  `src/app/superadmin/forbidden.tsx` queda por encima; lanzarlo desde el layout
  del mismo segmento que define el `forbidden.tsx` hacía que Next mostrara su
  página 403 por defecto en inglés. Verificado con navegador real (Edge
  headless/CDP): un usuario de empresa recibe 403 y ve `403 · No autorizado`,
  `Acceso restringido` y el enlace a `/panel`, no la página por defecto. Las
  URLs siguen siendo `/superadmin`, `/superadmin/empresas`, etc. Un anónimo
  recibe 307 a `/login?next=%2Fsuperadmin`.
- **`init.sh`:** corregida la codificación del mensaje de `/panel`; dice
  `sesión` en UTF-8 y no contiene ningún U+FFFD.
- **Migración:** `20261114015000_superadmin_invitations` añade
  `empresas.direccion_fiscal`, el enum `tipo_invitacion`, la tabla
  `invitaciones`, FKs (empresa `Restrict`, usuario `Cascade`), índice único por
  `token_hash`, índices por empresa/usuario/expiración y los CHECK
  `empresas_nif_normalizado`, `invitaciones_expiracion_posterior` y
  `invitaciones_aceptacion_posterior`.
- **Normalización de NIF:** la migración normaliza los NIF existentes antes de
  crear el CHECK. Los fixtures de integración previos se ajustaron para usar
  NIF ya normalizados.
- **Cookie flash:** verificada en HTTP real con `HttpOnly`, `SameSite=Strict`,
  `Path=/superadmin/empresas` y `Max-Age=60`. El detalle muestra
  `/invitacion/<token>` en HTML y el token no aparece en la URL.
- **Importe:** el parseo decimal usa `BigInt` sobre céntimos, sin coma
  flotante; acepta coma o punto y rechaza negativos, notación científica y más
  de dos decimales.
- **Token y estado:** `test:db` confirma SHA-256 de 64 caracteres, ausencia del
  token crudo, `expira_en - creado_en = 7 días`, `aceptada_en` nulo y estados
  Pendiente/Caducada/Aceptada.
