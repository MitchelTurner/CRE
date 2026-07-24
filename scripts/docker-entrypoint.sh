#!/bin/sh
set -eu

echo "[entrypoint] NODE_ENV=${NODE_ENV:-}"
echo "[entrypoint] PORT=${PORT:-3000}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] ERROR: DATABASE_URL is not set" >&2
  exit 1
fi

if [ -z "${REDIS_URL:-}" ] && [ -z "${REDIS_PRIVATE_URL:-}" ]; then
  echo "[entrypoint] ERROR: REDIS_URL (or REDIS_PRIVATE_URL) is not set" >&2
  echo "[entrypoint] Link a Redis service in Railway or set REDIS_URL manually." >&2
  exit 1
fi

echo "[entrypoint] Running prisma migrate deploy..."
npx prisma migrate deploy

echo "[entrypoint] Starting Nest API..."
exec node apps/api/dist/main.js