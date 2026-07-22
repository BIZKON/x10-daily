import {
  RedditNotConfiguredError,
  _resetRedditTokenCache,
  fetchReddit,
  parseRedditUrl,
} from "@x10/worker-ingest";
import { beforeEach, describe, expect, it } from "vitest";

const CREDS = { clientId: "cid", clientSecret: "secret", userAgent: "ua/0.1" };

/** Мок fetch: маршрутизирует по подстроке URL, считает обращения к токен-эндпоинту. */
function mockFetch(
  handlers: Array<{ match: string; ok?: boolean; status?: number; json?: unknown }>,
) {
  const calls: string[] = [];
  const fn = (async (url: string | URL | Request) => {
    const u = typeof url === "string" ? url : url.toString();
    calls.push(u);
    const h = handlers.find((x) => u.includes(x.match));
    if (!h) throw new Error(`unexpected fetch: ${u}`);
    return {
      ok: h.ok ?? true,
      status: h.status ?? 200,
      statusText: "",
      json: async () => h.json,
    } as Response;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("parseRedditUrl", () => {
  it("извлекает subreddit/sort/t из полного url", () => {
    expect(parseRedditUrl("https://www.reddit.com/r/AI_Agents/top/.rss?t=week")).toEqual({
      subreddit: "AI_Agents",
      sort: "top",
      t: "week",
    });
  });
  it("дефолтит sort=top, t=week если не заданы", () => {
    expect(parseRedditUrl("https://www.reddit.com/r/n8n/.rss")).toEqual({
      subreddit: "n8n",
      sort: "top",
      t: "week",
    });
  });
  it("бросает без /r/NAME", () => {
    expect(() => parseRedditUrl("https://example.com/feed")).toThrow(/без \/r\/NAME/);
  });
});

describe("fetchReddit", () => {
  beforeEach(() => _resetRedditTokenCache());

  it("бросает RedditNotConfiguredError без кредов", async () => {
    await expect(fetchReddit("https://www.reddit.com/r/x/top/.rss?t=week", null)).rejects.toThrow(
      RedditNotConfiguredError,
    );
    await expect(
      fetchReddit("https://www.reddit.com/r/x/top/.rss?t=week", {
        clientId: "",
        clientSecret: "",
        userAgent: "",
      }),
    ).rejects.toThrow(RedditNotConfiguredError);
  });

  it("нормализует листинг (permalink → полный url, selftext → text, created_utc → ISO)", async () => {
    const { fn } = mockFetch([
      { match: "access_token", json: { access_token: "TOK", expires_in: 3600 } },
      {
        match: "oauth.reddit.com",
        json: {
          data: {
            children: [
              {
                data: {
                  name: "t3_abc",
                  title: "Hello",
                  permalink: "/r/x/comments/abc/hello/",
                  selftext: "body text",
                  created_utc: 1_700_000_000,
                },
              },
              { data: { name: "t3_def", title: "World", url: "https://ext.com/x" } },
            ],
          },
        },
      },
    ]);
    const items = await fetchReddit("https://www.reddit.com/r/x/top/.rss?t=week", CREDS, {
      fetchImpl: fn,
      nowMs: 1000,
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      externalId: "t3_abc",
      title: "Hello",
      text: "body text",
      url: "https://www.reddit.com/r/x/comments/abc/hello/",
    });
    expect(items[0]?.publishedAt).toBe(new Date(1_700_000_000 * 1000).toISOString());
    expect(items[1]).toMatchObject({ url: "https://ext.com/x", text: "World" });
  });

  it("кэширует токен между вызовами (access_token дёргается один раз)", async () => {
    const { fn, calls } = mockFetch([
      { match: "access_token", json: { access_token: "TOK", expires_in: 3600 } },
      { match: "oauth.reddit.com", json: { data: { children: [] } } },
    ]);
    await fetchReddit("https://www.reddit.com/r/x/top/.rss?t=week", CREDS, {
      fetchImpl: fn,
      nowMs: 1000,
    });
    await fetchReddit("https://www.reddit.com/r/y/top/.rss?t=week", CREDS, {
      fetchImpl: fn,
      nowMs: 2000,
    });
    expect(calls.filter((u) => u.includes("access_token"))).toHaveLength(1);
  });

  it("бросает на не-200 токене и не-200 листинге", async () => {
    const bad = mockFetch([{ match: "access_token", ok: false, status: 401 }]);
    await expect(
      fetchReddit("https://www.reddit.com/r/x/top/.rss?t=week", CREDS, { fetchImpl: bad.fn }),
    ).rejects.toThrow(/token fetch failed: 401/);

    _resetRedditTokenCache();
    const bad2 = mockFetch([
      { match: "access_token", json: { access_token: "TOK", expires_in: 3600 } },
      { match: "oauth.reddit.com", ok: false, status: 429 },
    ]);
    await expect(
      fetchReddit("https://www.reddit.com/r/x/top/.rss?t=week", CREDS, { fetchImpl: bad2.fn }),
    ).rejects.toThrow(/listing r\/x failed: 429/);
  });
});
