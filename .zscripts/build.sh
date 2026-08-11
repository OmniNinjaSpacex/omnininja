#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/home/z/my-project"
BUILD_DIR="/tmp/build_fullstack_${BUILD_ID:?BUILD_ID is required}"

cd "$PROJECT_DIR"
export NEXT_TELEMETRY_DISABLED=1
export DATABASE_URL="${DATABASE_URL:-postgresql://build:build@127.0.0.1:5432/build}"

npm ci --no-audit --no-fund
npm run db:generate
npm run build

mkdir -p "$BUILD_DIR"
cp -a .next/standalone/. "$BUILD_DIR/next-service-dist/"
cp Caddyfile "$BUILD_DIR/Caddyfile"
cp .zscripts/start.sh "$BUILD_DIR/start.sh"
chmod +x "$BUILD_DIR/start.sh"

tar -C "$BUILD_DIR" -czf "${BUILD_DIR}.tar.gz" .
