# syntax=docker/dockerfile:1.7
#
# Multi-stage build для apps/admin (Next.js 16 standalone).
# Деплоится через Timeweb App Platform / docker-compose.prod.yml:
#   context = root монорепо, dockerfile = apps/admin/Dockerfile.
#
# Standalone output (next.config.ts: output: "standalone") даёт минимальный
# server.js + node_modules только нужные → ~80MB финальный образ.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# ===== deps =====
# Кэш-слой для pnpm install. Триггерится только при изменении lockfile
# или any package.json в монорепо.
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
    pnpm install --frozen-lockfile --filter @x10/admin...

# ===== builder =====
# next build → .next/standalone/ с минимальным server.js.
FROM deps AS builder
COPY apps/admin ./apps/admin
COPY packages ./packages
# tsconfig.json наследует ../../tsconfig.base.json — без корневого файла
# `next build` (Turbopack) падает «extends doesn't resolve correctly».
COPY tsconfig.base.json ./
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/apps/admin
RUN pnpm exec next build

# ===== runner =====
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

# Standalone output: автономный server.js + минимальные node_modules.
# Структура внутри .next/standalone сохраняет monorepo paths.
COPY --from=builder /app/apps/admin/.next/standalone ./
COPY --from=builder /app/apps/admin/.next/static ./apps/admin/.next/static

EXPOSE 3001

# Запускаем server.js напрямую — без pnpm/tsx wrapper'ов.
CMD ["node", "apps/admin/server.js"]
