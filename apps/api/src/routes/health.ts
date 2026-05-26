import { Hono } from "hono";
import type { AppEnv } from "../app";

export const healthRoute = new Hono<AppEnv>().get("/", (c) => {
  return c.json({
    status: "ok",
    service: "x10-api",
    time: new Date().toISOString(),
    env: c.env.NODE_ENV,
  });
});
