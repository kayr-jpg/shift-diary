# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:22.22-bookworm-slim

# ---- base: node + pinned pnpm (matches root package.json packageManager) ----
FROM ${NODE_IMAGE} AS base
RUN npm install -g corepack@latest && corepack enable && corepack prepare pnpm@12.10.1 --activate
WORKDIR /app

# ---- manifests: only what pnpm needs to resolve the workspace (layer cache) ----
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/

# ---- build: full install (dev deps incl.) and build the web bundle ----
FROM manifests AS build
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY apps/web apps/web
COPY data data
RUN pnpm --filter @shift/web build

# ---- prod-deps: production dependencies of @shift/api only (native better-sqlite3 built here) ----
FROM manifests AS prod-deps
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --prod --filter "@shift/api..."

# ---- runtime ----
FROM ${NODE_IMAGE} AS runtime
ARG VERSION=dev
ARG COMMIT=dev
ENV NODE_ENV=production \
    PORT=8787 \
    DB_PATH=/data/app.db \
    VERSION=${VERSION} \
    COMMIT=${COMMIT}
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY package.json pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/core/src packages/core/src
COPY apps/api/package.json apps/api/
COPY apps/api/src apps/api/src
COPY apps/api/migrations apps/api/migrations
COPY data/trips.json data/trips.json
COPY --from=build /app/apps/web/dist apps/web/dist
# /data is the SQLite volume; a named volume inherits this ownership on first use.
RUN mkdir -p /data && chown node:node /data
USER node
WORKDIR /app/apps/api
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "src/node.ts"]
