import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { AppBindings, RateLimiter } from "../src/bindings";
import { checkJoinable, partnersEnabled, publicProgram } from "../src/routes/partner";

/**
 * Партнёрский кабинет: маршруты мини-аппа (спека 14.08).
 *
 * Проверяем ворота, а не проводку: кто может стать партнёром, что видит
 * посторонний и включается ли раздел настройкой экземпляра.
 */

const noopLimiter: RateLimiter = {
  async limit() {
    return { success: true };
  },
};

const TEST_BINDINGS: AppBindings = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://test:test@localhost/test",
  // Раздел включён: иначе маршруты честно отвечают 404 ещё до проверки входа,
  // и проверить саму авторизацию было бы нечем. Выключенное состояние
  // проверяется чистой функцией выше — env кэшируется на процесс, и двух
  // состояний в одном файле не получить.
  X10_PARTNERS_ENABLED: "1",
  ENGAGEMENT_LIMITER: noopLimiter,
  PIPELINE_LIMITER: noopLimiter,
};

function call(path: string, init?: RequestInit) {
  return createApp().fetch(new Request(`https://x10-api.local${path}`, init), TEST_BINDINGS);
}

describe("раздел включается настройкой экземпляра", () => {
  it("🔴 в копии клиента партнёрская программа выключена по умолчанию", () => {
    // Завод продаётся копиями. Программа НАША: без флага в кабинете клиента
    // появилась бы кнопка «Стать партнёром» с чужими условиями и нашими
    // деньгами.
    expect(partnersEnabled({})).toBe(false);
    expect(partnersEnabled({ X10_PARTNERS_ENABLED: "0" })).toBe(false);
  });

  it("у нас включается явно", () => {
    expect(partnersEnabled({ X10_PARTNERS_ENABLED: "1" })).toBe(true);
  });
});

describe("условия программы", () => {
  it("называют то, что решил владелец", () => {
    const p = publicProgram();
    expect(p.partnerRatePercent).toBe(20);
    expect(p.mentorRatePercent).toBe(5);
    expect(p.mentorMonths).toBe(12);
  });

  it("🔴 обещают долю только с оплаченного и говорят, что участие бесплатное", () => {
    // Формулировка — не украшение: платить за приведённых людей вместо продаж
    // это признак пирамиды (ст. 172.2 УК РФ), и текст обязан говорить обратное.
    //
    // ⚠️ Проверяем НАЛИЧИЕ правила, а не отсутствие слова: первая версия теста
    // упала на честной фразе «ни взносов, ни обязательных покупок» — та же
    // грабля, что была с промптом контент-плана.
    const text = publicProgram().terms.join(" ");
    expect(text).toMatch(/с каждой оплаты|как только деньги получены/i);
    expect(text).toMatch(/участие бесплатн/i);
  });
});

describe("гейт регистрации", () => {
  it("новый человек может стать партнёром", () => {
    expect(checkJoinable({ existing: null }).ok).toBe(true);
  });

  it("🔴 второй раз зарегистрироваться нельзя", () => {
    // Второй аккаунт завёл бы вторую ветку дерева на того же человека, и
    // начисления разъехались бы между ними.
    const r = checkJoinable({ existing: { id: "p-1", status: "active" } });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("already_partner");
  });

  it("приостановленный партнёр не заводит второй аккаунт, а видит причину", () => {
    const r = checkJoinable({ existing: { id: "p-1", status: "paused" } });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("paused");
    expect(r.ok === false && r.message).toMatch(/приостановлен/i);
  });
});

describe("без входа кабинет не отдаётся", () => {
  it("свой кабинет без Authorization → не 200", async () => {
    const res = await call("/v1/partner/me");
    expect([401, 403, 503]).toContain(res.status);
  });

  it("🔴 регистрация без Authorization → не 200", async () => {
    // Иначе партнёром можно стать за кого угодно.
    const res = await call("/v1/partner/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect([401, 403, 503]).toContain(res.status);
  });

  it("Bearer-мусор не принимается", async () => {
    const res = await call("/v1/partner/me", { headers: { Authorization: "Bearer not-a-jwt" } });
    expect([401, 403, 503]).toContain(res.status);
  });
});

describe("условия читаются до регистрации", () => {
  it("программа доступна без партнёрства — иначе решать не по чему", async () => {
    // Человек должен прочитать условия ДО того, как нажмёт кнопку.
    const res = await call("/v1/partner/program");
    expect([200, 401, 503]).toContain(res.status);
  });
});

describe("налоговый статус партнёра", () => {
  /**
   * 🔴 Статус нужен не ради анкеты: от него зависит, удерживаем ли мы НДФЛ из
   * его 20% и сколько он получит на руки. Спрашиваем при первом начислении —
   * регистрация остаётся в один тап (решение владельца 14.08).
   */
  it("без входа статус не поменять", async () => {
    const res = await call("/v1/partner/tax", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taxStatus: "self_employed", inn: "770123456789" }),
    });
    expect(res.status).toBe(401);
  });

  it("выдуманный статус не принимается", async () => {
    const res = await call("/v1/partner/tax", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taxStatus: "оптимизатор" }),
    });
    expect(res.status).toBe(400);
  });

  it("ИНН из букв не принимается", async () => {
    const res = await call("/v1/partner/tax", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taxStatus: "entrepreneur", inn: "не скажу" }),
    });
    expect(res.status).toBe(400);
  });
});
