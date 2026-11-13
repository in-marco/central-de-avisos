# Feature Implementation Spec: Arrancar la aplicación web

## Source Feature

- `id`: `bootstrap-web-app`
- `area`: `foundation`
- `depends_on`: ninguno
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

Dejar el repositorio con una aplicación Next.js + TypeScript ejecutable, una página inicial mínima y un endpoint `/health`, más el gate estándar de lint, typecheck, tests y build. Esta feature establece la base técnica sobre la que se construirán autenticación, multiempresa y dominio.

No implementa producto: solo el esqueleto verificable de la aplicación.

## Non-Goals

- Base de datos, ORM, migraciones o conexión a PostgreSQL (feature `database-foundation`).
- Autenticación, sesiones, invitaciones o roles.
- Modelos de empresa, cliente, aviso, parte o factura.
- Tailwind avanzado, componentes de diseño o pantallas de producto.
- Playwright o cualquier harness E2E.
- Docker, CI/CD, despliegue o configuración de producción.
- Integración con IA, almacenamiento, firma o email.

## Job Story

Cuando empiezo el desarrollo de la central de avisos,
quiero disponer de una aplicación web que arranque y tenga un gate de calidad reproducible,
para poder implementar la primera feature de dominio sin discutir la base técnica.

## Users And Permissions

- **Desarrollador/agente:** instala dependencias, arranca la app y ejecuta el gate.
- **Visitante:** puede abrir `/` y `/health`; no hay autenticación todavía.
- No hay roles ni datos de empresa en esta feature.

## Acceptance Scenarios

### Scenario 1: Arranque en limpio

Dado un clon limpio del repositorio sin `node_modules`
Cuando ejecuto la instalación de dependencias y `npm run dev`
Entonces la aplicación arranca en local y `/` muestra el nombre "Central de avisos" y un enlace a `/health`.

### Scenario 2: Estado de salud

Dada la aplicación arrancada
Cuando abro `/health`
Entonces recibo HTTP 200 con JSON que contiene `status: "ok"`, el nombre del servicio y un timestamp ISO-8601, sin depender de base de datos ni variables de entorno.

### Scenario 3: Gate estándar

Dado el repositorio con dependencias instaladas
Cuando ejecuto `npm run lint`, `npm run typecheck`, `npm test` y `npm run build`
Entonces los cuatro comandos terminan con código 0.

### Scenario 4: Arranque estándar sin servidor duradero

Dado el repositorio bootstrappeado
Cuando ejecuto `init.sh` con Git Bash
Entonces comprueba que existe `npm`, instala dependencias si faltan, ejecuta lint, typecheck, tests y build, imprime el comando de desarrollo y termina sin arrancar un servidor de larga duración.

## Repository Research

### Files Inspected

- `AGENTS.md` — flujo de trabajo, reglas y definición de terminado.
- `PROGRESS.md` — estado pre-bootstrap y siguiente feature.
- `feature_list.json` — definición y verificación de `bootstrap-web-app`.
- `init.sh` — gate actual, todavía pre-bootstrap.
- `docs/technical-discovery.md` — stack candidato, testing y restricciones.
- `docs/build-brief.md` — alcance del MVP y criterios de éxito.
- `DESIGN.md` — tokens y dirección visual; la home inicial debe ser sobria.
- `README.md` — placeholder sin instrucciones de arranque.
- `.gitignore` — solo contiene `.DS_Store`.
- `docs/risks-and-open-questions.md` — riesgos y decisiones pendientes.

### Existing Patterns To Follow

- El repositorio usa documentación en español y mensajes de commit con prefijo de ámbito.
- `init.sh` es el camino estándar de verificación; en Windows se ejecuta con Git Bash:
  `& "C:\Program Files\Git\bin\bash.exe" init.sh`.
- El stack acordado es Next.js con TypeScript, App Router, Tailwind CSS y PostgreSQL (PostgreSQL llega en la siguiente feature).
- La verificación del MVP se apoya en tests unitarios, integración y E2E; en esta feature solo aplican unitarios y build.

### Current Gaps

- No existe `package.json`, `src/`, `app/` ni ningún código de aplicación.
- No hay Node.js ni npm disponibles en el PATH del entorno actual. Es un prerrequisito para implementar y verificar esta feature.
- No hay harness E2E, así que no se añade Playwright todavía.
- `init.sh` solo comprueba la existencia del harness.
- `README.md` no explica cómo arrancar la aplicación.

### Open Unknowns

