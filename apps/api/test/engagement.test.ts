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

/**
 * /me — anonymous path не должен трогать БД и должен мгновенно возвращать нули.
 * Это контракт для client-side initial state в optimistic UI.
 */
describe("GET /v1/articles/:id/me (anonymous)", () => {
  const articleId = "00000000-0000-0000-0000-000000000001";

  it("returns zeroed snapshot without Authorization (no DB roundtrip)", async () => {
    const app = createApp();
    const res = await app.fetch(
      new Request(`https://x10-api.local/v1/articles/${articleId}/me`),
      TEST_BINDINGS,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      userReactions: { fire: boolean; insight: boolean; question: boolean };
      isBookmarked: boolean;
      readPercent: number;
    };
    expect(body).toStrictEqual({
      userReactions: { fire: false, insight: false, question: false },
      isBookmarked: false,
      readPercent: 0,
    });
  });

  it("rejects malformed UUID in path", async () => {
    const app = createApp();
    const res = await app.fetch(
      new Request(`https://x10-api.local/v1/articles/not-a-uuid/me`),
      TEST_BINDINGS,
    );
    expect(res.status).toBe(400);
  });
});
