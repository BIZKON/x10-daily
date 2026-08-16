import {
  PARTNER_PROMO_PREFIX,
  partnerPromoLink,
  partnerPromoWebLink,
  routeForStartParam,
} from "@x10/config";
import { describe, expect, it } from "vitest";

/**
 * Ссылки внутрь мини-аппа (спека 7).
 *
 * 🔴 `start_param` приходит из внешнего мира — его читает чужой браузер по
 * чужой ссылке. Проверяем как недоверенный ввод.
 */

describe("куда вести по start_param", () => {
  it("презентация партнёра", () => {
    expect(routeForStartParam("p-ivanov")).toBe("/p/ivanov");
  });

  it("статья из поста канала — как раньше", () => {
    // Механизм общий с постами канала, и ломать его нельзя.
    expect(routeForStartParam("claude-i-gpt-besplatno-6-ai-routerov")).toBe(
      "/article/claude-i-gpt-besplatno-6-ai-routerov",
    );
  });

  it("🔴 обход каталога отвергается", () => {
    expect(routeForStartParam("p-../../etc/passwd")).toBeNull();
    expect(routeForStartParam("../admin")).toBeNull();
    expect(routeForStartParam("p-a/b")).toBeNull();
  });

  it("кириллица и заглавные отвергаются", () => {
    // Слаги у нас транслитом: кириллица в адресе ломает пересылку ссылки.
    expect(routeForStartParam("p-иванов")).toBeNull();
    expect(routeForStartParam("p-Ivanov")).toBeNull();
  });

  it("пустое и мусор — никуда не роутим", () => {
    expect(routeForStartParam("")).toBeNull();
    expect(routeForStartParam(null)).toBeNull();
    expect(routeForStartParam(undefined)).toBeNull();
    expect(routeForStartParam("p-")).toBeNull();
    expect(routeForStartParam(`p-${"a".repeat(200)}`)).toBeNull();
  });
});

describe("ссылка партнёра", () => {
  it("ведёт в мини-апп, а не на сайт", () => {
    expect(partnerPromoLink("Sekretar_Syrov_IP_bot", "ivanov")).toBe(
      "https://t.me/Sekretar_Syrov_IP_bot?startapp=p-ivanov",
    );
  });

  it("собачка в имени бота не ломает ссылку", () => {
    expect(partnerPromoLink("@Sekretar_Syrov_IP_bot", "ivanov")).toContain(
      "t.me/Sekretar_Syrov_IP_bot?startapp=",
    );
  });

  it("параметр ссылки разбирается обратно в тот же путь", () => {
    // Круговая проверка: что собрали — то и разберём.
    const link = partnerPromoLink("bot", "kustrya");
    const param = new URL(link).searchParams.get("startapp");
    expect(param).toBe(`${PARTNER_PROMO_PREFIX}kustrya`);
    expect(routeForStartParam(param)).toBe("/p/kustrya");
  });

  it("веб-ссылка — на тот же экран", () => {
    expect(partnerPromoWebLink("pro-agent-ai.ru", "ivanov")).toBe(
      "https://app.pro-agent-ai.ru/p/ivanov",
    );
  });
});
