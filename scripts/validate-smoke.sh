#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${SMOKE_PORT:-3100}"
BASE_URL="http://127.0.0.1:${PORT}"
LOG_FILE="${TMPDIR:-/tmp}/central-de-avisos-smoke.log"
COOKIE_JAR="${TMPDIR:-/tmp}/central-de-avisos-smoke.cookies"
NORMAL_COOKIE_JAR="${TMPDIR:-/tmp}/central-de-avisos-smoke-normal.cookies"
ROLE_COOKIE_JAR="${TMPDIR:-/tmp}/central-de-avisos-smoke-role.cookies"
SERVER_PID=""
KEEP_LOG=0

kill_tree() {
  local pid="$1"
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
      taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true
      ;;
    *)
      local child
      if command -v pgrep >/dev/null 2>&1; then
        for child in $(pgrep -P "$pid" 2>/dev/null || true); do
          kill_tree "$child"
        done
      fi
      kill "$pid" 2>/dev/null || true
      ;;
  esac
}

kill_port_fallback() {
  local port="$1"
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
      if command -v netstat >/dev/null 2>&1; then
        local pid
        for pid in $(netstat -ano | awk -v p=":${port}" '$2 ~ p && $4 == "LISTENING" {print $5}' | sort -u); do
          [[ "$pid" == "0" ]] && continue
          taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true
        done
      fi
      ;;
    *)
      if command -v lsof >/dev/null 2>&1; then
        local pid
        for pid in $(lsof -ti "tcp:${port}" 2>/dev/null || true); do
          kill "$pid" 2>/dev/null || true
        done
      fi
      ;;
  esac
}

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill_tree "$SERVER_PID"
    kill_port_fallback "$PORT"
  fi
  rm -f "$COOKIE_JAR" "$NORMAL_COOKIE_JAR" "$ROLE_COOKIE_JAR"
  if [[ "$KEEP_LOG" -eq 0 ]]; then
    rm -f "$LOG_FILE"
  fi
}
trap cleanup EXIT INT TERM

fail() {
  KEEP_LOG=1
  echo "FALLO: $*" >&2
  echo "Log del servidor: $LOG_FILE" >&2
  exit 1
}

expect_status() {
  local method="$1"
  local path="$2"
  local expected="$3"
  shift 3
  local code
  code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -X "$method" "$@" "${BASE_URL}${path}")"
  if [[ "$code" != "$expected" ]]; then
    fail "$method $path: esperado $expected, recibido $code"
  fi
  echo "OK   $method $path -> $code"
}

expect_json_status_ok() {
  local body
  body="$(curl -fsS --max-time 10 "${BASE_URL}/health")" || fail "GET /health no respondió 2xx"
  if ! grep -q '"status":"ok"' <<<"$body"; then
    fail "GET /health no devolvió status ok: $body"
  fi
  echo "OK   GET /health -> 200 status ok"
}

command -v npm >/dev/null 2>&1 || fail "npm no está disponible en PATH"
command -v curl >/dev/null 2>&1 || fail "curl no está disponible en PATH"
[[ -f .next/BUILD_ID ]] || fail "Falta el build de producción; ejecuta npm run build antes"
if [[ -z "${DATABASE_URL:-}" && ! -f .env ]]; then
  fail "DATABASE_URL no está configurada y no existe .env"
fi
if curl -s -o /dev/null --max-time 1 "${BASE_URL}/health"; then
  fail "El puerto ${PORT} ya está en uso; detén el servidor anterior y reintenta"
fi

echo "Iniciando next start en ${BASE_URL}..."
npm run start -- -p "$PORT" >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

ready=0
for _ in $(seq 1 30); do
  if curl -fsS --max-time 1 "${BASE_URL}/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    break
  fi
  sleep 1
done
if [[ "$ready" -ne 1 ]]; then
  fail "next start no estuvo listo en 30 s"
fi

echo "Servidor listo (PID $SERVER_PID)"

