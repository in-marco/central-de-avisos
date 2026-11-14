# Feature Implementation Spec: Configuración fiscal y tarifas de la empresa

## Source Feature

- `id`: `company-billing-settings`
- `area`: `tenancy`
- `depends_on`: `company-admin-onboarding`, `role-based-permissions` (ambas `accepted`)
- `status` en planificación: `not_started`
- `source`: `feature_list.json`. Verificación fuente: editar NIF, dirección, serie, tarifa y modo fiscal, recargar y comprobar que persisten; un usuario que no es administrador recibe 403; errores de formato en NIF y tarifa.
- El implementador actualizará `feature_list.json` y `PROGRESS.md` con evidencia real.

## Goal

El administrador de una empresa de servicios edita en `/panel/empresa` la configuración que usará la facturación de trabajos: datos fiscales (razón social, NIF, dirección fiscal y email de facturación), la serie de factura, el modo fiscal (solo `NO_VERIFACTU` en el MVP) y la tarifa horaria por defecto. Los valores se guardan en `empresas`, siempre sobre la empresa de la sesión, con validación en servidor y CHECK en base de datos. `invoice-draft` y `invoice-signed-pdf` leerán estos campos más adelante.

## Non-Goals

- Numeración de facturas (siguiente número, contador por año, huecos): llega con `invoice-signed-pdf`. Aquí no se añade ninguna columna de contador.
- Activar el modo VERIFACTU o crear la capa de abstracción fiscal o de firma. Esta feature solo guarda el modo.
- Tipo de IVA configurable (el MVP usa IVA general; lo decide `invoice-draft`), tarifas por cliente (`client-records`/`invoice-draft`) e histórico de tarifas (la tarifa se congela al aprobar el parte, en `office-part-approval`).
- Cambiar el plan o el estado de la empresa (solo el superadmin), editar los datos desde `/superadmin`, logo o marca.
- Auditoría de los cambios (`audit-trail-view`). Queda como riesgo.
- Lectura de la configuración por oficina o técnico.

## Job Story

Cuando acabo de activar mi empresa en la plataforma,
quiero dejar bien puestos mis datos fiscales, mi serie y mi tarifa horaria,
para que las facturas que emita después salgan correctas sin tocar nada fuera del sistema.

## Users And Permissions

- **Administrador (incluido `ADMINISTRADOR+TECNICO`):** permiso `empresa.configurar`, que ya existe en `src/lib/authz/permissions.ts`. Ve y edita la configuración de su empresa.
- **Oficina, técnico y usuario sin roles:** 403 en la página (UI de `src/app/panel/forbidden.tsx`) y en la API. La navegación no muestra «Empresa».
- **Superadmin:** 403 (no tiene permisos de empresa). No se toca `/superadmin`.
- **Anónimo:** página → 307 `/login?next=%2Fpanel%2Fempresa`; POST → 307 al mismo login.

## Acceptance Scenarios

1. **Migración.** Tras `db:deploy`, `empresas` tiene `serie_factura` (TEXT, nullable), `tarifa_horaria` (DECIMAL(10,2), nullable) y `modo_fiscal` (enum `modo_fiscal` con el único valor `NO_VERIFACTU`, NOT NULL DEFAULT). Las empresas existentes quedan con serie y tarifa nulas y modo `NO_VERIFACTU`. La BD rechaza una serie en minúsculas o con caracteres no permitidos, y una tarifa ≤ 0.
2. **Ver.** El administrador abre `/panel/empresa` (200) y ve el formulario relleno con los valores actuales. Si serie o tarifa son nulas, aparece el aviso «Pendiente de configurar» (`role="status"`) y los campos están vacíos.
3. **Editar y persistir.** El administrador cambia la razón social, el NIF (`b 87654321` → `B87654321`), la dirección, el email (`Facturas@Empresa.ES` → minúsculas), la serie (`f-` → `F-`), la tarifa (`42,5` → `42.50`) y confirma el modo NO-VERIFACTU. El POST responde 303 a `/panel/empresa?ok=guardado` y aparece «Configuración guardada.». Al recargar se ven los valores normalizados, la cabecera del panel muestra la razón social nueva y `psql` confirma los valores.
4. **Errores de formato.** Sin cambiar nada en la BD, el servidor responde 303 a `?error=<código>`:
   - `nif` para un NIF/NIE/CIF con formato inválido (por ejemplo `1234`);
   - `tarifa` para `0`, `-5`, `abc`, `12,345` o `10000`;
   - `serie` para una serie vacía, de más de 10 caracteres o con caracteres fuera de `A-Z0-9-`;
   - `email` para un email inválido;
   - `modo` para cualquier modo distinto de `NO_VERIFACTU` (incluido `VERIFACTU`);
   - `campos` para una razón social o dirección vacía o demasiado larga.

   La página muestra un resumen `role="alert"` y el error junto al campo (`aria-invalid`, `aria-describedby`).
