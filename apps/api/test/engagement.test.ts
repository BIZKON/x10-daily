import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

/**
 * /me — anonymous path не должен трогать БД и должен мгновенно возвращать нули.
 * Это контракт для client-side initial state в optimistic UI.
 */
describe("GET /v1/articles/:id/me (anonymous)", () => {
  const articleId = "00000000-0000-0000-0000-000000000001";

  it("returns zeroed snapshot without X-User-Id (no DB roundtrip)", async () => {
    const res = await SELF.fetch(`https://x10-api.local/v1/articles/${articleId}/me`);
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
    const res = await SELF.fetch(`https://x10-api.local/v1/articles/not-a-uuid/me`);
    expect(res.status).toBe(400);
  });
});
