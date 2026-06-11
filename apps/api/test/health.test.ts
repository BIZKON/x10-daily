import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { AppBindings, RateLimiter } from "../src/bindings";

const noopLimiter: RateLimiter = {
  async limit() {
    return { success: true };
  },
};

const TEST_BINDINGS: AppBindings = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://test:test@localhost/test",
  ENGAGEMENT_LIMITER: noopLimiter,
  PIPELINE_LIMITER: noopLimiter,
};

describe("GET /health", () => {
  it("returns ok + service identity", async () => {
    const app = createApp();
    const res = await app.fetch(new Request("https://x10-api.local/health"), TEST_BINDINGS);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string; env: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("x10-api");
    expect(body.env).toBe(TEST_BINDINGS.NODE_ENV);
  });
});