5. **NIF duplicado.** Si el NIF ya pertenece a otra empresa, se responde `?error=nif-duplicado` con un mensaje genérico («Ese NIF ya está registrado en la plataforma.») y sin cambios. Guardar el mismo NIF que ya tiene la empresa no es un error.
6. **Aislamiento.** El `empresaId` sale solo de la sesión. Si alguien envía un campo `empresaId` o `id` en el formulario, se ignora. Un administrador de A que guarda no modifica B (test de integración).
7. **Denegado.** Oficina, técnico, usuario sin roles y superadmin reciben 403 en `GET /panel/empresa` (UI propia en español) y en `POST /api/panel/empresa`, sin cambios. `GET /api/panel/empresa` → 405 `Allow: POST`. Un `Origin` ajeno → 403.
8. **Navegación.** «Empresa» aparece en la navegación solo con `empresa.configurar` (administrador y encargado), con `aria-current="page"` en `/panel/empresa`.
9. **Gate sin BD.** `init.sh` pasa sin PostgreSQL ni `DATABASE_URL`.

## Repository Research

### Files Inspected

- `AGENTS.md`, `PROGRESS.md`, `feature_list.json`: estado (dependencias en `accepted`). `client-records` se desarrolla en paralelo.
- `CONSTRAINTS.md`: `requirePermission`/`authorizeCompanyRequest`, `forbidden()` solo desde la página, NIF normalizado con CHECK, migraciones SQL versionadas, verificación con navegador real de los formularios nuevos y prohibición de `no-referrer` con `isSameOrigin`.
- `docs/domain-model.md` (la empresa tiene modo fiscal, tarifa por defecto y serie), `docs/user-and-access-model.md` (fila «Configurar empresa, tarifas y series»: solo Administrador), `docs/build-brief.md` (NO-VERIFACTU, España, EUR, IVA general), `docs/risks-and-open-questions.md` (formato de serie pendiente; la tarifa se congela al aprobar).
- `prisma/schema.prisma` y `prisma/migrations/*` (5 migraciones; la última es `20261114120000_roles_usuario`; estilo de CHECK en `20261114015000_superadmin_invitations`).
- `src/lib/authz/permissions.ts` (`empresa.configurar` ya existe), `navigation.ts`, `guards.ts` y `panel-guards.test.ts`.
- `src/lib/superadmin/validation.ts`: `isValidNif`, `normalizeNif`, `isValidUserEmail`, `parseImporteMensual` (patrón con `BigInt`), `formString` y los límites `COMPANY_NAME_MAX_LENGTH` y `ADDRESS_MAX_LENGTH`. `db-errors.ts`: `isUniqueViolation`.
- `src/lib/empresa/usuarios.ts`, `src/app/panel/usuarios/page.tsx` y `src/app/api/panel/usuarios/roles/route.ts`: patrón de página, route handler, mensajes y clases.
- `src/app/panel/layout.tsx` y `page.tsx`, `src/lib/auth/session.ts` (`empresa: { id, nombre }`, leída de la BD en cada petición).
- `prisma/seed.ts`, `scripts/validate-smoke.sh` y `DESIGN.md`.

### Existing Patterns To Follow

- Lógica pura en `src/lib/`. Mutaciones con formulario `POST` a un route handler: `isSameOrigin`, guard, 303 con `?ok=`/`?error=`, 405 en `GET` y `?error=servicio` ante un fallo inesperado, sin registrar datos personales.
- Los módulos reciben la BD de forma explícita (`EmpresaDb`). El `empresaId` sale siempre de `session.empresa!.id`.
- Importes decimales como cadena normalizada (sin `float`) y validados con `BigInt`.

### Current Gaps

