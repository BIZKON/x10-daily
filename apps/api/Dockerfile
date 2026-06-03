# syntax=docker/dockerfile:1.7

# Multi-stage build для apps/api (Hono on Node).
# Деплоится через Timeweb App Platform с указанием context = root монорепо,
# Dockerfile path = apps/api/Dockerfile.
#
# tsx в runtime — JIT TypeScript compilation. Workspace deps (@x10/db, agents,
# config, voice) экспортируют ./src/index.ts напрямую, поэтому "сборка" не
# требуется. Startup latency ~200ms — приемлемо для long-running HTTP сервиса.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# ===== deps =====
# Отдельный слой для cache hit при изменении только source-кода.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/admin/package.json ./apps/admin/
COPY apps/miniapp/package.json ./apps/miniapp/
COPY apps/workers/pipeline/package.json ./apps/workers/pipeline/
COPY packages/agents/package.json ./packages/agents/
COPY packages/config/package.json ./packages/config/
COPY packages/db/package.json ./packages/db/
COPY packages/ui/package.json ./packages/ui/
COPY packages/voice/package.json ./packages/voice/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @x10/api...

# ===== runner =====
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages ./packages
COPY apps/api ./apps/api
# CMD ["pnpm","start"] → pnpm читает packageManager pin из root package.json.
# Без корневых метафайлов corepack скачивает latest pnpm (11+), runDepsStatusCheck
# падает «Command failed with exit code 1». Это тот же фикс что для pipeline (ec08c64).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Workspace deps source (TS, загружаются tsx-runtime):
COPY packages/config/src ./packages/config/src
COPY packages/db/src ./packages/db/src
COPY packages/agents/src ./packages/agents/src
COPY packages/voice ./packages/voice

EXPOSE 8080

# tsx запускается через pnpm чтобы workspace resolution работал.
WORKDIR /app/apps/api
CMD ["pnpm", "start"]
