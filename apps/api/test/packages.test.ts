import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PACKAGE_INFO, PACKAGE_PRICES_RUB, formatDealNo } from "@x10/config";
import { DEAL_PACKAGES } from "@x10/db";
import { describe, expect, it } from "vitest";

/**
 * Прайс и состав пакетов (спека 7).
 *
 * Страница оплаты — последний экран перед списанием сотен тысяч рублей. Если
 * состав разъедется с коммерческим предложением, клиент заметит это именно там.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("пакеты", () => {
  it("у каждого пакета сделки есть цена и состав", () => {
    for (const key of DEAL_PACKAGES) {
      expect(PACKAGE_PRICES_RUB[key], `нет цены у пакета ${key}`).toBeGreaterThan(0);
      expect(PACKAGE_INFO[key].includes.length, `пустой состав у пакета ${key}`).toBeGreaterThan(0);
    }
  });

  it("цена в составе совпадает с прайсом: двух правд о цене не бывает", () => {
    for (const key of DEAL_PACKAGES) {
      expect(PACKAGE_INFO[key].priceRub).toBe(PACKAGE_PRICES_RUB[key]);
    }
  });

  it("🔴 цены совпадают с теми, что напечатаны в КП", () => {
    // Документ у клиента на руках. Расхождение обнаружится на кнопке оплаты.
    const kp = readFileSync(path.join(ROOT, "landing/kp/template.html"), "utf8");
    expect(kp).toContain("180 000 ₽");
    expect(kp).toContain("350 000 ₽");
    expect(PACKAGE_PRICES_RUB.manual).toBe(180_000);
    expect(PACKAGE_PRICES_RUB.line).toBe(350_000);
  });

  it("⚠️ непостроенное в состав не попадает", () => {
    // Голосовое управление продаётся в КП с 14.08, но не построено (§3.15
    // реестра). Повторять обещание в момент оплаты нельзя.
    //
    // 🔴 Проверяем ФОРМУЛИРОВКУ, а не слово: «ваш голос» — это тон редакции, он
    // построен и в составе стоять обязан. Проверка на подстроку «голос» уже
    // роняла честный текст 15.08 — та же грабля, что была с «взносом».
    const all = Object.values(PACKAGE_INFO)
      .flatMap((p) => p.includes)
      .join(" ")
      .toLowerCase();
    expect(all).not.toContain("голосовое управление");
    expect(all).not.toContain("надиктов");
    // А тон редакции — на месте.
    expect(all).toContain("ваш голос");
  });
});

describe("номер заказа", () => {
  it("нумерация с единицы, четыре знака", () => {
    expect(formatDealNo(1)).toBe("0001");
    expect(formatDealNo(7)).toBe("0007");
    expect(formatDealNo(42)).toBe("0042");
    expect(formatDealNo(999)).toBe("0999");
    expect(formatDealNo(1042)).toBe("1042");
  });

  it("длинный номер не обрезается", () => {
    // Потерянный разряд — это другой заказ, а не короткий номер.
    expect(formatDealNo(10_000)).toBe("10000");
  });
});
