# Feature Implementation Spec: Activación del administrador invitado

## Source Feature

- `id`: `company-admin-onboarding`
- `area`: `tenancy`
- `title`: Activación del administrador invitado
- `depends_on`: `superadmin-company-plan` (status `accepted` en `feature_list.json`)
- `status` en planificación: `not_started`
- `source`: `feature_list.json`; verificación fuente: aceptar una invitación válida y completar el alta de contraseña, comprobar que el usuario entra en el contexto de su empresa y rechazar una invitación caducada o ya usada.
- El implementador actualizará `feature_list.json` y `PROGRESS.md` con evidencia real.

## Goal

El administrador invitado por el superadmin abre el enlace `/invitacion/<token>`, ve a qué empresa y con qué email se le invita, define su contraseña y entra directamente en `/panel` con una sesión de su empresa. La aceptación es de un solo uso y atómica: marca la invitación como aceptada, guarda el hash de la contraseña, activa al usuario y crea la sesión en la misma transacción.

Esta feature cierra el handoff que dejó `superadmin-company-plan`: la invitación con token hasheado y 7 días de caducidad, y el usuario `INACTIVO` sin `password_hash`.

## Non-Goals

- Roles combinables, permisos por rol o menús por rol (`role-based-permissions`). El invitado queda como usuario de empresa sin rol explícito.
- Reenviar, regenerar o revocar invitaciones, o limpiar las caducadas.
- Envío real de email.
- Recuperar o cambiar la contraseña después del alta.
- Invitar a otros usuarios de la empresa (oficina, técnicos o portal de cliente).
- Registrar la aceptación en una tabla de auditoría (`audit-trail-view`).
- Rate limiting durable.
- Cambios de esquema: el modelo `invitaciones` ya tiene `aceptada_en` y sus CHECK.
- Playwright o E2E de navegador.

## Job Story

Cuando el proveedor me ha dado de alta como administrador de mi empresa,
quiero abrir el enlace de invitación y elegir mi contraseña,
para entrar en el panel de mi empresa sin pedir credenciales a nadie.

## Users And Permissions

- **Portador del enlace (anónimo):** quien tiene el token crudo puede ver la página de invitación y aceptarla. El token de 256 bits es la única credencial. No hace falta sesión previa.
- **Administrador invitado:** al aceptar pasa a `ACTIVO` con `password_hash` y obtiene una sesión normal de 12 h. Desde ese momento entra con email y contraseña por `/login`, sin tratamiento especial.
- **Usuario con sesión abierta en el mismo navegador** (por ejemplo, el superadmin probando el enlace): la página de invitación se muestra igual. Al aceptar, la sesión anterior del navegador se revoca y se sustituye por la del invitado.
- **Superadmin:** no gestiona la aceptación. Solo ve el resultado: invitación `Aceptada` y administrador `ACTIVO` en `/superadmin/empresas` y en el detalle.

## Acceptance Scenarios

