# syntax=docker/dockerfile:1.7

# Multi-stage build для apps/workers/pipeline (Hono on Node + Inngest functions).
# Деплоится через Timeweb App Platform с указанием context = root монорепо,
# Dockerfile path = apps/workers/pipeline/Dockerfile.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/admin/package.json ./apps/admin/
COPY apps/miniapp/package.json ./apps/miniapp/
COPY apps/workers/pipeline/package.json ./apps/workers/pipeline/
COPY apps/workers/ingest/package.json ./apps/workers/ingest/
COPY packages/agents/package.json ./packages/agents/
COPY packages/config/package.json ./packages/config/
COPY packages/db/package.json ./packages/db/
COPY packages/ui/package.json ./packages/ui/
COPY packages/voice/package.json ./packages/voice/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @x10/worker-pipeline...

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=8787

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/workers/pipeline/node_modules ./apps/workers/pipeline/node_modules
COPY --from=deps /app/packages ./packages
COPY apps/workers/pipeline ./apps/workers/pipeline
# pipeline импортирует @x10/worker-ingest (workspace dep) — runtime ESM
# resolver не найдёт пакет без его src в образе. Без этого: ERR_MODULE_NOT_FOUND
# для @x10/worker-ingest из ingest-vc-rss.ts.
COPY apps/workers/ingest ./apps/workers/ingest
# deploy.sh гонит `pnpm --filter @x10/db db:migrate` в этом образе. Без
# корневых метафайлов corepack не видит packageManager pin → скачивает latest
# pnpm (11+), конфликт с lockfile pnpm 10 → migrate падает в runDepsStatusCheck.
# Плюс pnpm без pnpm-workspace.yaml не видит workspace → --filter не работает.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY packages/config/src ./packages/config/src
COPY packages/db/src ./packages/db/src
# deploy.sh гоняет `pnpm --filter @x10/db db:migrate` (= drizzle-kit migrate)
# именно в этом образе. drizzle-kit требует config + SQL-миграции на диске —
# без них migrate падает «no config / no migrations». src/ недостаточно.
COPY packages/db/drizzle.config.ts ./packages/db/drizzle.config.ts
COPY packages/db/drizzle ./packages/db/drizzle
COPY packages/agents/src ./packages/agents/src
COPY packages/voice ./packages/voice

EXPOSE 8787

WORKDIR /app/apps/workers/pipeline
CMD ["pnpm", "start"]
