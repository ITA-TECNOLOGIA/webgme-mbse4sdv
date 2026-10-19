# MBSE4SDV WebGME application
# Build:  docker build -t mbse4sdv-webgme .
# Run it with docker compose from the repository root (it needs MongoDB).

# ---- build stage --------------------------------------------------------------------------------
FROM node:20-bookworm-slim AS build

# git is needed by bower (client libraries of webgme-codeeditor)
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN chown node:node /app
# bower refuses to run as root
USER node

# Dependencies first (better layer caching). postinstall applies patches/ and rebuilds the WebGME client bundle.
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node patches ./patches
COPY --chown=node:node scripts/build-webgme-dist.js ./scripts/build-webgme-dist.js
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY --chown=node:node . .

# ---- runtime stage --------------------------------------------------------------------------------
FROM node:20-bookworm-slim

ENV NODE_ENV=default \
    PORT=8888 \
    LOG_TO_FILES=false \
    JWT_PRIVATE_KEY=/data/token_keys/private_key \
    JWT_PUBLIC_KEY=/data/token_keys/public_key

WORKDIR /app
COPY --from=build --chown=node:node /app /app

# Persistent data: JWT keys and blob storage (models are stored in MongoDB)
RUN mkdir -p /data/token_keys /app/blob-local-storage \
    && chown node:node /app \
    && chown -R node:node /data /app/blob-local-storage
VOLUME ["/data", "/app/blob-local-storage"]

USER node
EXPOSE 8888

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/mbse4sdv/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Initialise (keys, admin user, example project) and start the server
CMD ["sh", "-c", "node scripts/docker/init.js && exec node app.js"]
