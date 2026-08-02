#!/usr/bin/env sh
# Container entrypoint: apply pending Prisma migrations, optionally seed the
# Super Admin, then exec the CMD. Skips migrations if SKIP_MIGRATIONS=true
# (e.g. for tests, read-only runs).

set -e

echo "[entrypoint] starting vezeeta-backend"

# Refuse known-insecure credentials in production rather than starting a
# database-backed service that exposes authentication data.
if [ "${NODE_ENV:-development}" = "production" ]; then
  if [ "${POSTGRES_PASSWORD:-}" = "postgres" ] || [ "${POSTGRES_PASSWORD:-}" = "change-me-in-production" ]; then
    echo "[entrypoint] POSTGRES_PASSWORD must not use a default/placeholder value in production."
    exit 1
  fi
  if [ "${SEED_ADMIN_PASSWORD:-}" = "ChangeMe123!" ]; then
    echo "[entrypoint] SEED_ADMIN_PASSWORD must not use the documented default in production."
    exit 1
  fi
fi

if [ "${SKIP_MIGRATIONS:-false}" != "true" ]; then
  echo "[entrypoint] applying database migrations..."
  npx prisma migrate deploy
else
  echo "[entrypoint] SKIP_MIGRATIONS=true, skipping migrations"
fi

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "[entrypoint] running super admin seed..."
  if [ -f dist/src/seed/seed.js ]; then
    node dist/src/seed/seed.js || echo "[entrypoint] seed failed (continuing)"
  else
    echo "[entrypoint] compiled seed not found, falling back to npm run db:seed"
    npm run db:seed || echo "[entrypoint] seed failed (continuing)"
  fi
fi

echo "[entrypoint] launching: $@"
exec "$@"
