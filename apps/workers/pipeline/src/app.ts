import { Hono } from "hono";
import { serve as inngestServe } from "inngest/hono";
import type { PipelineBindings } from "./bindings";
import { getPipelineEnv } from "./env";
import { createPipelineInngest } from "./inngest/client";
import { createAssembleNewsletterFunction } from "./inngest/functions/assemble-newsletter";
import { createDraftArticleFunction } from "./inngest/functions/draft-article";
import { createIngestRssFunction } from "./inngest/functions/ingest-rss";
import { createPostToTgFunction } from "./inngest/functions/post-to-tg";
import { createPostToVkFunction } from "./inngest/functions/post-to-vk";
import { createProcessSourceItemFunction } from "./inngest/functions/process-source-item";
import { createRetryOpsAlertsFunction } from "./inngest/functions/retry-ops-alerts";
import { createRunWeeklyScoreFunction } from "./inngest/functions/run-weekly-score";

export type AppEnv = {
  Bindings: PipelineBindings;
};

export function createApp() {
  const app = new Hono<AppEnv>();

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      service: "x10-worker-pipeline",
      env: c.env.NODE_ENV,
      time: new Date().toISOString(),
    }),
  );

  /**
   * Inngest webhook endpoint. Self-hosted Inngest сервер (или dev-cli) шлёт
   * вызовы шагов с X-Inngest-Signature; signingKey берётся из bindings.
   *
   * CRITICAL-4 из docs/SECURITY-AUDIT.md:
   * - getPipelineEnv() через loadEnv enforces что INNGEST_SIGNING_KEY +
   *   AI_GATEWAY_API_KEY присутствуют в production. Без них boot падает.
   * - Inngest SDK с заданным signingKey верифицирует X-Inngest-Signature
   *   на каждом вебхуке → спуфнутые POST'ы отклоняются.
   * - isDev: false в production отключает dev-fallback signing skip.
   */
  app.all("/inngest", async (c) => {
    // Fail-fast если env не сконфигурирован.
    getPipelineEnv(c.env);

    const client = createPipelineInngest(c.env);
    const handler = inngestServe({
      client,
      functions: [
        createDraftArticleFunction(client, c.env),
        createProcessSourceItemFunction(client, c.env),
        createAssembleNewsletterFunction(client, c.env),
        createRunWeeklyScoreFunction(client, c.env),
        createIngestRssFunction(client, c.env),
        createPostToTgFunction(client, c.env),
        createPostToVkFunction(client, c.env),
        createRetryOpsAlertsFunction(client, c.env),
      ],
    });
    // inngest/hono возвращает HTTP-handler (c) => Response. Просто проксируем.
    return handler(c);
  });

  return app;
}

export type AppType = ReturnType<typeof createApp>;