- No existen columnas de serie, tarifa ni modo fiscal, ni ninguna página de configuración de empresa.
- No hay ningún harness E2E persistente (sin Playwright).

## Technical Approach

1. **Migración `prisma/migrations/<ts>_empresa_facturacion/migration.sql`:**
   - `CREATE TYPE "modo_fiscal" AS ENUM ('NO_VERIFACTU');`
   - `ALTER TABLE "empresas"` con las columnas `"serie_factura" TEXT`, `"tarifa_horaria" DECIMAL(10,2)` y `"modo_fiscal" "modo_fiscal" NOT NULL DEFAULT 'NO_VERIFACTU'`.
   - CHECK `empresas_serie_factura_formato`: `serie_factura IS NULL OR serie_factura ~ '^[A-Z0-9][A-Z0-9-]{0,9}$'`.
   - CHECK `empresas_tarifa_horaria_positiva`: `tarifa_horaria IS NULL OR tarifa_horaria > 0`.
   - En Prisma, `enum ModoFiscal { NO_VERIFACTU @@map("modo_fiscal") }` y los campos `serieFactura String? @map("serie_factura")`, `tarifaHoraria Decimal? @map("tarifa_horaria") @db.Decimal(10, 2)` y `modoFiscal ModoFiscal @default(NO_VERIFACTU) @map("modo_fiscal")`. Después, `prisma migrate diff --from-config-datasource --to-schema` no debe mostrar deriva.
   - Decisión: el enum tiene un solo valor. Añadir `VERIFACTU` requerirá una feature con `ALTER TYPE ... ADD VALUE`, así que la BD no puede activarlo por error.
   - Decisión: serie y tarifa son nullables (NULL = sin configurar). Así no se inventa un valor por defecto que acabe facturando 0 € o con una serie no elegida. Las features de factura deberán bloquear si son nulas.
2. **Validación pura `src/lib/empresa/configuracion-validation.ts`:**
   - `parseBillingSettingsForm(formData)` devuelve `{ ok, value } | { ok: false, error }`, con `error` igual a `campos | nif | email | serie | tarifa | modo`. Sigue el orden del formulario y devuelve el primer error.
   - Reutiliza `formString`, `isValidNif`/`normalizeNif`, `isValidUserEmail`/`normalizeUserEmail` y los límites de `src/lib/superadmin/validation.ts`.
   - `normalizeSerie`: `trim` y mayúsculas; después se valida con la misma regex que el CHECK.
   - `parseTarifaHoraria`: admite coma o punto y hasta 2 decimales. Exige > 0 y ≤ `9999.99` y devuelve una cadena `"42.50"`. Puede generalizar el patrón de `parseImporteMensual` sin cambiar su comportamiento.
   - `modoFiscal`: solo `NO_VERIFACTU`.
   - Ignora cualquier `empresaId` o `id` del formulario.
3. **Repositorio `src/lib/empresa/configuracion.ts`:**
   - `getCompanyBillingSettings(db, empresaId)`: `findUnique({ where: { id: requireEmpresaId(empresaId) } })` con `select` de nombre, nif, direccionFiscal, emailFacturacion, serieFactura, tarifaHoraria (como cadena) y modoFiscal.
   - `updateCompanyBillingSettings(db, empresaId, values)`: hace un `update` por `id: requireEmpresaId(empresaId)` solo con los campos de la configuración (nunca `planId` ni `estado`).
   - Antes del `update` comprueba si el NIF pertenece a otra empresa (`findFirst({ where: { nif, NOT: { id } } })`). Además, captura `isUniqueViolation` sobre `nif` para la carrera. En ambos casos devuelve `nif-duplicado`.
4. **Route handler `src/app/api/panel/empresa/route.ts`:** `GET` → 405 `Allow: POST`. `POST` sigue esta secuencia:
   - comprueba `isSameOrigin` (403 si falla);
   - aplica `authorizeCompanyRequest(request, "empresa.configurar", "/panel/empresa")`;
   - lee `formData` (400 si falla) y lo pasa por `parseBillingSettingsForm`;
   - llama a `updateCompanyBillingSettings(getDb(), session.empresa!.id, value)`;
   - responde 303 a `/panel/empresa?ok=guardado` o a `?error=<código>`, o a `?error=servicio` ante un fallo inesperado.
