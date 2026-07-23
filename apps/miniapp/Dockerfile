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
# NEXT_PUBLIC_* инлайнятся Next'ом на БИЛДЕ, не в рантайме → приходят build-arg'ами
# из docker-compose (значения из .env.production). Пустой ключ = PostHog выключен.
# Дефолты ПУСТЫЕ — едино с docker-compose build.args и .env.example: пустой HOST →
# клиент сам резолвит same-origin /ingest (Caddy → eu.i.posthog.com), чтобы НЕ
# обходить EU-прокси при сборке вне compose. Пустой KEY → PostHog выключен.
ARG NEXT_PUBLIC_POSTHOG_KEY=""
ARG NEXT_PUBLIC_POSTHOG_HOST=""
ENV NEXT_PUBLIC_POSTHOG_KEY=${NEXT_PUBLIC_POSTHOG_KEY}
ENV NEXT_PUBLIC_POSTHOG_HOST=${NEXT_PUBLIC_POSTHOG_HOST}
# Домен для абсолютных og-URL превью (lib/site-meta.ts). Нужен ИМЕННО на билде:
# статически пререндеренные маршруты (/, /cases, /learn) запекают og:url/og:image
# в HTML. В рантайме тот же ключ приходит через environment сервиса miniapp —
# для динамических маршрутов (страница статьи). Дефолт совпадает с compose/Caddy.
ARG X10_BASE_DOMAIN="pro-agent-ai.ru"
ENV X10_BASE_DOMAIN=${X10_BASE_DOMAIN}
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
