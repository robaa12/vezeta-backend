# syntax=docker/dockerfile:1.7
# ---------- Stage 1: deps + build ----------
FROM node:22-bookworm-slim AS builder

ENV NODE_ENV=development \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

# Install OS deps for Prisma + native modules
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Install all dependencies (including dev)
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Copy sources and prisma config
COPY tsconfig.json tsconfig.build.json nest-cli.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

# Generate Prisma client (needed at build time for the runtime reference)
RUN npx prisma generate

# Compile TypeScript -> dist/
RUN npm run build

# Prune dev dependencies to keep only prod deps for the runner image
RUN npm prune --omit=dev

# ---------- Stage 2: runtime ----------
FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production \
    PORT=3000 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

# Install OS deps for runtime (openssl is required by Prisma engines)
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates dumb-init wget \
 && rm -rf /var/lib/apt/lists/*

# Copy production node_modules and build artifacts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Copy entrypoint script
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Create a non-root user and own the app dir
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nestjs \
 && chown -R nestjs:nodejs /app
USER nestjs

EXPOSE 3000

# Healthcheck hits the /api/health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["dumb-init", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/src/main.js"]
