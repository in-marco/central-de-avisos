#!/usr/bin/env bash
# Ejecuta un comando contra la base de la demo pública (demo-deployment).
#
#   bash scripts/with-demo-env.sh <comando> [args...]
#
# Lo usan los scripts `npm run demo:*`. Carga SOLO el archivo de demo
# (`DEMO_ENV_FILE`, por defecto `.env.demo`, ignorado por git) y nunca `.env`:
#
# - rechaza NODE_ENV=production;
# - quita del entorno DATABASE_URL, DATABASE_URL_UNPOOLED y cualquier SEED_*
#   heredado de la shell;
# - exporta DOTENV_PATH (y el nombre antiguo DOTENV_CONFIG_PATH) con el archivo
#   de demo, que es lo que lee `dotenv/config` en prisma.config.ts y
#   `prisma/seed-demo.ts`;
# - exige que el archivo defina DATABASE_URL (pooler, runtime) y
#   DATABASE_URL_UNPOOLED (directa, migraciones con el CLI de Prisma;
#   el seed usa DATABASE_URL a través del cliente de la app);
# - imprime el host destino sin usuario ni contraseña.
#
# Ejecutar desde Git Bash en Windows (el `bash` de WSL no ve el Node de Windows).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail() {
  echo "with-demo-env: $*" >&2
  exit 1
}

[[ $# -gt 0 ]] || fail "uso: bash scripts/with-demo-env.sh <comando> [args...]"

if [[ "${NODE_ENV:-}" == "production" ]]; then
  fail "NODE_ENV=production: los comandos demo:* solo se lanzan desde local."
fi

demo_file="${DEMO_ENV_FILE:-.env.demo}"
[[ -f "$demo_file" ]] || fail "no existe el archivo de demo '${demo_file}' (copia .env.demo.example a .env.demo o define DEMO_ENV_FILE)."

if [[ "$(basename "$demo_file")" == ".env" ]]; then
  fail "el archivo de demo no puede ser .env; usa .env.demo o DEMO_ENV_FILE."
fi

demo_dir="$(cd "$(dirname "$demo_file")" && (pwd -W 2>/dev/null || pwd))"
demo_path="${demo_dir}/$(basename "$demo_file")"

unset DATABASE_URL DATABASE_URL_UNPOOLED
while IFS= read -r var; do
  unset "$var"
done < <(compgen -e | grep '^SEED_' || true)

export DOTENV_PATH="$demo_path"
export DOTENV_CONFIG_PATH="$demo_path"

# Comprueba las dos URLs con el parser de dotenv y muestra solo host y base.
node -e '
const { readFileSync } = require("node:fs");
const { parse } = require("dotenv");
const env = parse(readFileSync(process.env.DOTENV_PATH, "utf8"));
const describe = (name) => {
  const raw = (env[name] || "").trim();
  if (!raw) {
    console.error(`with-demo-env: el archivo de demo no define ${name}.`);
    process.exit(1);
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    console.error(`with-demo-env: ${name} no es una URL válida.`);
    process.exit(1);
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) {
    console.error(`with-demo-env: ${name} no es una URL de PostgreSQL.`);
    process.exit(1);
  }
  return `${url.host}${url.pathname}`;
};
const pooled = describe("DATABASE_URL");
const direct = describe("DATABASE_URL_UNPOOLED");
console.log(`with-demo-env: runtime (DATABASE_URL) -> ${pooled}`);
console.log(`with-demo-env: CLI (DATABASE_URL_UNPOOLED) -> ${direct}`);
'

exec "$@"
