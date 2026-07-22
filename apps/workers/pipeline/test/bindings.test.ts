import { afterEach, describe, expect, it, vi } from "vitest";
import { readBindingsFromEnv } from "../src/bindings";

/**
 * Регресс на класс багов «env-ключ есть в Zod-схеме (@x10/config) и интерфейсе
 * PipelineBindings, но НЕ копируется в readBindingsFromEnv → молча не доходит до
 * воркера» (loadPipelineEnv парсит этот объект, а не сырой process.env, и
 * применяет .default()). Так было дважды: TELEGRAM_PROXY_URL (audit M2) и
 * MODEL_* (session 23 review CRITICAL). Любой новый env-ключ воркера должен иметь
 * здесь проверку.
 */
describe("readBindingsFromEnv", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("читает MODEL_* — env-своп модели (session 23) реально доходит до воркера", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
    vi.stubEnv("MODEL_OPUS", "anthropic/claude-opus-4-7");
    vi.stubEnv("MODEL_SONNET", "deepseek/deepseek-v4-flash");
    vi.stubEnv("MODEL_HAIKU", "deepseek/deepseek-v4-flash");
    const b = readBindingsFromEnv();
    expect(b.MODEL_OPUS).toBe("anthropic/claude-opus-4-7");
    expect(b.MODEL_SONNET).toBe("deepseek/deepseek-v4-flash");
    expect(b.MODEL_HAIKU).toBe("deepseek/deepseek-v4-flash");
  });

  it("читает VK_* и TELEGRAM_PROXY_URL (прошлые пробелы того же класса)", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
    vi.stubEnv("VK_ACCESS_TOKEN", "tok");
    vi.stubEnv("VK_OWNER_ID", "-123456");
    vi.stubEnv("TELEGRAM_PROXY_URL", "socks5://127.0.0.1:1080");
    const b = readBindingsFromEnv();
    expect(b.VK_ACCESS_TOKEN).toBe("tok");
    expect(b.VK_OWNER_ID).toBe("-123456");
    expect(b.TELEGRAM_PROXY_URL).toBe("socks5://127.0.0.1:1080");
  });

  it("читает REDDIT_* — reddit-адаптер OAuth реально доходит до воркера", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
    vi.stubEnv("REDDIT_CLIENT_ID", "cid");
    vi.stubEnv("REDDIT_CLIENT_SECRET", "secret");
    vi.stubEnv("REDDIT_USER_AGENT", "proagentai:ingest:0.1 (by /u/test)");
    const b = readBindingsFromEnv();
    expect(b.REDDIT_CLIENT_ID).toBe("cid");
    expect(b.REDDIT_CLIENT_SECRET).toBe("secret");
    expect(b.REDDIT_USER_AGENT).toBe("proagentai:ingest:0.1 (by /u/test)");
  });

  it("бросает без DATABASE_URL", () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(() => readBindingsFromEnv()).toThrow(/DATABASE_URL/);
  });
});