expect_status GET / 200
expect_json_status_ok
expect_status GET /login 200
expect_status GET /panel 307
expect_status GET /superadmin 307
expect_status GET /api/auth/login 405
expect_status GET /api/superadmin/empresas 405
expect_status GET /api/superadmin/planes 405
expect_status POST /api/superadmin/empresas 307 -H "Origin: ${BASE_URL}"
# Invitación: token bien formado pero inexistente, endpoint solo POST y
# mismo origen. No crea datos.
expect_status GET "/invitacion/$(printf 'x%.0s' $(seq 1 43))" 404
expect_status GET /api/invitaciones/aceptar 405
# Regresión: con Referrer-Policy no-referrer el navegador envía Origin: null en
# el POST del formulario y la aceptación falla con 403.
referrer_policy="$(curl -s -D - -o /dev/null --max-time 10 "${BASE_URL}/invitacion/$(printf 'x%.0s' $(seq 1 43))" | tr -d '\r' | awk -F': ' 'tolower($1) == "referrer-policy" {print $2}')"
[[ "$referrer_policy" == "same-origin" ]] || fail "Referrer-Policy de /invitacion: esperado same-origin, recibido ${referrer_policy:-ninguna}"
echo "OK   Referrer-Policy de /invitacion -> same-origin"
expect_status POST /api/invitaciones/aceptar 403 -H "Origin: http://evil.example"
# Permisos por rol: sin sesión, página y API de usuarios. No crea datos.
expect_status GET /panel/usuarios 307
expect_status GET /api/panel/usuarios/roles 405
expect_status POST /api/panel/usuarios/roles 403 -H "Origin: http://evil.example"
expect_status POST /api/panel/usuarios/roles 307 -H "Origin: ${BASE_URL}"
# Configuración de empresa: sin sesión, página y API. Ningún POST es válido,
# así que no muta datos.
expect_status GET /panel/empresa 307
expect_status GET /api/panel/empresa 405
expect_status POST /api/panel/empresa 403 -H "Origin: http://evil.example"
expect_status POST /api/panel/empresa 307 -H "Origin: ${BASE_URL}"

if [[ -n "${SMOKE_EMAIL:-}" || -n "${SMOKE_PASSWORD:-}" ]]; then
  [[ -n "${SMOKE_EMAIL:-}" && -n "${SMOKE_PASSWORD:-}" ]] \
    || fail "Define SMOKE_EMAIL y SMOKE_PASSWORD juntos"

  echo "Probando login de superadmin..."
  code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    -c "$COOKIE_JAR" \
    -H "Origin: ${BASE_URL}" \
    --data-urlencode "email=${SMOKE_EMAIL}" \
    --data-urlencode "password=${SMOKE_PASSWORD}" \
    "${BASE_URL}/api/auth/login")"
  [[ "$code" == "303" ]] || fail "Login superadmin: esperado 303, recibido $code"

  expect_status GET /panel 200 -b "$COOKIE_JAR"
  expect_status GET /superadmin 200 -b "$COOKIE_JAR"
  expect_status GET /superadmin/empresas 200 -b "$COOKIE_JAR"
  expect_status GET /api/superadmin/empresas 405 -b "$COOKIE_JAR"
  # El superadmin no tiene permisos de empresa.
  expect_status GET /panel/usuarios 403 -b "$COOKIE_JAR"
  expect_status POST /api/panel/usuarios/roles 403 -b "$COOKIE_JAR" -H "Origin: ${BASE_URL}"
  expect_status GET /panel/empresa 403 -b "$COOKIE_JAR"
  expect_status POST /api/panel/empresa 403 -b "$COOKIE_JAR" -H "Origin: ${BASE_URL}"
  expect_status POST /api/auth/logout 303 -b "$COOKIE_JAR" -H "Origin: ${BASE_URL}"
  expect_status GET /panel 307
fi

