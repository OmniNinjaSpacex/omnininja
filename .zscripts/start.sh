#!/usr/bin/env sh
set -eu

BUILD_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$BUILD_DIR"

export NODE_ENV=production
export HOSTNAME="${HOSTNAME:-0.0.0.0}"
export PORT="${PORT:-3000}"

node next-service-dist/server.js &
NEXT_PID=$!

cleanup() {
  kill -TERM "$NEXT_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

exec caddy run --config Caddyfile --adapter caddyfile
