import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { articlesRoute } from "./routes/articles";
import { feedRoute } from "./routes/feed";
import { healthRoute } from "./routes/health";
import { pipelineRoute } from "./routes/pipeline";

export type AppEnv = {
  Bindings: CloudflareBindings;
};

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use("*", logger());
  app.use(
    "*",
    cors({
      origin: (origin) => origin ?? "*",
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      credentials: true,
      maxAge: 600,
    }),
  );

  app.route("/health", healthRoute);
  app.route("/v1/feed", feedRoute);
  app.route("/v1/articles", articlesRoute);
  app.route("/v1/pipeline", pipelineRoute);

  app.notFound((c) => c.json({ error: "not_found", path: c.req.path }, 404));

  app.onError((err, c) => {
    console.error("[x10-api]", err);
    return c.json(
      { error: "internal", message: err.message },
      500,
    );
  });

  return app;
}

export type AppType = ReturnType<typeof createApp>;
