# syntax=docker/dockerfile:1.7
#
# Multi-stage build для apps/miniapp (Next.js 16 standalone, Telegram Mini App).
# Деплоится через Timeweb App Platform / docker-compose.prod.yml:
#   context = root монорепо, dockerfile = apps/miniapp/Dockerfile.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# ===== deps =====
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/admin/package.json ./apps/admin/
COPY apps/api/package.json ./apps/api/
COPY apps/miniapp/package.json ./apps/miniapp/
COPY apps/workers/ingest/package.json ./apps/workers/ingest/
COPY apps/workers/pipeline/package.json ./apps/workers/pipeline/
COPY packages/agents/package.json ./packages/agents/
COPY packages/config/package.json ./packages/config/
COPY packages/db/package.json ./packages/db/
COPY packages/ui/package.json ./packages/ui/
COPY packages/voice/package.json ./packages/voice/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @x10/miniapp...

# ===== builder =====
FROM deps AS builder
COPY apps/miniapp ./apps/miniapp
COPY packages ./packages
# tsconfig.json наследует ../../tsconfig.base.json — без корневого файла
# `next build` (Turbopack) падает «extends doesn't resolve correctly».
COPY tsconfig.base.json ./
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/apps/miniapp
RUN pnpm exec next build

# ===== runner =====
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/apps/miniapp/.next/standalone ./
COPY --from=builder /app/apps/miniapp/.next/static ./apps/miniapp/.next/static

EXPOSE 3000

CMD ["node", "apps/miniapp/server.js"]
