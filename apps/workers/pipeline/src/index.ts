import { Hono } from "hono";
import { serve } from "inngest/cloudflare";
import { createPipelineInngest } from "./inngest/client";
import { createDraftArticleFunction } from "./inngest/functions/draft-article";

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
 */
app.all("/inngest", async (c) => {
  const client = createPipelineInngest(c.env);
  const handler = serve({
    client,
    functions: [createDraftArticleFunction(client, c.env)],
  }) as unknown as (
    req: Request,
    env: Record<string, string | undefined>,
  ) => Promise<Response>;
  return handler(c.req.raw, c.env as unknown as Record<string, string | undefined>);
});

export default app;
