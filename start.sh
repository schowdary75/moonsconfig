#!/usr/bin/env bash

set -Eeuo pipefail

APP_NAME="MooNsConfig"
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ENV_FILE="${ROOT_DIR}/.env"
FOLLOW_LOGS=true
BUILD_IMAGES=true
START_TIMEOUT="${MOONSCONFIG_START_TIMEOUT:-600}"

if [[ -t 1 ]]; then
  BLUE=$'\033[1;34m'
  GREEN=$'\033[1;32m'
  YELLOW=$'\033[1;33m'
  RED=$'\033[1;31m'
  RESET=$'\033[0m'
else
  BLUE=""
  GREEN=""
  YELLOW=""
  RED=""
  RESET=""
fi

info() {
  printf '%s==>%s %s\n' "${BLUE}" "${RESET}" "$*"
}

success() {
  printf '%sOK%s %s\n' "${GREEN}" "${RESET}" "$*"
}

warn() {
  printf '%s!%s %s\n' "${YELLOW}" "${RESET}" "$*" >&2
}

pause_on_error() {
  if [[ -t 0 ]]; then
    printf '\n'
    read -r -p "Press Enter to close this window..." _unused
  fi
}

fail() {
  printf '%sError:%s %s\n' "${RED}" "${RESET}" "$*" >&2
  pause_on_error
  exit 1
}

show_help() {
  cat <<'EOF'
Usage: ./start.sh [options]

Build and start the complete MooNsConfig stack with Docker.

Options:
  --no-build   Start existing images without rebuilding them.
  --no-logs    Return after startup instead of following live logs.
  -h, --help   Show this help.

By default the script stays open and follows application logs. Press Ctrl+C to
leave the log viewer; the application keeps running until you run ./stop.sh.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build)
      BUILD_IMAGES=false
      ;;
    --no-logs)
      FOLLOW_LOGS=false
      ;;
    -h | --help)
      show_help
      exit 0
      ;;
    *)
      fail "Unknown option: $1. Run ./start.sh --help for supported options."
      ;;
  esac
  shift
done

if [[ ! "${START_TIMEOUT}" =~ ^[1-9][0-9]*$ ]]; then
  fail "MOONSCONFIG_START_TIMEOUT must be a positive number of seconds."
fi

cd "${ROOT_DIR}"

compose() {
  docker compose --env-file "${ENV_FILE}" "$@"
}

show_failure_context() {
  local exit_code="$1"
  local line_number="$2"
  trap - ERR
  printf '\n%sStartup stopped%s near line %s (exit code %s).\n' \
    "${RED}" "${RESET}" "${line_number}" "${exit_code}" >&2
  if [[ -f "${ENV_FILE}" ]] && docker info >/dev/null 2>&1; then
    compose ps 2>/dev/null || true
    printf '\nRecent service logs:\n' >&2
    compose logs --tail 60 api worker client nginx 2>/dev/null || true
  fi
  pause_on_error
  exit "${exit_code}"
}

trap 'show_failure_context "$?" "$LINENO"' ERR

command -v docker >/dev/null 2>&1 || fail \
  "Docker is not installed. Install Docker Desktop (Windows/macOS) or Docker Engine with the Compose plugin (Linux), then run ./start.sh again."

docker compose version >/dev/null 2>&1 || fail \
  "Docker Compose v2 is unavailable. Update Docker Desktop or install the Docker Compose plugin."

docker info >/dev/null 2>&1 || fail \
  "Docker is installed but not running. Start Docker Desktop or the Docker service, wait until it is ready, and try again."

success "Docker is ready."

docker_with_native_paths() {
  case "$(uname -s 2>/dev/null || true)" in
    MINGW* | MSYS* | CYGWIN*)
      MSYS_NO_PATHCONV=1 docker "$@"
      ;;
    *)
      docker "$@"
      ;;
  esac
}

if [[ ! -f "${ENV_FILE}" ]]; then
  info "Creating a private local configuration with unique passwords and signing keys..."

  mount_root="${ROOT_DIR}"
  container_user_args=()
  case "$(uname -s 2>/dev/null || true)" in
    MINGW* | MSYS* | CYGWIN*)
      if command -v pwd >/dev/null 2>&1; then
        mount_root="$(pwd -W)"
      fi
      ;;
    *)
      if command -v id >/dev/null 2>&1; then
        container_user_args=(--user "$(id -u):$(id -g)")
      fi
      ;;
  esac

  # Node is run inside Docker so the host does not need Node or npm.
  docker_with_native_paths run --rm \
    "${container_user_args[@]}" \
    --volume "${mount_root}:/workspace" \
    --workdir /workspace \
    node:24-alpine \
    node scripts/setup-local-env.mjs

  chmod 600 "${ENV_FILE}" 2>/dev/null || true
  success "Created .env. It is ignored by Git and stays on this computer."
