#!/usr/bin/env bash
# Build de Vercel (demo-deployment). Lo invoca `vercel.json` como
# `buildCommand`. Solo en producción: aplica las migraciones pendientes con la
# URL directa (`DATABASE_URL_UNPOOLED`, o `DATABASE_URL` si falta; ver
# prisma.config.ts) y después ejecuta `next build`.
#
# Cualquier otro VERCEL_ENV (preview, development o vacío) termina con error
# sin tocar la base de datos. `vercel.json` ya hace que Vercel ignore esos
# builds; esto es la segunda barrera.
#
# Nunca imprime URLs ni credenciales.
set -euo pipefail

if [ "${VERCEL_ENV:-}" != "production" ]; then
  echo "vercel-build: VERCEL_ENV='${VERCEL_ENV:-}' no es 'production'; no se migra ni se construye." >&2
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "vercel-build: falta DATABASE_URL (pooler de Neon) en las variables de Production." >&2
  exit 1
fi

if [ -n "${DATABASE_URL_UNPOOLED:-}" ]; then
  echo "vercel-build: migraciones con DATABASE_URL_UNPOOLED (conexión directa)."
else
  echo "vercel-build: aviso: falta DATABASE_URL_UNPOOLED; las migraciones usan DATABASE_URL." >&2
fi

echo "vercel-build: prisma migrate deploy"
npx prisma migrate deploy

echo "vercel-build: next build"
npx next build
