#!/bin/sh
set -eu

echo "[entrypoint] NODE_ENV=${NODE_ENV:-}"
echo "[entrypoint] PORT=${PORT:-3000}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] ERROR: DATABASE_URL is not set" >&2
  exit 1
fi

if [ -z "${REDIS_URL:-}" ] && [ -z "${REDIS_PRIVATE_URL:-}" ] && [ -z "${REDISHOST:-}" ] && [ -z "${REDIS_HOST:-}" ]; then
  echo "[entrypoint] ERROR: Redis is not configured" >&2
  echo "[entrypoint] Link a Redis service in Railway (injects REDIS_URL) or set REDIS_URL manually." >&2
  exit 1
fi

# Prefer private URL on Railway when both are present (avoids public proxy + TLS quirks).
if [ -n "${REDIS_PRIVATE_URL:-}" ]; then
  export REDIS_URL="${REDIS_PRIVATE_URL}"
  echo "[entrypoint] Using REDIS_PRIVATE_URL for BullMQ"
elif [ -n "${REDIS_URL:-}" ]; then
  echo "[entrypoint] Using REDIS_URL for BullMQ"
else
  echo "[entrypoint] Using REDISHOST/REDISPORT for BullMQ"
fi

echo "[entrypoint] Running prisma migrate deploy..."
npx prisma migrate deploy

echo "[entrypoint] Starting Nest API..."
exec node apps/api/dist/main.js