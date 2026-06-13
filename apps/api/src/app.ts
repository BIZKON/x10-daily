import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import type { AppBindings } from "./bindings";
import { adminRoute } from "./routes/admin";
import { adminContentRoute } from "./routes/admin-content";
import { uploadRoute } from "./routes/upload";
import { articlesRoute } from "./routes/articles";
import { authRoute } from "./routes/auth";
import { authorsRoute } from "./routes/authors";
import { communityRoute } from "./routes/community";
import { digestsRoute } from "./routes/digests";
import { engagementRoute } from "./routes/engagement";
import { eventsRoute } from "./routes/events";
import { feedRoute } from "./routes/feed";
import { healthRoute } from "./routes/health";
import { pipelineRoute } from "./routes/pipeline";
import { profileRoute } from "./routes/profile";
import { videosRoute } from "./routes/videos";

export type AppEnv = {
  Bindings: AppBindings;
};

/**
 * Парсит `X10_ALLOWED_ORIGINS` env (comma-separated). Поддержка wildcards вида
 * `https://*.vercel.app` — на CF Workers без regex, используем простой
 * `endsWith` префиксного matching через replace * → host suffix.
 *
 * В dev (NODE_ENV != 'production') — permissive fallback "*" + credentials off
 * иначе spec-нарушение `*` + credentials.
 */
function buildCorsOrigin(bindings: AppBindings) {
  const raw = (bindings.X10_ALLOWED_ORIGINS ?? "").trim();
  const isProd = bindings.NODE_ENV === "production";
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Dev без явного allowlist — оставляем permissive чтобы localhost:3000/3001 работали.
  if (!isProd && list.length === 0) {
    return (origin: string | undefined) => origin ?? "*";
  }

  // Prod без allowlist — closed-by-default. Возвращаем функцию, которая
  // отвергает все origin (Hono cors просто не выставит ACAO header).
  if (list.length === 0) {
    return () => null;
  }

  // Compile matchers: exact / wildcard-prefix.
  const exact = new Set(list.filter((o) => !o.includes("*")));
  const wildcards = list
    .filter((o) => o.includes("*"))
    .map((o) => {
      const idx = o.indexOf("*");
      return { prefix: o.slice(0, idx), suffix: o.slice(idx + 1) };
    });

  return (origin: string | undefined): string | null => {
    if (!origin) return null;
    if (exact.has(origin)) return origin;
    for (const { prefix, suffix } of wildcards) {
      if (origin.startsWith(prefix) && origin.endsWith(suffix)) return origin;
    }
    return null;
  };
}

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use("*", logger());

  // MEDIUM-8: body size limit — 1 MB по умолчанию для JSON. Upload endpoint
  // имеет свой 6 MB лимит через Content-Length check + 5 MB через file.size.
  // Hono bodyLimit считает по Content-Length header (быстрая reject до буферизации).
  app.use("*", async (c, next) => {
    const limit = c.req.path.startsWith("/v1/admin/upload")
      ? 6 * 1024 * 1024
      : 1 * 1024 * 1024;
    const handler = bodyLimit({
      maxSize: limit,
      onError: (c) =>
        c.json(
          {
            error: "request_too_large",
            maxBytes: limit,
            message: "Request body превышает лимит.",
          },
          413,
        ),
    });
    return handler(c, next);
  });

  // HIGH-1: CORS allowlist через X10_ALLOWED_ORIGINS (comma-separated, wildcards
  // вида `https://*.vercel.app` поддерживаются). Без env в prod — closed-by-default.
  // Dev без env — permissive для localhost.
  app.use("*", async (c, next) => {
    const handler = cors({
      origin: buildCorsOrigin(c.env),
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: true,
      maxAge: 600,
    });
    return handler(c, next);
  });

  app.route("/health", healthRoute);
  app.route("/v1/auth", authRoute);
  app.route("/v1/feed", feedRoute);
  app.route("/v1/articles", articlesRoute);
  app.route("/v1/pipeline", pipelineRoute);
  app.route("/v1/admin", adminRoute);
  app.route("/v1/admin", adminContentRoute);
  app.route("/v1/admin/upload", uploadRoute);
  app.route("/v1/community", communityRoute);
  app.route("/v1/events", eventsRoute);
  app.route("/v1/videos", videosRoute);
  app.route("/v1/authors", authorsRoute);
  app.route("/v1/digests", digestsRoute);
  // Engagement POST'ы — mounted прямо в /v1 (paths типа /v1/articles/:id/reactions).
  app.route("/v1", engagementRoute);
  app.route("/v1/profile", profileRoute);

  app.notFound((c) => c.json({ error: "not_found", path: c.req.path }, 404));

  // HIGH-8: onError не возвращает err.message verbatim — могут быть schema/SQL
  // утечки. HTTPException пропускаем (там controlled message от приложения).
  // Остальные → generic "internal" + полный err в console для wrangler tail/Sentry.
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return err.getResponse();
    }
    console.error(
      "[x10-api] unhandled",
      err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      err instanceof Error && err.stack ? err.stack : "",
    );
    const isProd = c.env.NODE_ENV === "production";
    return c.json(
      isProd
        ? { error: "internal" }
        : {
            error: "internal",
            // В dev оставляем message для удобства отладки.
            message: err instanceof Error ? err.message : String(err),
          },
      500,
    );
  });

  return app;
}

export type AppType = ReturnType<typeof createApp>;