5. **Página `src/app/panel/empresa/page.tsx`:**
   - `force-dynamic` y `requirePermission("empresa.configurar", "/panel/empresa")`.
   - Un `<form method="post" action="/api/panel/empresa">` en una tarjeta con tres grupos (`fieldset`/`legend`):
     - **Datos fiscales:** razón social, NIF, dirección fiscal (`textarea`) y email de facturación.
     - **Facturación:** serie (ayuda «Hasta 10 caracteres: letras, números y guion») y tarifa horaria (`inputMode="decimal"`, sufijo «€/h», ayuda «Sin IVA»).
     - **Modo fiscal:** grupo de radios con «NO-VERIFACTU (registro firmado)» marcado y «VERIFACTU · No disponible en esta versión» `disabled`, más una ayuda breve.
   - Atributos del navegador: `required`, `maxLength` y `autoComplete` adecuados. Sin `pattern` en NIF ni tarifa, para que el servidor sea quien valida y el error se pueda ver en el navegador.
   - Valores por defecto desde la BD; la tarifa se muestra con coma («42,50»).
   - Mensajes:
     - `?ok=` con `role="status"`;
     - `?error=` con un resumen `role="alert"` arriba y el texto junto al campo afectado (`aria-invalid="true"` y `aria-describedby`);
     - `nif-duplicado` y `servicio` solo en el resumen.
   - Un solo botón primario «Guardar configuración».
   - Limitación aceptada: tras un error se vuelven a mostrar los valores guardados, no los que se escribieron (patrón PRG del repo).
6. **Navegación:** en `NAV_ITEMS`, la entrada `{ href: "/panel/empresa", label: "Empresa", requiere: "empresa.configurar" }` va detrás de «Usuarios».
7. **Seed:** «Empresa Demo» recibe `serieFactura: "F"`, `tarifaHoraria: "45.00"` y `modoFiscal: "NO_VERIFACTU"`, en `update` y en `create`. Así se restauran en cada ejecución, igual que los roles.
8. **Smoke `scripts/validate-smoke.sh`:**
   - Sin sesión: `GET /panel/empresa` 307, `GET /api/panel/empresa` 405, POST con Origin ajeno 403 y POST anónimo 307.
   - Administrador (`SMOKE_NORMAL_*`): `/panel/empresa` 200.
   - Superadmin, oficina y técnico: `/panel/empresa` 403 y POST 403.
   - Ningún caso hace un POST válido (no muta datos).

## Expected File Changes

- `prisma/schema.prisma`, `prisma/migrations/<ts>_empresa_facturacion/migration.sql`: modificar o crear.
- `src/lib/empresa/configuracion-validation.ts` y `.test.ts`, `src/lib/empresa/configuracion.ts` y `configuracion.db.test.ts`: crear.
- `src/lib/superadmin/validation.ts`: solo si se extrae un helper decimal compartido, con sus tests intactos.
- `src/lib/authz/navigation.ts` y `navigation.test.ts`: modificar.
- `src/db/schema.db.test.ts` (columnas, default, los 2 CHECK y el enum) y `src/db/tenant-isolation.db.test.ts` (A no modifica B): modificar.
- `src/app/panel/empresa/page.tsx`, `src/app/api/panel/empresa/route.ts`: crear.
- `prisma/seed.ts`, `scripts/validate-smoke.sh`: modificar.
- Documentación (abajo), `PROGRESS.md` y `feature_list.json`.
- No se toca: `companies.ts` (el alta del superadmin no pide serie ni tarifa), `/superadmin`, `permissions.ts`, `next.config.ts`.

## Visual Design Impact

- UI involved: sí. Fuente: `DESIGN.md` y los tokens de `globals.css`. Copiar las clases de `src/app/panel/usuarios/page.tsx`.
- Estados de la pantalla `/panel/empresa`: sin configurar, éxito, cada error inline y el resumen, el radio VERIFACTU deshabilitado y la entrada «Empresa» activa en la navegación.
- Formulario a una columna en móvil y dos en escritorio (la dirección ocupa todo el ancho). Inputs y botón de 48 px en móvil (44 px en escritorio), etiquetas siempre visibles y foco latón de 2 px.
- La tarifa y la serie usan `font-mono` y cifras tabulares. No se usa `text-accent` en texto.
- No hace falta un artefacto de diseño nuevo.

## Durable Documentation Impact

