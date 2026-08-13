import { PLAN_TOPICS_TARGET } from "@x10/agents";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { AppBindings, RateLimiter } from "../src/bindings";
import { PLAN_SLOTS } from "../src/lib/plan-calendar";
import { PLAN_MONTH_TOPICS, checkMakeable, checkMoveTarget } from "../src/routes/admin-plan";

/**
 * Контент-план — маршруты api (спека 13.08).
 *
 * Проверяем то, что иначе всплывёт у клиента: гейт «сделать» (повторное нажатие
 * не должно заводить второй материал), перенос темы и невозможность собрать
 * план или тронуть тему без прав.
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
const ITEM = "00000000-0000-4000-8000-000000000001";

function call(path: string, init?: RequestInit) {
  return createApp().fetch(new Request(`${BASE}${path}`, init), TEST_BINDINGS);
}

describe("договор с агентом", () => {
  it("сколько тем просим — столько же обещает КП", () => {
    expect(PLAN_MONTH_TOPICS).toBe(PLAN_TOPICS_TARGET);
    expect(PLAN_MONTH_TOPICS).toBe(30);
  });
});

describe("гейт «сделать материал»", () => {
  it("запланированную тему сделать можно", () => {
    expect(checkMakeable({ status: "planned", creationId: null }).ok).toBe(true);
  });

  it("🔴 повторное нажатие не заводит второй материал", () => {
    // Без этого одна тема дала бы две статьи, в канал ушёл бы дубль, а автор
    // решил бы, что первая кнопка не сработала. Та же защита, что в «Создать».
    const r = checkMakeable({ status: "done", creationId: ITEM });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("already_made");
  });

  it("🔴 тема, у которой уже есть задание, второй раз не уходит", () => {
    // Статус мог не успеть обновиться — решает наличие задания, а не статус.
    const r = checkMakeable({ status: "planned", creationId: ITEM });
    expect(r.ok === false && r.error).toBe("already_made");
  });

  it("тема в работе повторно не запускается", () => {
    expect(checkMakeable({ status: "running", creationId: null }).ok).toBe(false);
  });
});

describe("перенос темы", () => {
  it("дата и слот из расписания принимаются", () => {
    expect(checkMoveTarget({ plannedFor: "2026-09-15", slot: "12:30" }).ok).toBe(true);
  });

  it("день без времени — допустимое состояние", () => {
    // Слот подберёт очередь при отправке; заставлять человека выбирать время
    // ради переноса на другой день незачем.
    expect(checkMoveTarget({ plannedFor: "2026-09-15", slot: null }).ok).toBe(true);
  });

  it("🔴 слот не из расписания отклоняется", () => {
    // Иначе план пообещает выход в 23:15, когда очередь не разбирается.
    const r = checkMoveTarget({ plannedFor: "2026-09-15", slot: "23:15" });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("bad_slot");
  });

  it("мусорная дата отклоняется", () => {
    for (const bad of ["завтра", "2026-13-01", "15.09.2026", ""]) {
      expect(checkMoveTarget({ plannedFor: bad, slot: null }).ok).toBe(false);
    }
  });

  it("29 февраля високосного года — валидная дата", () => {
    expect(checkMoveTarget({ plannedFor: "2028-02-29", slot: "09:30" }).ok).toBe(true);
  });

  it("🔴 29 февраля невисокосного года — нет", () => {
    // Date в JS молча превращает такую дату в 1 марта, и тема уехала бы на день
    // вперёд без ведома человека.
    expect(checkMoveTarget({ plannedFor: "2026-02-29", slot: null }).ok).toBe(false);
  });

  it("слоты те же, что у календаря", () => {
    expect(PLAN_SLOTS).toContain("09:30");
    expect(PLAN_SLOTS).toHaveLength(4);
  });
});

describe("без прав ничего не собираем и не трогаем", () => {
  it("🔴 сборка плана без Authorization не стартует", async () => {
    // Сборка тратит деньги клиента.
    const res = await call("/plan", { method: "POST" });
    expect([401, 403, 503]).toContain(res.status);
  });

  it("календарь без Authorization не отдаётся", async () => {
    expect([401, 403, 503]).toContain((await call("/plan?range=month")).status);
  });

  it("«сделать» без Authorization не проходит", async () => {
    const res = await call(`/plan/items/${ITEM}/make`, { method: "POST" });
    expect([401, 403, 503]).toContain(res.status);
  });

  it("перенос и удаление темы без Authorization не проходят", async () => {
    const patch = await call(`/plan/items/${ITEM}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plannedFor: "2026-09-15", slot: "12:30" }),
    });
    const del = await call(`/plan/items/${ITEM}`, { method: "DELETE" });
    expect([401, 403, 503]).toContain(patch.status);
    expect([401, 403, 503]).toContain(del.status);
  });
});
