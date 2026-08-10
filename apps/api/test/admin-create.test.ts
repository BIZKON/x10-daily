import { creationInputSchema } from "@x10/agents";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { AppBindings, RateLimiter } from "../src/bindings";
import { MAX_PROMPT, checkMode } from "../src/routes/admin-create";

/**
 * Раздел «Создать» — маршруты api (ручной режим, шаг 2).
 *
 * Проверяем три вещи, каждая из которых иначе всплывёт у клиента: договор с
 * агентом по длине темы, гейт недоступного режима и то, что задание нельзя
 * создать без прав.
 */

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

const BASE = "https://x10-api.local/v1/admin";

function call(path: string, init?: RequestInit) {
  return createApp().fetch(new Request(`${BASE}${path}`, init), TEST_BINDINGS);
}

const MODE = { title: "Пост", available: true, enabled: true };

describe("договор с агентом", () => {
  it("🔴 потолок темы совпадает с тем, что принимает агент", () => {
    // Разъедутся — api примет задание, а конвейер отвергнет его на валидации
    // входа. Человек увидит «не удалось создать» без единой подсказки почему.
    const ok = creationInputSchema.safeParse({
      guidance: "g",
      topic: "x".repeat(MAX_PROMPT),
    });
    const over = creationInputSchema.safeParse({
      guidance: "g",
      topic: "x".repeat(MAX_PROMPT + 1),
    });

    expect(ok.success).toBe(true);
    expect(over.success).toBe(false);
  });
});

describe("гейт режима", () => {
  it("неизвестного режима нет", () => {
    const r = checkMode(undefined);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("not_found");
  });

  it("выключенный режим отвечает «нет такого», а не «есть, но нельзя»", () => {
    // Он скрыт из списка режимов. Признаться, что он существует, значит
    // показать человеку дверь, которую он не открывал и открыть не может.
    const r = checkMode({ ...MODE, enabled: false });
    expect(r.ok === false && r.error).toBe("not_found");
  });

  it("🔴 режим «готовится» отказывает ДО создания задания и говорит почему", () => {
    // Иначе api заводит строку, конвейер её роняет, и человек получает
    // «не выполнено» вместо честного «этот режим ещё не работает».
    const r = checkMode({ ...MODE, available: false });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("mode_unavailable");
    expect(r.ok === false && r.message).toMatch(/готовится/i);
    expect(r.ok === false && r.message).toContain("Пост");
  });

  it("рабочий режим проходит", () => {
    expect(checkMode(MODE).ok).toBe(true);
  });
});

describe("без прав ничего не отдаём и не создаём", () => {
  it("список режимов без Authorization → не 200", async () => {
    const res = await call("/create/modes");
    expect([401, 403, 503]).toContain(res.status);
  });

  it("🔴 создание задания без Authorization → не 200 (иначе кто угодно жжёт бюджет)", async () => {
    const res = await call("/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ modeSlug: "post", prompt: "тема" }),
    });
    expect([401, 403, 503]).toContain(res.status);
  });

  it("список заданий без Authorization → не 200", async () => {
    const res = await call("/create");
    expect([401, 403, 503]).toContain(res.status);
  });

  it("одно задание без Authorization → не 200", async () => {
    const res = await call("/create/00000000-0000-4000-8000-000000000001");
    expect([401, 403, 503]).toContain(res.status);
  });

  it("Bearer-мусор не принимается", async () => {
    const res = await call("/create/modes", { headers: { Authorization: "Bearer not-a-jwt" } });
    expect([401, 403, 503]).toContain(res.status);
  });
});

describe("проверка задания", () => {
  it("пустая тема не принимается", async () => {
    const res = await call("/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ modeSlug: "post", prompt: "   " }),
    });
    expect(res.status).toBe(400);
  });

  it("тема длиннее потолка не принимается", async () => {
    const res = await call("/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ modeSlug: "post", prompt: "x".repeat(MAX_PROMPT + 1) }),
    });
    expect(res.status).toBe(400);
  });
});