else
  success "Using the existing private .env configuration."
fi

info "Validating the Docker configuration..."
compose config --quiet
success "Docker configuration is valid."

info "Installing and starting Node 24, MySQL 8.4, Redis 7.4, Nginx, the API, worker, and web app..."
if [[ "${BUILD_IMAGES}" == "true" ]]; then
  compose up --build --detach --remove-orphans
else
  compose up --detach --remove-orphans
fi

service_status() {
  local service="$1"
  local container_id
  container_id="$(compose ps -q "${service}" 2>/dev/null | head -n 1)"
  if [[ -z "${container_id}" ]]; then
    printf 'missing'
    return
  fi
  docker inspect \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
    "${container_id}" 2>/dev/null || printf 'unknown'
}

wait_for_service() {
  local service="$1"
  local label="$2"
  local started_at="${SECONDS}"
  local status

  info "Waiting for ${label}..."
  while ((SECONDS - started_at < START_TIMEOUT)); do
    status="$(service_status "${service}")"
    case "${status}" in
      healthy | running)
        success "${label} is ready."
        return 0
        ;;
      unhealthy | exited | dead)
        warn "${label} entered state '${status}'."
        compose logs --tail 100 "${service}" || true
        return 1
        ;;
    esac
    sleep 3
  done

  warn "Timed out after ${START_TIMEOUT}s while waiting for ${label}."
  compose logs --tail 100 "${service}" || true
  return 1
}

wait_for_service mysql "MySQL"
wait_for_service redis "Redis"
wait_for_service api "API and database migrations"
wait_for_service worker "Background worker"
wait_for_service client "Web application"
wait_for_service nginx "MooNsConfig gateway"

read_env_value() {
  local key="$1"
  awk -v wanted="${key}" '
    index($0, wanted "=") == 1 {
      sub(/^[^=]*=/, "")
      print
      exit
    }
  ' "${ENV_FILE}"
}

admin_email="$(read_env_value ADMIN_EMAIL)"
admin_password="$(read_env_value ADMIN_PASSWORD)"
admin_name="$(read_env_value ADMIN_NAME)"

[[ -n "${admin_email}" ]] || fail "ADMIN_EMAIL is missing from .env."
[[ -n "${admin_password}" ]] || fail "ADMIN_PASSWORD is missing from .env."

info "Creating the initial local administrator and role permissions..."
compose exec -T \
  -e "ADMIN_EMAIL=${admin_email}" \
  -e "ADMIN_PASSWORD=${admin_password}" \
  -e "ADMIN_NAME=${admin_name:-System Administrator}" \
  api npm run prisma:seed
success "Administrator and permissions are ready."

printf '\n%s%s is running.%s\n\n' "${GREEN}" "${APP_NAME}" "${RESET}"
printf '  Application:  http://localhost:8080\n'
printf '  API health:   http://localhost:8080/api/v1/health\n'
printf '  API docs:     http://localhost:8080/api/docs\n\n'
printf '  Initial administrator (valid until you change it):\n'
printf '    Email:      %s\n' "${admin_email}"
printf '    Password:   %s\n\n' "${admin_password}"
printf '  Configuration and data stay on this computer.\n'
printf '  Run ./stop.sh to stop the application without deleting data.\n\n'

compose ps

if [[ "${FOLLOW_LOGS}" != "true" ]]; then
  success "Startup complete. The containers will keep running in the background."
  exit 0
fi

printf '\n%sLive logs are below.%s Press Ctrl+C to leave the log viewer.\n' "${BLUE}" "${RESET}"
printf 'The application will keep running; use ./stop.sh when you want to stop it.\n\n'

trap - ERR
set +e
compose logs --tail 80 --follow api worker client nginx
logs_exit=$?
set -e

if [[ "${logs_exit}" -ne 0 && "${logs_exit}" -ne 130 ]]; then
  warn "The log viewer ended with exit code ${logs_exit}; the application is still running."
else
  success "Log viewer closed. MooNsConfig is still running in Docker."
fi
printf 'Run ./stop.sh to stop it.\n'
