#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${SMOKE_PORT:-3100}"
BASE_URL="http://127.0.0.1:${PORT}"
# Modo remoto (demo-deployment): con SMOKE_BASE_URL (sin barra final) no se
# arranca servidor ni se exige build, .env ni puerto libre; las mismas
# comprobaciones se lanzan contra esa URL.
REMOTE=0
if [[ -n "${SMOKE_BASE_URL:-}" ]]; then
  REMOTE=1
  BASE_URL="${SMOKE_BASE_URL%/}"
fi
DEMO_BANNER_TEXT="Entorno de demostración · datos ficticios"
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
  if [[ "$REMOTE" -eq 0 ]]; then
    echo "Log del servidor: $LOG_FILE" >&2
  fi
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

expect_redirect() {
  local path="$1"
  local expected_code="$2"
  local expected_location="$3"
  shift 3
  local out code location
  out="$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" --max-time 10 "$@" "${BASE_URL}${path}")"
  code="${out%% *}"
  location="${out#* }"
  location="${location#"${BASE_URL}"}"
  location="${location#http://localhost:${PORT}}"
  if [[ "$code" != "$expected_code" || "$location" != "$expected_location" ]]; then
    fail "GET $path: esperado $expected_code -> $expected_location, recibido $code -> $location"
  fi
  echo "OK   GET $path -> $code $location"
}

expect_json_status_ok() {
  local body
  body="$(curl -fsS --max-time 10 "${BASE_URL}/health")" || fail "GET /health no respondió 2xx"
  if ! grep -q '"status":"ok"' <<<"$body"; then
    fail "GET /health no devolvió status ok: $body"
  fi
  echo "OK   GET /health -> 200 status ok"
}

command -v curl >/dev/null 2>&1 || fail "curl no está disponible en PATH"
if [[ "$REMOTE" -eq 1 ]]; then
  echo "Modo remoto: comprobaciones contra ${BASE_URL} (sin servidor local)."
else
  command -v npm >/dev/null 2>&1 || fail "npm no está disponible en PATH"
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
fi

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
# Clientes sin sesión: páginas al login, APIs solo POST y mismo origen. No crea datos.
expect_status GET /panel/clientes 307
expect_status GET /panel/clientes/nuevo 307
for clientes_api in /api/panel/clientes /api/panel/clientes/datos /api/panel/clientes/sedes /api/panel/clientes/contactos; do
  expect_status GET "$clientes_api" 405
done
expect_status POST /api/panel/clientes 403 -H "Origin: http://evil.example"
expect_status POST /api/panel/clientes 307 -H "Origin: ${BASE_URL}"
# Portal de cliente sin sesión: páginas al login con su `next`; la invitación
# al portal es solo POST y de mismo origen. No crea datos.
RANDOM_UUID="00000000-0000-4000-8000-000000000000"
expect_redirect /portal 307 "/login?next=%2Fportal"
expect_redirect "/portal/sedes/${RANDOM_UUID}" 307 "/login?next=%2Fportal%2Fsedes%2F${RANDOM_UUID}"
expect_status GET /api/panel/clientes/portal 405
expect_status POST /api/panel/clientes/portal 403 -H "Origin: http://evil.example"
expect_status POST /api/panel/clientes/portal 307 -H "Origin: ${BASE_URL}"

# Avisos sin sesión: páginas al login, API solo POST y mismo origen. No crea datos.
expect_status GET /panel/avisos 307
expect_status GET /panel/avisos/nuevo 307
expect_status GET /panel/avisos/00000000-0000-4000-8000-000000000000 307
expect_status GET /api/panel/avisos 405
expect_status POST /api/panel/avisos 403 -H "Origin: http://evil.example"
expect_status POST /api/panel/avisos 307 -H "Origin: ${BASE_URL}"

# Franja de demo (demo-deployment). SMOKE_EXPECT_DEMO_BANNER=1 exige la franja
# en / y /login; =0 exige que no aparezca. Sin la variable no se comprueba.
if [[ -n "${SMOKE_EXPECT_DEMO_BANNER:-}" ]]; then
  for banner_path in / /login; do
    banner_body="$(curl -s --max-time 10 "${BASE_URL}${banner_path}")"
    if grep -qF "$DEMO_BANNER_TEXT" <<<"$banner_body"; then
      [[ "$SMOKE_EXPECT_DEMO_BANNER" == "1" ]] \
        || fail "GET ${banner_path}: aparece la franja de demo y no debería"
      echo "OK   GET ${banner_path} con franja de demo"
    else
      [[ "$SMOKE_EXPECT_DEMO_BANNER" != "1" ]] \
        || fail "GET ${banner_path}: falta la franja «${DEMO_BANNER_TEXT}»"
      echo "OK   GET ${banner_path} sin franja de demo"
    fi
  done
fi

