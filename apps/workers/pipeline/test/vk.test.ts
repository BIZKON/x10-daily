import { describe, expect, it, vi } from "vitest";
import { VkApiError, vkWallPost } from "../src/lib/vk";

/** Мок fetch, отдающий заданное JSON-тело (VK всегда HTTP 200, ошибки — в теле). */
function jsonFetch(body: unknown): typeof fetch {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("vkWallPost", () => {
  it("успех → postId; form-body с owner_id/message/token/v + from_group для сообщества", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    const fetchImpl = vi.fn(async (url: unknown, init: unknown) => {
      capturedUrl = String(url);
      capturedBody = (init as { body: string }).body;
      return { ok: true, status: 200, json: async () => ({ response: { post_id: 42 } }) };
    }) as unknown as typeof fetch;

    const r = await vkWallPost("Привет VK", { accessToken: "tok", ownerId: "-123", fetchImpl });

    expect(r).toEqual({ ok: true, method: "wall.post", postId: 42 });
    expect(capturedUrl).toContain("/method/wall.post");
    const p = new URLSearchParams(capturedBody);
    expect(p.get("owner_id")).toBe("-123");
    expect(p.get("message")).toBe("Привет VK");
    expect(p.get("access_token")).toBe("tok");
    expect(p.get("v")).toBeTruthy();
    // owner_id < 0 → пост от имени сообщества.
    expect(p.get("from_group")).toBe("1");
  });

  it("owner_id положительный (юзер) → без from_group", async () => {
    let capturedBody = "";
    const fetchImpl = vi.fn(async (_url: unknown, init: unknown) => {
      capturedBody = (init as { body: string }).body;
      return { ok: true, status: 200, json: async () => ({ response: { post_id: 7 } }) };
    }) as unknown as typeof fetch;

    await vkWallPost("x", { accessToken: "t", ownerId: "555", fetchImpl });
    expect(new URLSearchParams(capturedBody).get("from_group")).toBeNull();
  });

  it("VK error в теле (HTTP 200) → throw с кодом и сообщением", async () => {
    const fetchImpl = jsonFetch({ error: { error_code: 214, error_msg: "Access denied" } });
    await expect(vkWallPost("x", { accessToken: "t", ownerId: "-1", fetchImpl })).rejects.toThrow(
      /214.*Access denied/,
    );
  });

  it("неожиданный ответ (нет response) → throw", async () => {
    const fetchImpl = jsonFetch({ foo: "bar" });
    await expect(vkWallPost("x", { accessToken: "t", ownerId: "-1", fetchImpl })).rejects.toThrow(
      /неожиданный ответ/,
    );
  });

  it("guid передаётся в body когда задан (идемпотентность ретрая)", async () => {
    let capturedBody = "";
    const fetchImpl = vi.fn(async (_url: unknown, init: unknown) => {
      capturedBody = (init as { body: string }).body;
      return { ok: true, status: 200, json: async () => ({ response: { post_id: 1 } }) };
    }) as unknown as typeof fetch;
    await vkWallPost("x", { accessToken: "t", ownerId: "-1", guid: "abc123", fetchImpl });
    expect(new URLSearchParams(capturedBody).get("guid")).toBe("abc123");
  });

  it("VK error → VkApiError с error_code", async () => {
    const fetchImpl = jsonFetch({ error: { error_code: 14, error_msg: "Captcha needed" } });
    await expect(
      vkWallPost("x", { accessToken: "t", ownerId: "-1", fetchImpl }),
    ).rejects.toMatchObject({ name: "VkApiError", code: 14 });
  });

  it("не-200 HTTP (edge/WAF HTML) → VkApiError code=0 со статусом, без JSON-parse", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => "<html>503 Service Unavailable</html>",
      json: async () => {
        throw new Error("should not parse json on non-200");
      },
    })) as unknown as typeof fetch;
    const err = await vkWallPost("x", { accessToken: "t", ownerId: "-1", fetchImpl }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(VkApiError);
    expect(err.code).toBe(0);
    expect(err.message).toMatch(/HTTP 503/);
  });
});
