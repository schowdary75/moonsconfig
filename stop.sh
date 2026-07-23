#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ENV_FILE="${ROOT_DIR}/.env"

if [[ -t 1 ]]; then
  GREEN=$'\033[1;32m'
  RED=$'\033[1;31m'
  RESET=$'\033[0m'
else
  GREEN=""
  RED=""
  RESET=""
fi

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

cd "${ROOT_DIR}"

command -v docker >/dev/null 2>&1 || fail "Docker is not installed."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is unavailable."

if ! docker info >/dev/null 2>&1; then
  printf 'Docker is not running, so MooNsConfig is already stopped.\n'
  exit 0
fi

printf 'Stopping MooNsConfig...\n'
if [[ -f "${ENV_FILE}" ]]; then
  docker compose --env-file "${ENV_FILE}" down --remove-orphans
else
  # Compose validates required substitutions even for `down`. These temporary
  # values are used only to locate and stop the existing project.
  TENANT_CREDENTIAL_ENCRYPTION_KEY=stop-only \
    JWT_ACCESS_SECRET=stop-only \
    docker compose down --remove-orphans
fi

printf '%sOK%s MooNsConfig is stopped. Databases, uploads, and Redis data were preserved.\n' \
  "${GREEN}" "${RESET}"
printf 'Run ./start.sh whenever you want to start it again.\n'
