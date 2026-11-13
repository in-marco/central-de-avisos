# central-de-avisos

Central de avisos para empresas de servicios con técnicos de campo: avisos,
partes y facturación en modo NO-VERIFACTU firmado (MVP).

Esta feature es el esqueleto técnico: Next.js + TypeScript + Tailwind CSS, una
home mínima y un endpoint de salud. Todavía no hay base de datos, autenticación
ni dominio.

## Requisitos

- Node.js LTS (probado con 26.13.1; `.nvmrc` fija la versión 26).
- npm (probado con 11.20.0).

En Windows, si el PATH no incluye Node.js:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
```

## Instalación

```bash
npm ci
```

Si no existe `package-lock.json` o se han cambiado dependencias:

```bash
npm install
```

## Desarrollo

```bash
npm run dev
```

- Home: <http://localhost:3000/>
- Salud: <http://localhost:3000/health>

`GET /health` devuelve HTTP 200 con:

```json
{
  "status": "ok",
  "service": "central-de-avisos",
  "timestamp": "2026-11-13T10:00:00.000Z"
}
```

## Verificación

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

El camino estándar de arranque y verificación es `init.sh`; comprueba npm,
instala dependencias si faltan y ejecuta lint, typecheck, tests y build sin
arrancar un servidor de larga duración.

En Windows, con Git Bash:

```bash
& "C:\Program Files\Git\bin\bash.exe" init.sh
```

## Estructura

- `src/app/` — rutas de Next.js (App Router).
- `src/app/health/route.ts` — endpoint `GET /health`.
- `src/lib/health.ts` — construcción del payload de salud.
- `src/lib/health.test.ts` — test unitario con Vitest.

La documentación de producto y dominio está en `AGENTS.md`, `CONTEXT.md` y
`docs/`.