- Node.js no está instalado en el entorno actual; la implementación debe instalarlo y registrar la versión usada.
- La versión exacta de Next.js, Tailwind y Vitest se fija al instalar; no se asume una versión concreta en esta spec.
- `create-next-app` puede entrar en conflicto con `README.md` y otros archivos existentes; si se usa, debe ejecutarse en un directorio temporal o revisar los conflictos antes de copiar.
- El estándar de arranque en Windows depende de Git Bash porque el `bash` por defecto es WSL y no está disponible.

## Technical Approach

1. Crear una app Next.js con App Router, TypeScript en modo estricto y estructura `src/`.
2. Usar npm como gestor de paquetes y fijar versiones en `package-lock.json`.
3. Añadir Tailwind CSS con una hoja global mínima; los tokens completos de `DESIGN.md` se aplicarán en las pantallas de producto.
4. Separar la lógica de salud en `src/lib/health.ts` para poder testearla sin levantar el servidor.
5. Exponer `GET /health` como route handler que devuelve JSON.
6. Crear una home mínima con el nombre del producto y enlace a salud; sin navegación ni componentes de dominio.
7. Configurar ESLint, typecheck, Vitest y build como scripts de npm.
8. Actualizar `init.sh` para detectar npm, instalar dependencias si faltan y ejecutar el gate no interactivo.
9. Actualizar `README.md`, `PROGRESS.md` y `feature_list.json` al terminar.

Decisiones concretas:

- **Framework:** última versión estable de Next.js en el momento de implementar; fijarla en `package.json`.
- **Estructura:** `src/app` para rutas y `src/lib` para lógica testeable.
- **Tests:** Vitest en entorno Node; no se necesita DOM para esta feature.
- **Estilos:** Tailwind CSS y una hoja `globals.css`; sin librería de componentes todavía.
- **Tipografía:** pila del sistema como placeholder; no depender de Google Fonts en build.
- **Salud:** `buildHealthPayload()` devuelve un objeto determinista salvo el timestamp; el test valida forma y formato, no el valor exacto.
- **Sin variables de entorno obligatorias:** la app debe arrancar sin `.env`.

## Expected File Changes

Rutas provisionales hasta que exista la app:

- `package.json` — crear; scripts y dependencias.
- `package-lock.json` — crear; versiones fijadas.
- `next.config.ts` — crear; configuración mínima.
- `tsconfig.json` — crear; TypeScript estricto y alias `@/*`.
- `eslint.config.mjs` — crear; reglas de Next.js y TypeScript.
- `postcss.config.mjs` — crear; integración de Tailwind.
- `vitest.config.ts` — crear; entorno Node y alias de rutas.
- `.nvmrc` — crear; versión LTS de Node recomendada.
- `src/app/layout.tsx` — crear; layout raíz y metadatos.
- `src/app/page.tsx` — crear; home mínima.
- `src/app/globals.css` — crear; Tailwind y estilos base.
- `src/app/health/route.ts` — crear; endpoint JSON.
- `src/lib/health.ts` — crear; construcción del payload.
- `src/lib/health.test.ts` — crear; test unitario.
- `init.sh` — modificar; gate bootstrappeado con npm.
- `.gitignore` — modificar; ignorar `node_modules`, `.next`, `coverage` y `.env*`.
- `README.md` — modificar; comandos de instalación, desarrollo y verificación.
- `PROGRESS.md` — modificar; estado verificado y sesión.
- `feature_list.json` — modificar; estado y evidencia de la feature.

No sobrescribir `CONTEXT.md`, `DESIGN.md` ni los documentos de `docs/` existentes. Si se usa `create-next-app`, hacerlo en un directorio temporal o revisar conflictos antes de copiar archivos.

## Visual Design Impact

- UI involved: yes, mínima.
- Design source: `DESIGN.md`.
- Screens or states affected: home `/` y respuesta `/health`.
- New design artifact required: no.

La home debe ser sobria y usar los colores base de `DESIGN.md` (`background`, `surface`, `text`, `primary`, `accent`) sin construir todavía un sistema de componentes. No inventar logo; usar un wordmark tipográfico provisional. La pantalla real que define la dirección visual es la bandeja del técnico, fuera de esta feature.

## Durable Documentation Impact

