#!/usr/bin/env sh
# Container entrypoint: apply pending Prisma migrations, optionally seed the
# Super Admin, then exec the CMD. Skips migrations if SKIP_MIGRATIONS=true
# (e.g. for tests, read-only runs).

set -e

echo "[entrypoint] starting vezeeta-backend"

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