if [[ -n "${SMOKE_NORMAL_EMAIL:-}" || -n "${SMOKE_NORMAL_PASSWORD:-}" ]]; then
  [[ -n "${SMOKE_NORMAL_EMAIL:-}" && -n "${SMOKE_NORMAL_PASSWORD:-}" ]] \
    || fail "Define SMOKE_NORMAL_EMAIL y SMOKE_NORMAL_PASSWORD juntos"

  echo "Probando login de usuario de empresa..."
  code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    -c "$NORMAL_COOKIE_JAR" \
    -H "Origin: ${BASE_URL}" \
    --data-urlencode "email=${SMOKE_NORMAL_EMAIL}" \
    --data-urlencode "password=${SMOKE_NORMAL_PASSWORD}" \
    "${BASE_URL}/api/auth/login")"
  [[ "$code" == "303" ]] || fail "Login usuario normal: esperado 303, recibido $code"

  expect_status GET /panel 200 -b "$NORMAL_COOKIE_JAR"
  expect_status GET /superadmin/empresas 403 -b "$NORMAL_COOKIE_JAR"
  expect_status POST /api/superadmin/empresas 403 -b "$NORMAL_COOKIE_JAR" -H "Origin: ${BASE_URL}"
  # SMOKE_NORMAL_* debe ser un administrador de empresa.
  expect_status GET /panel/usuarios 200 -b "$NORMAL_COOKIE_JAR"
  expect_status GET /panel/empresa 200 -b "$NORMAL_COOKIE_JAR"
  # Revoca la sesión para no dejar sesiones activas de verificación.
  expect_status POST /api/auth/logout 303 -b "$NORMAL_COOKIE_JAR" -H "Origin: ${BASE_URL}"
fi

# Roles sin permiso de gestión de usuarios (oficina y técnico). Opcionales.
check_role_without_user_management() {
  local label="$1"
  local email="$2"
  local password="$3"

  echo "Probando login de ${label}..."
  rm -f "$ROLE_COOKIE_JAR"
  code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    -c "$ROLE_COOKIE_JAR" \
    -H "Origin: ${BASE_URL}" \
    --data-urlencode "email=${email}" \
    --data-urlencode "password=${password}" \
    "${BASE_URL}/api/auth/login")"
  [[ "$code" == "303" ]] || fail "Login ${label}: esperado 303, recibido $code"

  expect_status GET /panel 200 -b "$ROLE_COOKIE_JAR"
  expect_status GET /panel/usuarios 403 -b "$ROLE_COOKIE_JAR"
  expect_status POST /api/panel/usuarios/roles 403 -b "$ROLE_COOKIE_JAR" -H "Origin: ${BASE_URL}"
  expect_status GET /panel/empresa 403 -b "$ROLE_COOKIE_JAR"
  expect_status POST /api/panel/empresa 403 -b "$ROLE_COOKIE_JAR" -H "Origin: ${BASE_URL}"
  expect_status POST /api/auth/logout 303 -b "$ROLE_COOKIE_JAR" -H "Origin: ${BASE_URL}"
}

if [[ -n "${SMOKE_OFICINA_EMAIL:-}" || -n "${SMOKE_OFICINA_PASSWORD:-}" ]]; then
  [[ -n "${SMOKE_OFICINA_EMAIL:-}" && -n "${SMOKE_OFICINA_PASSWORD:-}" ]] \
    || fail "Define SMOKE_OFICINA_EMAIL y SMOKE_OFICINA_PASSWORD juntos"
  check_role_without_user_management "oficina" "$SMOKE_OFICINA_EMAIL" "$SMOKE_OFICINA_PASSWORD"
fi

if [[ -n "${SMOKE_TECNICO_EMAIL:-}" || -n "${SMOKE_TECNICO_PASSWORD:-}" ]]; then
  [[ -n "${SMOKE_TECNICO_EMAIL:-}" && -n "${SMOKE_TECNICO_PASSWORD:-}" ]] \
    || fail "Define SMOKE_TECNICO_EMAIL y SMOKE_TECNICO_PASSWORD juntos"
  check_role_without_user_management "técnico" "$SMOKE_TECNICO_EMAIL" "$SMOKE_TECNICO_PASSWORD"
fi

echo "Smoke HTTP completado correctamente."
