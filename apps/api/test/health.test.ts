import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /health", () => {
  it("returns ok + service identity", async () => {
    const res = await SELF.fetch("https://x10-api.local/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string; env: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("x10-api");
    expect(body.env).toBe(env.NODE_ENV);
  });
});