- `CONSTRAINTS.md`: actualizar.
  - MUST: `modo_fiscal` solo admite `NO_VERIFACTU`; para añadir `VERIFACTU` hace falta una feature o ADR que lo active.
  - MUST: la configuración de empresa se escribe solo sobre `session.empresa.id` y nunca toca `plan_id` ni `estado`.
  - MUST: la serie va normalizada (CHECK) y la tarifa es > 0 (CHECK). Añadirlos a la lista de CHECK que Prisma no modela.
  - MUST: la facturación debe bloquear si la serie o la tarifa son nulas.
- `ARCHITECTURE.md`: actualizar el esquema base (columnas y enum nuevos), el módulo `src/lib/empresa/configuracion*` y la ruta `/panel/empresa`.
- `AGENTS.md`, `README.md`: añadir la ruta `/panel/empresa` (solo `empresa.configurar`) y mencionar los valores demo de serie y tarifa.
- `docs/domain-model.md`: añadir una nota de lo implementado (serie, tarifa nullable y enum de un valor). `docs/user-and-access-model.md`: actualizar «Comportamiento implementado».
- `docs/risks-and-open-questions.md`: cambios fiscales sin auditoría; el NIF duplicado revela que existe en la plataforma; cambiar la serie tras emitir queda para `invoice-signed-pdf`; el formato de serie queda resuelto como prefijo, con año y numeración pendientes.
- `DESIGN.md`, `CONTEXT.md`: no hace falta.

## Implementation Tasks

- [ ] Migración y esquema; `db:deploy`, `db:status` y `migrate diff` sin deriva; tests de esquema.
- [ ] `configuracion-validation.ts` con tests unitarios de tabla (NIF, serie, tarifa, email, modo y campos).
- [ ] `configuracion.ts` con tests de integración: persistencia y normalización, `nif-duplicado` sin cambios, mismo NIF permitido, aislamiento A/B y que `planId`/`estado` no cambian.
- [ ] Route handler, página y entrada de navegación (con test).
- [ ] Seed y `validate-smoke.sh`.
- [ ] Verificación completa, documentación, `PROGRESS.md` y `feature_list.json`.

## Verification Plan

Entorno del worktree: `.env` apunta a `central_de_avisos_company_billing_settings`. No se toca `central_de_avisos`. `next start` usa el puerto **3103** (`SMOKE_PORT=3103`), comprobando antes que está libre.

1. **BD:**
   - `npm run db:deploy`, `npm run db:status` («up to date») y `migrate diff` sin deriva.
   - `npm run test:db`.
   - `npm run db:seed` dos veces: idempotente, y `psql` muestra la serie `F`, la tarifa `45.00` y el modo `NO_VERIFACTU`.
   - Base vacía `central_de_avisos_cbs_verify`: `db:deploy` (6 migraciones), `db:status` y `test:db`; después `DROP DATABASE`.
2. **Gate:** `npm run lint`, `npm run typecheck`, `npm test` y `npm run build` (con `/panel/empresa` y `/api/panel/empresa` dinámicas). `init.sh` con Git Bash y `env -u DATABASE_URL`.
3. **Smoke:** `SMOKE_PORT=3103` con todas las `SMOKE_*` (superadmin, administrador, oficina y técnico) y `bash scripts/validate-smoke.sh`.
4. **Matriz HTTP** (curl `--max-time 10`, puerto 3103):
   - Anónimo, superadmin, administrador, oficina, técnico y encargado: `GET /panel/empresa` y `POST /api/panel/empresa`, con 307/200/403/303 según los escenarios 7 y 8.
   - Escenarios 4 y 5: cada `?error=` por POST, con una instantánea de `empresas` por `psql` idéntica antes y después.
   - Escenario 6: un POST con `empresaId` de otra empresa no la modifica.
5. **Navegador real (obligatorio por `CONSTRAINTS.md`):** Edge headless por CDP contra `next start -p 3103`.
   - a. El administrador inicia sesión desde el formulario y ve «Empresa» en la navegación.
   - b. Escribe con teclado real los valores del escenario 3 y hace clic en «Guardar configuración». El POST lleva `Origin: http://localhost:3103` y responde 303 a `?ok=guardado`; el mensaje es visible.
   - c. Recarga y comprueba los valores normalizados y la razón social nueva en la cabecera; `psql` lo confirma.
   - d. Envía un NIF inválido y una tarifa `0`. Se ven el resumen y el error inline (`aria-invalid`) y la BD no cambia.
   - e. Oficina: la navegación no muestra «Empresa» y `/panel/empresa` responde 403 con el `h1` «403 · No autorizado».
   - f. A 390 px no hay scroll horizontal, los controles miden al menos 48 px, el foco latón es visible y el orden de tabulación sigue al formulario.
   - g. Restaurar con `npm run db:seed`.
