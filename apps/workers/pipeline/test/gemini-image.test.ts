import { describe, expect, it, vi } from "vitest";
import {
  extractImageFromResponse,
  generateCoverImage,
  parseDataUrl,
} from "../src/lib/gemini-image";

const ENV = {
  AI_GATEWAY_BASE_URL: "https://api.timeweb.ai/v1",
  AI_GATEWAY_API_KEY: "test-key",
  IMAGE_MODEL: "gemini/gemini-3.1-flash-image-preview",
};

/** Ответ шлюза в форме, снятой спайком: картинка в images, content = null. */
function gatewayBody(url = "data:image/jpeg;base64,/9j/4AAQ") {
  return {
    choices: [{ message: { content: null, images: [{ image_url: { url } }] } }],
    // Форма снята с живого шлюза: completion_tokens УЖЕ включает image_tokens.
    usage: {
      prompt_tokens: 52,
      completion_tokens: 1514,
      total_tokens: 1566,
      completion_tokens_details: { text_tokens: 394, image_tokens: 1120 },
      prompt_tokens_details: { text_tokens: 52 },
    },
  };
}

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("parseDataUrl", () => {
  it("разбирает data:image/jpeg;base64", () => {
    const r = parseDataUrl("data:image/jpeg;base64,/9j/4AAQ");
    expect(r.mime).toBe("image/jpeg");
    expect(r.bytes.length).toBeGreaterThan(0);
  });

  it("разбирает png", () => {
    const r = parseDataUrl("data:image/png;base64,iVBORw0KGgo=");
    expect(r.mime).toBe("image/png");
    expect(r.bytes[0]).toBe(0x89);
  });

  it("не-data URL → внятная ошибка", () => {
    expect(() => parseDataUrl("https://example.com/a.jpg")).toThrow(/data:/i);
  });

  it("не-картинка в data-URL отвергается", () => {
    expect(() => parseDataUrl("data:text/html;base64,PGh0bWw+")).toThrow(/image/i);
  });
});

describe("extractImageFromResponse", () => {
  it("достаёт картинку из message.images (content=null — как отдаёт шлюз)", () => {
    const img = extractImageFromResponse(gatewayBody());
    expect(img.mime).toBe("image/jpeg");
    expect(img.bytes.length).toBeGreaterThan(0);
  });

  it("нет картинки → внятная ошибка", () => {
    expect(() =>
      extractImageFromResponse({ choices: [{ message: { content: "текст" } }] }),
    ).toThrow(/картинк/i);
  });

  it("пустой choices → внятная ошибка", () => {
    expect(() => extractImageFromResponse({ choices: [] })).toThrow(/картинк/i);
  });

  it("мусор вместо тела → внятная ошибка, не TypeError", () => {
    expect(() => extractImageFromResponse(null)).toThrow(/картинк/i);
  });
});

describe("generateCoverImage", () => {
  it("шлёт POST на /chat/completions с моделью из env и возвращает байты", async () => {
    const fetchImpl = vi.fn(async () => okResponse(gatewayBody()));
    const r = await generateCoverImage(ENV, "a calm scene", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(r.mime).toBe("image/jpeg");
    expect(r.bytes.length).toBeGreaterThan(0);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.timeweb.ai/v1/chat/completions");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("gemini/gemini-3.1-flash-image-preview");
    expect(JSON.stringify(body.messages)).toContain("a calm scene");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-key");
  });

  it("не дублирует слэш, если base URL заканчивается на /", async () => {
    const fetchImpl = vi.fn(async () => okResponse(gatewayBody()));
    await generateCoverImage({ ...ENV, AI_GATEWAY_BASE_URL: "https://api.timeweb.ai/v1/" }, "s", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://api.timeweb.ai/v1/chat/completions");
  });

  it("HTTP-ошибка шлюза → бросает (Inngest ретраит шаг)", async () => {
    const fetchImpl = vi.fn(async () => new Response("upstream boom", { status: 502 }));
    await expect(
      generateCoverImage(ENV, "s", { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/502/);
  });

  it("нет ключа шлюза → бросает до сети", async () => {
    const fetchImpl = vi.fn(async () => okResponse(gatewayBody()));
    await expect(
      generateCoverImage({ ...ENV, AI_GATEWAY_API_KEY: undefined }, "s", {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/AI_GATEWAY_API_KEY/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("ключ шлюза НЕ утекает в текст ошибки", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 500 }));
    const err = await generateCoverImage(ENV, "s", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }).catch((e: Error) => e);
    expect(String((err as Error).message)).not.toContain("test-key");
  });
});

describe("usage картинки — расход должен попадать в $-ledger", () => {
  it("возвращает токены: completion_tokens уже включает image_tokens", async () => {
    const fetchImpl = vi.fn(async () => okResponse(gatewayBody()));
    const r = await generateCoverImage(ENV, "s", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r.usage.inputTokens).toBe(52);
    expect(r.usage.outputTokens).toBe(1514);
    expect(r.usage.imageTokens).toBe(1120);
    expect(r.usage.textTokens).toBe(394);
  });

  it("шлюз не вернул usage → нули, а не падение (расход просто не учтётся)", async () => {
    const body = gatewayBody();
    body.usage = undefined as never;
    const fetchImpl = vi.fn(async () => okResponse(body));
    const r = await generateCoverImage(ENV, "s", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r.usage.inputTokens).toBe(0);
    expect(r.usage.outputTokens).toBe(0);
    expect(r.usage.imageTokens).toBe(0);
  });

  it("картинка по-прежнему извлекается", async () => {
    const fetchImpl = vi.fn(async () => okResponse(gatewayBody()));
    const r = await generateCoverImage(ENV, "s", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r.mime).toBe("image/jpeg");
    expect(r.bytes.length).toBeGreaterThan(0);
  });
});