1. **Página de invitación válida.** Dado un token de una invitación pendiente de una empresa `ACTIVA`, cuando se abre `/invitacion/<token>`, entonces responde 200 y muestra el nombre de la empresa, el nombre y el email del invitado (solo lectura), la caducidad y un formulario con contraseña y confirmación.
2. **Aceptación correcta.** Dado un formulario con contraseña válida y confirmación igual, cuando se envía, entonces en una transacción se fija `invitaciones.aceptada_en`, se guarda `usuarios.password_hash` (scrypt versionado), se pone `usuarios.estado = ACTIVO` y se crea una sesión. La respuesta es 303 a `/panel` con la cookie `central_sesion`.
3. **Contexto de empresa.** Tras aceptar, `/panel` muestra el nombre del invitado, su email y el nombre de su empresa (no «Proveedor SaaS»). `/superadmin` le devuelve 403.
4. **Login posterior.** Tras cerrar sesión, el invitado entra por `/login` con su email y la nueva contraseña.
5. **Invitación ya usada.** Dado un token ya aceptado, cuando se abre la página o se reenvía el formulario, entonces se muestra «Esta invitación ya se ha utilizado» con un enlace a `/login`. No se modifica la contraseña ni se crea sesión.
6. **Invitación caducada.** Dado un token con `expira_en <= ahora`, cuando se abre o se envía, entonces se muestra «Esta invitación ha caducado; pide al proveedor una nueva». No se activa al usuario ni se crea sesión.
7. **Token desconocido o mal formado.** Dado un token inexistente o con formato inválido, se muestra «Enlace de invitación no válido» sin revelar si existe alguna invitación ni datos de empresa. La página responde 404 con la UI propia.
8. **Contraseña inválida.** Una contraseña de menos de 12 o más de 128 caracteres, o una confirmación distinta, se rechaza con 303 a la página de invitación y un error visible. La invitación sigue pendiente y el usuario `INACTIVO`.
9. **Empresa suspendida.** Dada una invitación pendiente de una empresa `SUSPENDIDA`, se muestra «La empresa no está activa» y no se acepta. La invitación sigue pendiente para cuando la empresa se reactive.
10. **Doble envío concurrente.** Dados dos POST simultáneos con el mismo token, solo uno acepta. El otro termina como «ya utilizada» y solo existe una sesión creada por la aceptación.
11. **Token fuera de la URL de destino.** El token no aparece en la redirección final, en logs ni en base de datos (solo su SHA-256). La página de invitación responde con `Referrer-Policy: same-origin`, `Cache-Control: no-store` y `X-Robots-Tag: noindex`.
12. **Mismo origen.** Un POST de aceptación con `Origin` distinto devuelve 403 y no modifica nada. `GET` sobre el endpoint de aceptación devuelve 405.
13. **Gate sin BD.** Dado un clon sin PostgreSQL ni `DATABASE_URL`, `init.sh` pasa lint, typecheck, tests unitarios y build sin conectarse a la base.

## Repository Research

### Files Inspected

- `AGENTS.md`, `PROGRESS.md`, `feature_list.json`: workflow, estado aceptado de `superadmin-company-plan` y alcance.
- `CONSTRAINTS.md`, `ARCHITECTURE.md`: excepciones de identidad sin `tenantFilter`, reglas de cookie de sesión, token hasheado y transacciones.
- `docs/specs/superadmin-company-plan.md`: handoff explícito (comprobar token no caducado y no aceptado, guardar `passwordHash`, `ACTIVO` y `aceptadaEn` en una transacción).
- `docs/domain-model.md`, `docs/user-and-access-model.md`: estados de invitación, 7 días, registro solo por invitación.
- `prisma/schema.prisma`: `Invitacion` con `tokenHash @unique`, `aceptadaEn`, CHECK `aceptada_en >= creada_en`. No requiere migración.
- `src/lib/superadmin/invitations.ts`: helpers puros `hashInvitationToken`, `getInvitationStatus` e `invitationPath`.
- `src/lib/auth/session.ts`, `password.ts`, `session-token.ts`, `origin.ts`, `current-session.ts`: `createSession`, `hashPassword`, `revokeSessionByToken`, cookie, `isSameOrigin` e `isSecureRequest`.
- `src/app/api/auth/login/route.ts`, `src/app/login/page.tsx`: patrón de POST con formulario, 303 con `?error=`, 405 y UI de formulario.
- `next.config.ts` y `node_modules/next/dist/docs/.../headers.md`: `headers()` para cabeceras por ruta.

### Existing Patterns To Follow

- Lógica testeable en `src/lib/`, rutas en `src/app/`. Mutaciones `POST` con `x-www-form-urlencoded`, `isSameOrigin`, 303 y `GET` 405.
- El cliente Prisma se recibe explícitamente (`AuthDb`) para probar dentro de `inRollback`.
- Páginas con BD en `force-dynamic` para que el build no abra conexiones.
- Errores de formulario como `?error=<código>`, mapeados a texto en la página.

### Current Gaps

- No existe la ruta `/invitacion/[token]` ni un endpoint de aceptación.
- No hay política de longitud mínima de contraseña: el login acepta de 1 a 128 caracteres.
- La búsqueda de invitación por `token_hash` es una consulta nueva sin `tenantFilter`. Es una excepción de identidad como la de sesión y debe documentarse en `CONSTRAINTS.md`.