6. **E2E persistente:** no existe un harness. Cubren el caso los tests unitarios y `test:db`, el `validate-smoke.sh` ampliado y el punto 5.
7. **Limpieza:** matar el árbol de procesos de Next y Edge, comprobar que 3103 queda libre y borrar cookies, logs, el perfil de Edge y la base temporal. La base del worktree queda con el seed.

## Evidence To Capture

- Nombre de la migración, `db:status`, `migrate diff` y `psql` con las columnas, el enum y los 2 CHECK.
- Número de tests de `npm test` y de `test:db`, y la salida del gate y de `init.sh` sin BD.
- Salida de `validate-smoke.sh` y tabla de la matriz HTTP con los códigos reales.
- Del navegador: Origin del POST, 303, mensaje visible, valores tras recargar, errores inline, `h1` del 403 y medidas a 390 px.
- Confirmación de que se limpiaron procesos, puerto y bases.

## Riesgos y preguntas abiertas

- **Trabajo en paralelo con `client-records`:** ambos tocan `schema.prisma`, `navigation.ts`, `validate-smoke.sh`, `seed.ts` y los documentos durables. Al integrar la segunda rama: hacer rebase, resolver los conflictos textuales y comprobar que su carpeta de migración tiene un timestamp posterior al de la ya fusionada (si no, renombrarla). Después, repetir `db:deploy` desde una base vacía.
- Formato de serie: aquí solo un prefijo de hasta 10 caracteres. El año y la numeración los decide `invoice-signed-pdf`, que también deberá decidir si bloquea el cambio de serie tras la primera emisión.
- El administrador puede cambiar el NIF con el que el proveedor le factura la cuota, sin auditoría. El mensaje de NIF duplicado revela que ese NIF existe en otra empresa (es inevitable con el índice único global).
- Tarifa máxima de 9999,99 €/h, sin IVA. Si negocio necesita otro tope o tarifa 0, se cambian el CHECK y la validación.

## Notas de implementación

- `normalizeNif` (compartido con el alta del superadmin) solo hace `trim` y
  mayúsculas, así que `b 87654321` no pasaba el patrón. `parseBillingSettingsForm`
  quita antes todos los espacios del NIF. No se cambió `normalizeNif` para no
  alterar el alta de empresa.
- La tarifa usa su propio parser (`parseTarifaHoraria`, patrón de 1 a 4 cifras
  enteras); `parseImporteMensual` queda intacto.
- El seed localiza Empresa Demo por el NIF `B12345678`. Si una verificación
  cambia el NIF, hay que restaurarlo (`UPDATE empresas SET nif='B12345678' ...`)
  antes de `npm run db:seed` o se creará una segunda empresa.
- Migración: `20261114180000_empresa_facturacion`.

## Validator Checklist

- [ ] Solo `empresa.configurar` ve y edita. Oficina, técnico, sin roles y superadmin reciben 403 (UI propia en la página y también en la API). El anónimo recibe 307.
- [ ] La escritura usa solo `session.empresa.id`. Nunca cambia `plan_id`, `estado` ni otra empresa.
- [ ] Los valores se normalizan y persisten tras recargar. Los errores de NIF, tarifa, serie, email, modo y campos no cambian la BD.
- [ ] El modo solo admite `NO_VERIFACTU`, tanto en la BD como en el servidor. No hay ningún camino para activar VERIFACTU.
- [ ] La migración se aplica desde una base vacía, con los CHECK presentes y sin deriva.
- [ ] El formulario se verificó en un navegador real en el puerto 3103, incluidos 390 px y foco.
- [ ] Sin numeración, IVA configurable, tarifas por cliente, auditoría ni cambios en `/superadmin`.
- [ ] El gate e `init.sh` pasan sin BD. Documentación, `PROGRESS.md` y `feature_list.json` están actualizados.
