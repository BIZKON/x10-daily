import { Hono } from "hono";
import { serve } from "inngest/cloudflare";
import { getPipelineEnv } from "./env";
import { createPipelineInngest } from "./inngest/client";
import { createAssembleNewsletterFunction } from "./inngest/functions/assemble-newsletter";
import { createDraftArticleFunction } from "./inngest/functions/draft-article";
import { createProcessSourceItemFunction } from "./inngest/functions/process-source-item";
import { createRunWeeklyScoreFunction } from "./inngest/functions/run-weekly-score";

type Env = { Bindings: CloudflareBindings };

const app = new Hono<Env>();

app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "x10-worker-pipeline",
    env: c.env.NODE_ENV,
    time: new Date().toISOString(),
  }),
);

/**
 * Inngest webhook endpoint. Inngest cloud (или dev-server) шлёт сюда вызовы
 * шагов с подписью X-Inngest-Signature; signingKey берётся из binding NODE_ENV/secrets.
 *
 * CRITICAL-4 из docs/SECURITY-AUDIT.md:
 * - getPipelineEnv() через loadEnv enforces что INNGEST_SIGNING_KEY +
 *   MASKER_* + ANTHROPIC_* присутствуют в production. Без них boot падает.
 * - Inngest SDK с заданным signingKey верифицирует X-Inngest-Signature на каждом
 *   вебхуке (см. inngest/client.ts) → спуфнутые POST'ы отклоняются.
 * - isDev: false в production отключает dev-fallback signing skip.
 */
app.all("/inngest", async (c) => {
  // Fail-fast если env не сконфигурирован — лучше 500 на boot, чем silent
  // signing bypass в проде. В dev/test loadEnv пропускает (NODE_ENV checks).
  getPipelineEnv(c.env);

  const client = createPipelineInngest(c.env);
  const handler = serve({
    client,
    functions: [
      createDraftArticleFunction(client, c.env),
      createProcessSourceItemFunction(client, c.env),
      createAssembleNewsletterFunction(client, c.env),
      createRunWeeklyScoreFunction(client, c.env),
    ],
  }) as unknown as (
    req: Request,
    env: Record<string, string | undefined>,
  ) => Promise<Response>;
  return handler(c.req.raw, c.env as unknown as Record<string, string | undefined>);
});

export default app;
