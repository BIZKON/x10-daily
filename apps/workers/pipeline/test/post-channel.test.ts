import type { Database } from "@x10/db";
import { describe, expect, it, vi } from "vitest";
import type { PipelineEnv } from "../src/env";
import { markChannelPosted, recordChannelFailure, sendToChannel } from "../src/lib/post-channel";

/**
 * post-channel (session 23): общая send-логика слот-постинга. sendToChannel —
 * чистый сетевой вызов (fetchImpl инъектируется, без сети); markChannelPosted /
 * recordChannelFailure — UPDATE channels (db мокаем chain-объектом, без БД).
 */

const TG_ENV = {
  TELEGRAM_BOT_TOKEN: "123:abc",
  TG_TEST_CHANNEL_ID: "-100500",
  TELEGRAM_PROXY_URL: "",
} as unknown as PipelineEnv;

const VK_ENV = {
  VK_ACCESS_TOKEN: "vk-token",
  VK_OWNER_ID: "-123456",
} as unknown as PipelineEnv;

describe("sendToChannel — tg", () => {
  it("sendMessage (без visualRef): postRef = message_id, текст в body", async () => {
    let url = "";
    let body: Record<string, unknown> = {};
    const fetchImpl = vi.fn(async (u: unknown, init: unknown) => {
      url = String(u);
      body = JSON.parse((init as { body: string }).body);
      return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 555 } }) };
    }) as unknown as typeof fetch;

    const out = await sendToChannel(
      TG_ENV,
      { channel: "tg", articleId: "a1", text: "Привет", visualRef: null },
      { fetchImpl },
    );
    expect(out).toEqual({ ok: true, postRef: "555" });
    expect(url).toContain("/bot123:abc/sendMessage");
    expect(body.chat_id).toBe("-100500");
    expect(body.text).toBe("Привет");
  });

  it("sendPhoto (с visualRef): photo + caption, без text", async () => {
    let url = "";
    let body: Record<string, unknown> = {};
    const fetchImpl = vi.fn(async (u: unknown, init: unknown) => {
      url = String(u);
      body = JSON.parse((init as { body: string }).body);
      return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 7 } }) };
    }) as unknown as typeof fetch;

    const out = await sendToChannel(
      TG_ENV,
      { channel: "tg", articleId: "a1", text: "Подпись", visualRef: "https://img/x.jpg" },
      { fetchImpl },
    );
    expect(out).toEqual({ ok: true, postRef: "7" });
    expect(url).toContain("/sendPhoto");
    expect(body.photo).toBe("https://img/x.jpg");
    expect(body.caption).toBe("Подпись");
    expect(body.text).toBeUndefined();
  });

  it("нет TELEGRAM_BOT_TOKEN → throw", async () => {
    const env = { TG_TEST_CHANNEL_ID: "-100" } as unknown as PipelineEnv;
    await expect(
      sendToChannel(env, { channel: "tg", articleId: "a1", text: "t", visualRef: null }, {}),
    ).rejects.toThrow(/TELEGRAM_BOT_TOKEN/);
  });
});

describe("sendToChannel — vk", () => {
  it("happy: postRef = post_id; guid = articleId без дефисов; токен/owner/текст в body", async () => {
    let body = "";
    const fetchImpl = vi.fn(async (_u: unknown, init: unknown) => {
      body = (init as { body: string }).body;
      return { ok: true, status: 200, json: async () => ({ response: { post_id: 99 } }) };
    }) as unknown as typeof fetch;

    const out = await sendToChannel(
      VK_ENV,
      { channel: "vk", articleId: "art-1-2-3", text: "VK-текст", visualRef: null },
      { fetchImpl },
    );
    expect(out).toEqual({ ok: true, postRef: "99" });
    const p = new URLSearchParams(body);
    expect(p.get("access_token")).toBe("vk-token");
    expect(p.get("owner_id")).toBe("-123456");
    expect(p.get("message")).toBe("VK-текст");
    expect(p.get("guid")).toBe("art123");
  });

  it("невосстановимая ошибка (214) → {ok:false, skipped, reason}", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ error: { error_code: 214, error_msg: "denied" } }),
    })) as unknown as typeof fetch;
    const out = await sendToChannel(
      VK_ENV,
      { channel: "vk", articleId: "a1", text: "t", visualRef: null },
      { fetchImpl },
    );
    expect(out).toEqual({ ok: false, skipped: true, reason: "vk-error-214" });
  });

  it("транзиентная ошибка (100) → throw (Inngest ретраит)", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ error: { error_code: 100, error_msg: "x" } }),
    })) as unknown as typeof fetch;
    await expect(
      sendToChannel(VK_ENV, { channel: "vk", articleId: "a1", text: "t", visualRef: null }, { fetchImpl }),
    ).rejects.toThrow(/\[100\]/);
  });

  it("нет VK_ACCESS_TOKEN → throw", async () => {
    const env = { VK_OWNER_ID: "-1" } as unknown as PipelineEnv;
    await expect(
      sendToChannel(env, { channel: "vk", articleId: "a1", text: "t", visualRef: null }, {}),
    ).rejects.toThrow(/VK_ACCESS_TOKEN/);
  });
});

describe("markChannelPosted / recordChannelFailure", () => {
  function captureDb() {
    const sets: Array<Record<string, unknown>> = [];
    const db = {
      update: () => ({
        set: (v: Record<string, unknown>) => {
          sets.push(v);
          return { where: async () => undefined };
        },
      }),
    } as unknown as Database;
    return { db, sets };
  }

  it("markChannelPosted ставит posted_at + post_ref", async () => {
    const { db, sets } = captureDb();
    const at = new Date("2026-06-09T09:30:00Z");
    await markChannelPosted(db, { articleId: "a1", channel: "tg", postRef: "555", at });
    expect(sets).toHaveLength(1);
    expect(sets[0]!.postedAt).toBe(at);
    expect(sets[0]!.postRef).toBe("555");
  });

  it("recordChannelFailure инкрементит attempts + пишет last_error (≤500 симв.)", async () => {
    const { db, sets } = captureDb();
    await recordChannelFailure(db, { articleId: "a1", channel: "vk", error: "x".repeat(600) });
    expect(sets).toHaveLength(1);
    expect(sets[0]!.attempts).toBeDefined(); // sql`attempts + 1`
    expect(typeof sets[0]!.lastError).toBe("string");
    expect((sets[0]!.lastError as string).length).toBe(500);
  });
});