### Open Unknowns

- **Token en la ruta:** el token viaja en el path del enlace (inherente al enlace). Se mitiga con `Referrer-Policy: same-origin` y `no-store`, y enviando el token en el cuerpo del POST, no en la URL del POST. `next start` no registra paths por defecto; confirmarlo en el smoke.
- **Concurrencia:** confirmar en PostgreSQL real que `updateMany` condicionado (`aceptada_en IS NULL AND expira_en > now`) deja a un solo ganador.

## Technical Approach

1. **Módulo `src/lib/onboarding/`.**
   - `invitation-acceptance.ts` expone `findInvitationByToken(db, token, now)`, que devuelve un resultado discriminado: `valida` (con datos de empresa e invitado para la UI), `no_encontrada`, `caducada`, `aceptada` o `empresa_inactiva`.
   - El mismo archivo expone `acceptInvitation(db, { token, password, now })`. Hashea la contraseña con `hashPassword` antes de abrir la transacción, porque scrypt es lento y no debe mantener filas bloqueadas. Dentro de `db.$transaction`:
     - a. Carga la invitación por `tokenHash` con usuario y empresa.
     - b. Valida el estado (pendiente, empresa `ACTIVA`, usuario `INACTIVO` sin hash, tipo `ADMINISTRADOR_EMPRESA`).
     - c. `invitacion.updateMany({ where: { id, aceptadaEn: null, expiraEn: { gt: now } }, data: { aceptadaEn: now } })`. Si `count !== 1`, devuelve `aceptada` o `caducada`.
     - d. `usuario.updateMany({ where: { id, estado: INACTIVO, passwordHash: null }, data: { passwordHash, estado: ACTIVO } })`. Si `count !== 1`, lanza para revertir y devuelve `aceptada`.
     - e. `createSession(tx, { usuarioId, now })`.
   - El cuerpo transaccional se exporta como `acceptInvitationInTransaction` para probarlo con `inRollback`, igual que `createCompanyWithInvitationInTransaction`.
   - La búsqueda por `token_hash` es una excepción de identidad acotada, igual que la sesión. No usa `tenantFilter` y no expone datos de otras empresas: el token identifica una única fila.
2. **Validación de formato.** `isWellFormedInvitationToken(token)` acepta solo base64url de 43 caracteres. Los tokens mal formados no consultan la base.
3. **Política de contraseña de alta.** `validateNewPassword(password, confirmation)` en `src/lib/auth/password.ts` exige entre 12 y 128 caracteres y una confirmación idéntica. Devuelve el código `corta`, `larga` o `distinta`. No se exigen clases de caracteres. El login no cambia, para no bloquear cuentas existentes.
4. **Página `src/app/invitacion/[token]/page.tsx`.**
   - Pública y `force-dynamic`. `params` es `Promise`.
   - Estado `valida`: tarjeta con empresa, nombre, email, caducidad y el formulario POST a `/api/invitaciones/aceptar` con `token` oculto, `password` y `passwordConfirm` (`autoComplete="new-password"`, `minLength=12`). Muestra los errores de `?error=`.
   - Otros estados: mensaje claro y enlace a `/login`. `no_encontrada` llama a `notFound()` con un `not-found.tsx` propio del segmento, sin datos.
   - Fallo de base de datos: mensaje genérico de servicio.
   - `metadata.robots = { index: false, follow: false }`.
5. **Endpoint `src/app/api/invitaciones/aceptar/route.ts`.**
   - Solo `POST`; `GET` devuelve 405. Comprueba `isSameOrigin` y lee el formulario.
   - Si el token está mal formado, responde 303 a `/invitacion/invalida`, sin reflejar el token.
   - Si la contraseña es inválida, responde 303 a `/invitacion/<token>?error=<código>`. Es la misma URL que el usuario ya tiene; el token no se añade a ninguna URL nueva.
   - Si la aceptación es correcta, revoca la sesión previa de la cookie (`revokeSessionByToken`, sin lanzar si falla), fija `central_sesion` con los mismos atributos que el login y responde 303 a `/panel`.
   - Si el estado no permite aceptar, responde 303 a `/invitacion/<token>`, que muestra el estado.
   - Ante un error inesperado, responde 303 a `/invitacion/<token>?error=servicio`.
   - Nunca registra token, email ni contraseña.
