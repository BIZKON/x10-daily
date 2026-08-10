import { describe, expect, it } from "vitest";
import { CREATION_SYSTEM, creationInputSchema } from "../src/agents/creation";

/**
 * CreationAgent — ручной режим, раздел «Создать».
 *
 * Проверяем не красоту промпта, а решения, которые в нём закреплены. Главное из
 * них: `guidance` режима говорит, ЧТО делать, но канон издания сильнее — иначе
 * настройка режима у клиента становится дырой в голосе и в правде.
 */

const OK = { guidance: "Напиши пост", topic: "Как мы сократили сверку склада" };

describe("канон сильнее настроек режима", () => {
  it("🔴 несёт чёрный список ЦЕЛИКОМ, а не ссылку на него", () => {
    // Ссылка на канон в промпте бесполезна: модель не пойдёт её читать.
    expect(CREATION_SYSTEM).toContain("революционный");
    expect(CREATION_SYSTEM).toContain("магия нейросетей");
  });

  it("держит только русский язык", () => {
    expect(CREATION_SYSTEM).toMatch(/только русск/i);
  });

  it("🔴 запрещает выдумывать цифры, цены и кейсы клиента", () => {
    // Самый дорогой отказ: выдуманная цена или кейс уедут клиенту в канал и
    // станут его публичным обещанием.
    expect(CREATION_SYSTEM).toMatch(/не выдумывай/i);
    expect(CREATION_SYSTEM).toMatch(/цен/i);
  });

  it("🔴 указание режима не отменяет канон", () => {
    expect(CREATION_SYSTEM).toMatch(/не отменяет канон/i);
  });

  it("велит опираться на сведения о клиенте, а не на общие знания об отрасли", () => {
    expect(CREATION_SYSTEM).toMatch(/сведени/i);
  });

  it("требует пользы в часах, деньгах или конверсии — отстройка от хайпа", () => {
    expect(CREATION_SYSTEM).toMatch(/час|деньг|конверси/i);
  });
});

describe("контракт агента", () => {
  it("🔴 без guidance режим неотличим от пустого поля чата", () => {
    // Вся разница ручного режима с чатом держится на этом поле.
    expect(creationInputSchema.safeParse({ ...OK, guidance: "" }).success).toBe(false);
  });

  it("пустая тема не принимается", () => {
    expect(creationInputSchema.safeParse({ ...OK, topic: "" }).success).toBe(false);
  });

  it("тема ограничена по длине — простыню в промпт не пускаем", () => {
    expect(creationInputSchema.safeParse({ ...OK, topic: "x".repeat(2001) }).success).toBe(false);
  });

  it("знания необязательны: пустая база не должна блокировать создание", () => {
    expect(creationInputSchema.safeParse(OK).success).toBe(true);
  });

  it("принимает знания клиента отдельным полем", () => {
    expect(
      creationInputSchema.safeParse({ ...OK, knowledge: "## Цены\nОт 120 тысяч" }).success,
    ).toBe(true);
  });
});
