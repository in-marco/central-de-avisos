#!/usr/bin/env bash
set -euo pipefail

REQUIRED_FILES=(
  "AGENTS.md"
  "PROGRESS.md"
  "feature_list.json"
  "CONTEXT.md"
  "docs/build-brief.md"
  "docs/domain-model.md"
  "docs/risks-and-open-questions.md"
)

echo "Repository: $(pwd)"

for file in "${REQUIRED_FILES[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing required file: $file" >&2
    exit 1
  fi
done

# En Windows, npm puede no estar en el PATH heredado de Git Bash.
if ! command -v npm >/dev/null 2>&1 && [[ -d "/c/Program Files/nodejs" ]]; then
  export PATH="/c/Program Files/nodejs:$PATH"
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm no está disponible. Instala Node.js LTS y añade npm al PATH." >&2
  exit 1
fi

echo "Node: $(node --version)"
echo "npm:  $(npm --version)"

if [[ ! -d node_modules ]]; then
  if [[ -f package-lock.json ]]; then
    echo "Instalando dependencias con npm ci..."
    npm ci
  else
    echo "Instalando dependencias con npm install..."
    npm install
  fi
else
  echo "Dependencias ya instaladas (node_modules existe)."
fi

echo
echo "==> npm run db:generate"
npm run db:generate
echo
echo "==> npm run lint"
npm run lint
echo
echo "==> npm run typecheck"
npm run typecheck
echo
echo "==> npm test"
npm test
echo
echo "==> npm run build"
npm run build

echo
echo "Verificación completada."
echo "Base de datos (opcional, requiere PostgreSQL accesible):"
echo "  1. Copia .env.example a .env y ajusta DATABASE_URL y SEED_*."
echo "  2. npm run db:deploy   # aplica migraciones"
echo "  3. npm run db:status   # comprueba el historial"
echo "  4. npm run test:db     # tests de integración reales"
echo "  5. npm run db:seed     # datos demo locales (idempotente, no en producción)"
echo "Para desarrollo manual: npm run dev"
echo "  Home:   http://localhost:3000/"
echo "  Login:  http://localhost:3000/login"
echo "  Panel:  http://localhost:3000/panel (requiere sesión)"
echo "  Usuarios: http://localhost:3000/panel/usuarios (solo administrador)"
echo "  Empresa: http://localhost:3000/panel/empresa (solo administrador)"
echo "  Clientes: http://localhost:3000/panel/clientes (administrador y oficina)"
echo "  Avisos: http://localhost:3000/panel/avisos (administrador y oficina)"
echo "  Superadmin: http://localhost:3000/superadmin (solo proveedor)"
echo "  Salud:  http://localhost:3000/health"