- `ARCHITECTURE.md`: not needed — la estructura inicial sigue la convención de Next.js y aún no hay dominios ni capas de negocio que documentar.
- `CONSTRAINTS.md`: not needed — no se introduce una regla MUST/MUST NOT nueva; las reglas vigentes están en `AGENTS.md`.
- `AGENTS.md`: update — el arranque deja de ser pre-bootstrap y debe reflejar los comandos reales de npm y el nuevo gate.
- `README.md`: update — añadir instalación, desarrollo, tests y verificación.
- `docs/technical-discovery.md`: not needed — el stack ya está descrito; solo se confirma al implementar.
- `PROGRESS.md` y `feature_list.json`: update — obligatorio por la definición de terminado.

## Implementation Plan

1. Verificar que Node.js LTS y npm están instalados; si no, instalarlos y dejarlo registrado.
2. Crear el esqueleto Next.js + TypeScript + Tailwind en `src/`, sin tocar los documentos existentes.
3. Configurar scripts de lint, typecheck, test y build; añadir Vitest y el test de salud.
4. Implementar `buildHealthPayload`, `/health` y la home mínima.
5. Actualizar `init.sh` al modo bootstrappeado y comprobar que no arranca el servidor.
6. Ejecutar el gate completo, actualizar `README.md`, `PROGRESS.md` y `feature_list.json` con evidencia.

## Implementation Tasks

- [ ] Comprobar e instalar Node.js LTS y npm; registrar la versión.
- [ ] Crear `package.json` con scripts `dev`, `build`, `start`, `lint`, `typecheck`, `test` y `test:watch`.
- [ ] Instalar Next.js, React, TypeScript, Tailwind, ESLint y Vitest; generar `package-lock.json`.
- [ ] Configurar `tsconfig.json` estricto con alias `@/*`.
- [ ] Configurar ESLint y Tailwind/PostCSS.
- [ ] Crear layout, home y estilos globales mínimos.
- [ ] Implementar `src/lib/health.ts` y `src/app/health/route.ts`.
- [ ] Añadir `src/lib/health.test.ts` con Vitest.
- [ ] Actualizar `.gitignore`.
- [ ] Actualizar `init.sh` para instalar si falta y ejecutar lint, typecheck, test y build.
- [ ] Actualizar `README.md` con los comandos reales.
- [ ] Ejecutar el gate y registrar evidencia.
- [ ] Actualizar `PROGRESS.md` y `feature_list.json`.

## Verification Plan

Ejecutar con Git Bash en Windows:

```bash
& "C:\Program Files\Git\bin\bash.exe" init.sh
```

El script debe:

- comprobar que `npm` existe y fallar con un mensaje claro si no,
- ejecutar `npm ci` si falta `node_modules` y existe `package-lock.json`, o `npm install` si no existe el lock,
- ejecutar `npm run lint`,
- ejecutar `npm run typecheck`,
- ejecutar `npm test`,
- ejecutar `npm run build`,
- imprimir `npm run dev` como paso manual,
- no arrancar el servidor de desarrollo.

Comprobaciones manuales:

```bash
npm run dev
```

- Abrir `http://localhost:3000/` y ver la home mínima.
- Abrir `http://localhost:3000/health` y comprobar HTTP 200 y JSON válido.
- Abrir una ruta inexistente y comprobar 404.

E2E: no se añade Playwright en esta feature porque no existe harness E2E y el comportamiento se cubre con un test unitario del payload y la comprobación manual de las dos rutas. El primer flujo de usuario real introducirá Playwright.

## Evidence To Capture

- Versión de Node.js y npm usada.
- Salida con código 0 de `npm run lint`, `npm run typecheck`, `npm test` y `npm run build`.
- Salida de `init.sh` en verde.
- Respuesta de `/health` con `status: "ok"` y timestamp.
- Resultado manual de `/` y de una ruta 404.
- Actualización de `feature_list.json` con `status: "passing"` y evidencia, o `blocked` con el motivo.
- Entrada de sesión en `PROGRESS.md`.

## Validator Checklist

- [ ] La implementación se limita al bootstrap; no añade base de datos, auth ni dominio.
- [ ] `/` y `/health` cumplen los escenarios de aceptación.
- [ ] `npm run lint`, `npm run typecheck`, `npm test` y `npm run build` pasan.
- [ ] `init.sh` funciona desde un clon sin `node_modules` y no arranca un servidor.
- [ ] La evidencia está registrada en `feature_list.json` y `PROGRESS.md`.
- [ ] `README.md` y `AGENTS.md` reflejan los comandos reales.
- [ ] No se han modificado documentos de descubrimiento ni se ha añadido alcance extra.
- [ ] No se ha añadido Playwright ni CI sin justificación.