6. **Cabeceras.** `next.config.ts` añade `headers()` para `/invitacion/:path*` con `Referrer-Policy: same-origin`, `Cache-Control: no-store` y `X-Robots-Tag: noindex, nofollow`.
7. **Superadmin.** No cambia código: `getInvitationStatus` ya devuelve `ACEPTADA` y el detalle lista el estado del usuario. Se verifica en el smoke.
8. **Aislamiento y auditoría.** La sesión creada pasa por `getSessionByToken`, que exige usuario `ACTIVO` y empresa `ACTIVA`. No se añade auditoría (riesgo ya registrado).

## Expected File Changes

- `src/lib/onboarding/invitation-acceptance.ts`: crear. Búsqueda, estados, transacción de aceptación.
- `src/lib/onboarding/invitation-acceptance.test.ts`: crear. Formato de token y mapeo de estados sin BD.
- `src/lib/onboarding/invitation-acceptance.db.test.ts`: crear. Aceptación, un solo uso, caducada, empresa suspendida, concurrencia y sesión válida.
- `src/lib/auth/password.ts` y `password.test.ts`: modificar. `validateNewPassword` y constantes de longitud mínima.
- `src/app/invitacion/[token]/page.tsx` y `src/app/invitacion/[token]/not-found.tsx`: crear.
- `src/app/api/invitaciones/aceptar/route.ts`: crear.
- `next.config.ts`: modificar. Cabeceras de `/invitacion/:path*`.
- `CONSTRAINTS.md`, `ARCHITECTURE.md`, `AGENTS.md`, `README.md`, `docs/user-and-access-model.md`, `docs/domain-model.md`, `docs/risks-and-open-questions.md`, `docs/technical-discovery.md`: actualizar. Ver documentación durable.
- `scripts/validate-smoke.sh`: revisar. Añadir la comprobación pública de `/invitacion/<token-invalido>` (404) si encaja sin datos.
- `PROGRESS.md`, `feature_list.json`: actualizar con la evidencia.

## Visual Design Impact

- UI involved: yes. Fuente: `DESIGN.md` y los tokens de `globals.css`. Reutiliza el patrón de tarjeta centrada de `/login`.
- Estados: válida (formulario), contraseña con error, ya usada, caducada, empresa inactiva, no válida (404) y error de servicio.
- Directrices:
  - Etiquetas persistentes y ayuda «Mínimo 12 caracteres» visible antes del error.
  - Inputs de 48 px en móvil, foco latón y errores con `role="alert"`.
  - Datos de empresa y email en `<dl>` de solo lectura.
  - Botón primario «Activar cuenta».
  - Sin `text-accent` en texto pequeño.

## Durable Documentation Impact

- `CONSTRAINTS.md`: actualizar.
  - MUST: la búsqueda de invitación por `token_hash` es una excepción de identidad sin `tenantFilter`, limitada a `src/lib/onboarding/`.
  - MUST: la aceptación es transaccional y de un solo uso (invitación, contraseña, estado y sesión).
  - MUST: contraseña de alta de entre 12 y 128 caracteres.
  - MUST: la página de invitación no filtra referer ni se cachea.
- `ARCHITECTURE.md`: actualizar. Flujo de aceptación y módulo `onboarding`.
- `AGENTS.md` y `README.md`: actualizar. Ruta `/invitacion/<token>` y flujo local completo de alta a activación.
- `docs/user-and-access-model.md`: actualizar. Activación implementada, política de contraseña y suspensión de empresa.
- `docs/domain-model.md`: actualizar. La transición `Aceptada` activa al usuario en la misma operación.
- `docs/risks-and-open-questions.md`: actualizar. Token en el path del enlace (mitigado), sin reenvío y sin auditoría de aceptación.
- `docs/technical-discovery.md`: actualizar. Política de contraseña.
- `DESIGN.md`, `CONTEXT.md`: no hace falta.

## Implementation Tasks