# Límite de intentos de login (demo-deployment). SMOKE_RATE_LIMIT=1: 6 POST con
# un email aleatorio inexistente; los 5 primeros error=credenciales y el 6.º
# error=bloqueado, sin cookie. Suma 6 intentos al cupo de la IP (50 en 15 min).
if [[ "${SMOKE_RATE_LIMIT:-}" == "1" ]]; then
  rl_email="smoke-$(date +%s)-${RANDOM}${RANDOM}@demo.invalid"
  echo "Probando límite de intentos con un email inexistente aleatorio..."
  for attempt in 1 2 3 4 5 6; do
    rl_out="$(curl -s -o /dev/null -D - --max-time 10 \
      -H "Origin: ${BASE_URL}" \
      --data-urlencode "email=${rl_email}" \
      --data-urlencode "password=smoke-contrasena-incorrecta" \
      "${BASE_URL}/api/auth/login" | tr -d '\r')"
    rl_code="$(awk 'NR == 1 {print $2}' <<<"$rl_out")"
    rl_location="$(awk -F': ' 'tolower($1) == "location" {print $2}' <<<"$rl_out")"
    if [[ "$attempt" -lt 6 ]]; then
      rl_expected="error=credenciales"
    else
      rl_expected="error=bloqueado"
    fi
    [[ "$rl_code" == "303" && "$rl_location" == *"$rl_expected"* ]] \
      || fail "Login fallido ${attempt}: esperado 303 con ${rl_expected}, recibido ${rl_code} -> ${rl_location}"
    if grep -qi '^set-cookie:' <<<"$rl_out"; then
      fail "Login fallido ${attempt}: no debe devolver Set-Cookie"
    fi
    echo "OK   POST /api/auth/login intento ${attempt} -> 303 ${rl_expected}"
  done
  rl_page="$(curl -s --max-time 10 "${BASE_URL}/login?error=bloqueado")"
  grep -qF "Demasiados intentos. Espera unos minutos y vuelve a intentarlo." <<<"$rl_page" \
    || fail "GET /login?error=bloqueado no muestra el mensaje de bloqueo"
  echo "OK   GET /login?error=bloqueado con mensaje de bloqueo"
fi

# Avisos con sesión (permiso avisos.crear). Con 200 comprueba las tres
# páginas (un id inexistente da el 404 propio); con 403, páginas y POST.
# Nunca envía un POST válido, así que no crea avisos.
check_avisos_access() {
  local jar="$1"
  local status="$2"

  expect_status GET /panel/avisos "$status" -b "$jar"
  expect_status GET /panel/avisos/nuevo "$status" -b "$jar"
  if [[ "$status" == "200" ]]; then
    expect_status GET /panel/avisos/00000000-0000-4000-8000-000000000000 404 -b "$jar"
    expect_status GET /panel/avisos/no-es-uuid 404 -b "$jar"
  else
    expect_status GET /panel/avisos/00000000-0000-4000-8000-000000000000 "$status" -b "$jar"
    expect_status POST /api/panel/avisos 403 -b "$jar" -H "Origin: ${BASE_URL}"
  fi
}

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
  expect_status GET /panel/clientes 403 -b "$COOKIE_JAR"
  expect_status POST /api/panel/clientes 403 -b "$COOKIE_JAR" -H "Origin: ${BASE_URL}"
  check_avisos_access "$COOKIE_JAR" 403
  expect_status POST /api/panel/clientes/portal 403 -b "$COOKIE_JAR" -H "Origin: ${BASE_URL}"
  # El portal es solo para usuarios de cliente.
  expect_status GET /portal 403 -b "$COOKIE_JAR"
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
  expect_status GET /panel/clientes 200 -b "$NORMAL_COOKIE_JAR"
  expect_status GET /panel/clientes/nuevo 200 -b "$NORMAL_COOKIE_JAR"
  check_avisos_access "$NORMAL_COOKIE_JAR" 200
  # Control positivo del patrón que usa la comprobación del usuario de cliente.
  grep -q "href=\"/panel/avisos" <<<"$(curl -s --max-time 10 -b "$NORMAL_COOKIE_JAR" "${BASE_URL}/panel")"     || fail "GET /panel: el administrador no ve el enlace a Avisos"
  echo "OK   GET /panel con enlace a /panel/avisos (administrador)"
  expect_status GET /portal 403 -b "$NORMAL_COOKIE_JAR"
  expect_status GET "/portal/sedes/${RANDOM_UUID}" 403 -b "$NORMAL_COOKIE_JAR"
  # Revoca la sesión para no dejar sesiones activas de verificación.
  expect_status POST /api/auth/logout 303 -b "$NORMAL_COOKIE_JAR" -H "Origin: ${BASE_URL}"
fi

# Roles sin permiso de gestión de usuarios ni de configuración de empresa
# (oficina y técnico). Opcionales.
# El cuarto argumento es el código esperado en /panel/clientes (oficina 200,
# técnico 403).
check_role_without_user_management() {
  local label="$1"
  local email="$2"
  local password="$3"
  local clientes_status="$4"

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
  expect_status GET /panel/clientes "$clientes_status" -b "$ROLE_COOKIE_JAR"
  if [[ "$clientes_status" == "403" ]]; then
    expect_status POST /api/panel/clientes 403 -b "$ROLE_COOKIE_JAR" -H "Origin: ${BASE_URL}"
    expect_status POST /api/panel/clientes/portal 403 -b "$ROLE_COOKIE_JAR" -H "Origin: ${BASE_URL}"
  fi
  # Avisos sigue la misma matriz que clientes (oficina 200, técnico 403).
  check_avisos_access "$ROLE_COOKIE_JAR" "$clientes_status"
  expect_status GET /portal 403 -b "$ROLE_COOKIE_JAR"
  expect_status POST /api/auth/logout 303 -b "$ROLE_COOKIE_JAR" -H "Origin: ${BASE_URL}"
}

