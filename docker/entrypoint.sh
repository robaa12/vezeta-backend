#!/usr/bin/env sh
# Container entrypoint: apply pending Prisma migrations, optionally seed the
# Super Admin, then exec the CMD. Skips migrations if SKIP_MIGRATIONS=true
# (e.g. for tests, read-only runs).

set -e

echo "[entrypoint] starting vezeeta-backend"

# Guard against known-insecure default passwords in production.
if [ "${NODE_ENV:-development}" = "production" ]; then
  INSECURE=0
  if [ "${POSTGRES_PASSWORD:-}" = "postgres" ] || [ "${POSTGRES_PASSWORD:-}" = "change-me-in-production" ]; then
    echo "[entrypoint] ************** WARNING **************"
    echo "[entrypoint] POSTGRES_PASSWORD is set to a default/placeholder value."
    echo "[entrypoint] Set a strong password in production."
    echo "[entrypoint] ************************************"
    INSECURE=1
  fi
  if [ "${SEED_ADMIN_PASSWORD:-}" = "ChangeMe123!" ]; then
    echo "[entrypoint] ************** WARNING **************"
    echo "[entrypoint] SEED_ADMIN_PASSWORD is the documented default."
    echo "[entrypoint] Change it before running in production."
    echo "[entrypoint] ************************************"
    INSECURE=1
  fi
  if [ "${INSECURE:-0}" -eq 1 ]; then
    echo "[entrypoint] sleeping 5s for visibility — override defaults to suppress."
    sleep 5
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