- [x] `validateNewPassword` y tests unitarios.
- [x] `src/lib/onboarding/invitation-acceptance.ts` con tests unitarios y de integración (incluida concurrencia).
- [x] Página `/invitacion/[token]` y `not-found.tsx`.
- [x] Endpoint `/api/invitaciones/aceptar` con same-origin, 405 y cookie de sesión.
- [x] Cabeceras de `/invitacion/:path*` en `next.config.ts`.
- [x] `test:db`, gate, `init.sh` sin BD y smoke HTTP real.
- [x] Documentación durable, `PROGRESS.md` y `feature_list.json`.

## Verification Plan

### Base de datos real

```bash
npm run db:status
npm run test:db
```

### Gate estándar

```bash
npm run lint && npm run typecheck && npm test && npm run build
& "C:\Program Files\Git\bin\bash.exe" init.sh
```

### Smoke HTTP (Git Bash, `next start` en 3100, `curl --max-time 10`)

1. Login del superadmin, alta de una empresa de prueba y lectura del enlace de invitación desde el HTML del detalle.
2. `GET /invitacion/<token>`: 200, empresa y email en HTML, cabeceras `Referrer-Policy: same-origin`, `Cache-Control: no-store` y `X-Robots-Tag`.
3. POST con contraseña corta y con confirmación distinta: 303 con `?error=`, y en BD la invitación sigue pendiente y el usuario `INACTIVO`.
4. POST con `Origin` ajeno: 403. `GET /api/invitaciones/aceptar`: 405.
5. POST válido: 303 a `/panel` con `Set-Cookie: central_sesion`. `/panel` es 200 y contiene el nombre de la empresa. `/superadmin` responde 403.
6. Reenvío del mismo POST: 303 a la invitación, que muestra «ya se ha utilizado». En BD hay una sola sesión del usuario.
7. Logout y login con la nueva contraseña: 303 a `/panel`.
8. `GET /invitacion/<token-aleatorio>`: 404 con la UI propia.
9. En `/superadmin/empresas` la invitación figura como «Aceptada».
10. Limpieza: borrar en BD la empresa de prueba con su usuario, sesiones e invitación; matar el servidor, liberar el puerto y borrar las cookies.

La invitación caducada y la empresa suspendida se cubren en `test:db`, porque provocarlas por HTTP exigiría manipular fechas.

## Evidence To Capture

- Salidas de `test:db` y del gate.
- `init.sh` sin `DATABASE_URL`.
- Códigos HTTP y cabeceras del smoke.
- Consulta `psql` con `aceptada_en`, estado `ACTIVO`, `password_hash` con prefijo `scrypt$` y número de sesiones.
- Confirmación de limpieza de datos y procesos.

## Implementación: hallazgos verificados

- **Referrer-Policy y mismo origen:** la primera versión usaba
  `Referrer-Policy: no-referrer`. Con ella, Edge envía `Origin: null` en el POST
  del formulario y `/api/invitaciones/aceptar` respondía 403 «Origen no
  permitido»; los smokes con `curl` no lo detectaron porque fijan `Origin` a
  mano. Se cambió a `same-origin`, que no envía Referer a terceros y mantiene un
  `Origin` normal en peticiones a la propia app. Verificado con Edge headless
  (CDP): `Origin: http://localhost:3100`, 303 a `/panel` y usuario `ACTIVO`.

## Validator Checklist

- [ ] La aceptación es atómica y de un solo uso, también con concurrencia.
- [ ] Una invitación caducada, ya usada, desconocida o de empresa suspendida no activa al usuario ni crea sesión.
- [ ] Contraseña de 12 a 128 caracteres con confirmación; el login no cambia.
- [ ] Tras aceptar, el usuario entra en `/panel` con su empresa y recibe 403 en `/superadmin`.
- [ ] El token no está en BD (solo el hash), ni en la URL de destino, ni en logs. Hay cabeceras `same-origin`, `no-store` y `noindex`.
- [ ] Mismo origen y 405 en el endpoint.
- [ ] No se añadieron roles, reenvío, email real, recuperación de contraseña ni migraciones.
- [ ] `init.sh` y el build pasan sin BD; documentación, `PROGRESS.md` y `feature_list.json` actualizados.