if [[ -n "${SMOKE_OFICINA_EMAIL:-}" || -n "${SMOKE_OFICINA_PASSWORD:-}" ]]; then
  [[ -n "${SMOKE_OFICINA_EMAIL:-}" && -n "${SMOKE_OFICINA_PASSWORD:-}" ]] \
    || fail "Define SMOKE_OFICINA_EMAIL y SMOKE_OFICINA_PASSWORD juntos"
  check_role_without_user_management "oficina" "$SMOKE_OFICINA_EMAIL" "$SMOKE_OFICINA_PASSWORD" 200
fi

if [[ -n "${SMOKE_TECNICO_EMAIL:-}" || -n "${SMOKE_TECNICO_PASSWORD:-}" ]]; then
  [[ -n "${SMOKE_TECNICO_EMAIL:-}" && -n "${SMOKE_TECNICO_PASSWORD:-}" ]] \
    || fail "Define SMOKE_TECNICO_EMAIL y SMOKE_TECNICO_PASSWORD juntos"
  check_role_without_user_management "técnico" "$SMOKE_TECNICO_EMAIL" "$SMOKE_TECNICO_PASSWORD" 403
fi

# Usuario de cliente (portal). Opcional: requiere un contacto invitado que ya
# haya activado su cuenta. No crea datos.
if [[ -n "${SMOKE_CLIENTE_EMAIL:-}" || -n "${SMOKE_CLIENTE_PASSWORD:-}" ]]; then
  [[ -n "${SMOKE_CLIENTE_EMAIL:-}" && -n "${SMOKE_CLIENTE_PASSWORD:-}" ]] \
    || fail "Define SMOKE_CLIENTE_EMAIL y SMOKE_CLIENTE_PASSWORD juntos"

  echo "Probando login de usuario de cliente..."
  rm -f "$ROLE_COOKIE_JAR"
  code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    -c "$ROLE_COOKIE_JAR" \
    -H "Origin: ${BASE_URL}" \
    --data-urlencode "email=${SMOKE_CLIENTE_EMAIL}" \
    --data-urlencode "password=${SMOKE_CLIENTE_PASSWORD}" \
    "${BASE_URL}/api/auth/login")"
  [[ "$code" == "303" ]] || fail "Login usuario de cliente: esperado 303, recibido $code"

  expect_status GET /portal 200 -b "$ROLE_COOKIE_JAR"
  expect_redirect /panel 307 /portal -b "$ROLE_COOKIE_JAR"
  expect_status GET /panel/clientes 403 -b "$ROLE_COOKIE_JAR"
  expect_status GET /panel/usuarios 403 -b "$ROLE_COOKIE_JAR"
  # Avisos de oficina: páginas y POST 403, igual que el resto de /panel/*.
  check_avisos_access "$ROLE_COOKIE_JAR" 403
  # Ninguna navegación (portal ni 403 del panel) ofrece «Avisos».
  for nav_path in /portal /panel/avisos; do
    nav_body="$(curl -s --max-time 10 -b "$ROLE_COOKIE_JAR" "${BASE_URL}${nav_path}")"
    if grep -q "href=\"/panel/avisos" <<<"$nav_body"; then
      fail "GET ${nav_path}: el usuario de cliente ve el enlace a Avisos"
    fi
    echo "OK   GET ${nav_path} sin enlace a /panel/avisos"
  done
  expect_status GET /panel/empresa 403 -b "$ROLE_COOKIE_JAR"
  expect_status GET /superadmin 403 -b "$ROLE_COOKIE_JAR"
  # Sede inexistente (o de otro cliente): 403 uniforme del portal.
  expect_status GET "/portal/sedes/${RANDOM_UUID}" 403 -b "$ROLE_COOKIE_JAR"
  expect_status GET /portal/sedes/no-es-un-uuid 403 -b "$ROLE_COOKIE_JAR"
  expect_status POST /api/panel/clientes 403 -b "$ROLE_COOKIE_JAR" -H "Origin: ${BASE_URL}"
  expect_status POST /api/panel/clientes/portal 403 -b "$ROLE_COOKIE_JAR" -H "Origin: ${BASE_URL}"
  expect_status POST /api/panel/usuarios/roles 403 -b "$ROLE_COOKIE_JAR" -H "Origin: ${BASE_URL}"
  expect_status POST /api/auth/logout 303 -b "$ROLE_COOKIE_JAR" -H "Origin: ${BASE_URL}"
fi

echo "Smoke HTTP completado correctamente."
