import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { adminRoute } from "./routes/admin";
import { adminContentRoute } from "./routes/admin-content";
import { uploadRoute } from "./routes/upload";
import { articlesRoute } from "./routes/articles";
import { authorsRoute } from "./routes/authors";
import { communityRoute } from "./routes/community";
import { digestsRoute } from "./routes/digests";
import { engagementRoute } from "./routes/engagement";
import { eventsRoute } from "./routes/events";
import { feedRoute } from "./routes/feed";
import { healthRoute } from "./routes/health";
import { pipelineRoute } from "./routes/pipeline";
import { profileRoute } from "./routes/profile";

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
  app.route("/v1/admin", adminRoute);
  app.route("/v1/admin", adminContentRoute);
  app.route("/v1/admin/upload", uploadRoute);
  app.route("/v1/community", communityRoute);
  app.route("/v1/events", eventsRoute);
  app.route("/v1/authors", authorsRoute);
  app.route("/v1/digests", digestsRoute);
  // Engagement POST'ы — mounted прямо в /v1 (paths типа /v1/articles/:id/reactions).
  app.route("/v1", engagementRoute);
  app.route("/v1/profile", profileRoute);

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
