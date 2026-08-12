import { KB_BODY_LIMIT } from "@x10/agents";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { AppBindings, RateLimiter } from "../src/bindings";
import { MAX_BODY, checkAcceptable, normalizeSiteUrl } from "../src/routes/admin-knowledge";

/**
 * База знаний по ссылке — маршруты api (спека 11.08).
 *
 * Проверяем то, что иначе всплывёт у клиента: приведение адреса, гейт приёмки
 * и невозможность запустить обход или принять материал без прав.
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

describe("договор с агентом", () => {
  it("🔴 потолок тела совпадает с тем, что пишет воркер", () => {
    // Разъедутся — воркер запишет предложение, которое человек не сможет
    // сохранить после правки: маршрут отвергнет его на валидации.
    expect(MAX_BODY).toBe(KB_BODY_LIMIT);
  });
});

describe("normalizeSiteUrl — что вводит человек и что мы обходим", () => {
  it("адрес без схемы дополняется https", () => {
    // Клиент напишет «veles.ru», а не «https://veles.ru/» — это нормально.
    const r = normalizeSiteUrl("veles.ru");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toBe("https://veles.ru/");
  });

  it("путь и параметры отбрасываются: обходим сайт, а не страницу", () => {
    const r = normalizeSiteUrl("https://veles.ru/services?utm_source=vk");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toBe("https://veles.ru/");
  });

  it("🔴 localhost и внутренние имена не принимаются", () => {
    // Тот же запрет, что в загрузчике. Отказать здесь — значит объяснить
    // человеку причину сразу, а не после минуты ожидания.
    for (const bad of ["http://localhost:3000", "http://api.internal", "http://127.0.0.1"]) {
      expect(normalizeSiteUrl(bad).ok).toBe(false);
    }
  });

  it("не-адрес отклоняется с человеческим объяснением", () => {
    const r = normalizeSiteUrl("наш сайт");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message.length).toBeGreaterThan(10);
  });

  it("схемы кроме http и https не принимаются", () => {
    expect(normalizeSiteUrl("file:///etc/passwd").ok).toBe(false);
    expect(normalizeSiteUrl("ftp://veles.ru").ok).toBe(false);
  });
});

describe("гейт приёмки предложения", () => {
  it("предложенное принять можно", () => {
    expect(checkAcceptable({ status: "proposed" }).ok).toBe(true);
  });

  it("🔴 принятое второй раз не принимается", () => {
    // Иначе кнопка «принять» на уже принятом материале молча ничего не делает,
    // и человек не понимает, сработала она или нет.
    const r = checkAcceptable({ status: "ready" });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("not_proposed");
  });

  it("материал в разборе принять нельзя: текста ещё нет", () => {
    expect(checkAcceptable({ status: "parsing" }).ok).toBe(false);
  });
});

describe("без прав ничего не запускаем и не принимаем", () => {
  it("🔴 обход без Authorization не стартует", async () => {
    // Обход тратит деньги клиента и ходит по чужому сайту от нашего имени.
    const res = await call("/knowledge/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ siteUrl: "https://veles.ru" }),
    });
    expect([401, 403, 503]).toContain(res.status);
  });

  it("приёмка предложения без Authorization не проходит", async () => {
    const res = await call("/knowledge/documents/00000000-0000-4000-8000-000000000001/accept", {
      method: "POST",
    });
    expect([401, 403, 503]).toContain(res.status);
  });

  it("разбор обхода без Authorization не отдаётся", async () => {
    const res = await call("/knowledge/imports/00000000-0000-4000-8000-000000000001");
    expect([401, 403, 503]).toContain(res.status);
  });
});
