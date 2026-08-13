import { describe, expect, it } from "vitest";
import {
  type GateOptions,
  type QueueCandidate,
  type QueueRow,
  pickPostable,
  pickPostableRow,
} from "../src/lib/review-gate";

/**
 * Ворота ревью: что из очереди канала можно публиковать.
 *
 * 🔴 Дефект, ради которого это вынесено в чистую функцию: ворота были написаны
 * как «блокируй, пока карточка ждёт решения», и отсутствие карточки читалось
 * как разрешение. Карточка же рождается только побочным эффектом успешной
 * генерации обложки — а обложка пропускается при выключенной фиче, нехватке
 * баланса, уже готовой картинке и просто не успевает к слоту.
 *
 * Замер на проде 10.08.2026: за три дня 6 постов из 20 ушли в канал вообще без
 * карточки. Ворота по умолчанию открыты — а предохранитель обязан быть закрыт.
 */

const NOW = new Date("2026-08-10T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

function row(over: Partial<QueueCandidate> = {}): QueueCandidate {
  return {
    articleId: over.articleId ?? "a-1",
    queuedAt: over.queuedAt ?? hoursAgo(1),
    awaitingSince: over.awaitingSince ?? null,
    hasAnyCard: over.hasAnyCard ?? true,
  };
}

const opts = (over: Partial<Parameters<typeof pickPostable>[1]> = {}) => ({
  reviewConfigured: true,
  gateHours: 6,
  now: NOW,
  ...over,
});

describe("ворота ревью", () => {
  it("ревью не настроено → ворот нет, берём первую в очереди", () => {
    // Экземпляр без группы «Редакция» работает как раньше: иначе включение
    // ворот стало бы обязательным, а канал у такого клиента замолчал бы.
    const r = pickPostable([row({ articleId: "a-1", hasAnyCard: false })], {
      reviewConfigured: false,
      gateHours: 6,
      now: NOW,
    });
    expect(r).toBe("a-1");
  });

  it("🔴 карточки нет вовсе → НЕ публикуем", () => {
    // Тот самый дефект. Раньше отсутствие карточки читалось как разрешение,
    // и материал уходил в канал, не побывав ни у кого перед глазами.
    expect(pickPostable([row({ hasAnyCard: false })], opts())).toBeNull();
  });

  it("карточки нет, но статья ждёт дольше предохранителя → публикуем", () => {
    // Предохранитель важнее строгости: день без редактора не должен
    // превращаться в день тишины в канале.
    const r = pickPostable([row({ hasAnyCard: false, queuedAt: hoursAgo(7) })], opts());
    expect(r).toBe("a-1");
  });

  it("карточка ждёт решения → НЕ публикуем", () => {
    expect(pickPostable([row({ awaitingSince: hoursAgo(1) })], opts())).toBeNull();
  });

  it("карточка ждёт дольше предохранителя → публикуем", () => {
    const r = pickPostable([row({ awaitingSince: hoursAgo(7) })], opts());
    expect(r).toBe("a-1");
  });

  it("решение принято → публикуем сразу, предохранителя не ждём", () => {
    const r = pickPostable([row({ awaitingSince: null, hasAnyCard: true })], opts());
    expect(r).toBe("a-1");
  });

  it("🔴 жёсткие ворота: без карточки не публикуем никогда", () => {
    // gateHours=0 — задокументированный смысл «предохранитель выключен».
    const old = row({ hasAnyCard: false, queuedAt: hoursAgo(72) });
    expect(pickPostable([old], opts({ gateHours: 0 }))).toBeNull();
  });

  it("жёсткие ворота: ждущая карточка не выпускает материал по времени", () => {
    const old = row({ awaitingSince: hoursAgo(72) });
    expect(pickPostable([old], opts({ gateHours: 0 }))).toBeNull();
  });

  it("🔴 заблокированная голова очереди не держит остальных", () => {
    // Очередь FIFO, но одна статья на ревью не должна означать пустой слот:
    // это ровно тот случай, когда канал молчит без причины.
    const r = pickPostable(
      [
        row({ articleId: "ждёт", awaitingSince: hoursAgo(1), queuedAt: hoursAgo(3) }),
        row({ articleId: "готова", queuedAt: hoursAgo(2) }),
      ],
      opts(),
    );
    expect(r).toBe("готова");
  });

  it("пустая очередь → публиковать нечего", () => {
    expect(pickPostable([], opts())).toBeNull();
  });
});

/**
 * Выбор строки очереди в слот (спека 13.08, дефект §3.12).
 *
 * 🔴 С появлением форматов у материала стало НЕСКОЛЬКО строк на одну площадку:
 * пост, карусель, ролик, ролик с ведущим. Решение владельца — «по одному в
 * слот»: слот забирает ОДИН формат, а не весь материал разом, иначе канал
 * получает четыре публикации подряд.
 */
describe("pickPostableRow — какую строку берём в слот", () => {
  const OPEN: GateOptions = { reviewConfigured: false, gateHours: 0, now: new Date() };
  const t = (min: number) => new Date(Date.UTC(2026, 7, 13, 10, min));

  const row = (over: Partial<QueueRow> = {}): QueueRow => ({
    articleId: "a-1",
    format: "post",
    queuedAt: t(0),
    awaitingSince: null,
    hasAnyCard: true,
    ...over,
  });

  it("берёт голову очереди вместе с её форматом", () => {
    const picked = pickPostableRow([row({ format: "carousel" })], OPEN);
    expect(picked).toEqual({ articleId: "a-1", format: "carousel" });
  });

  it("🔴 у материала четыре формата — за слот уходит ОДИН", () => {
    // Иначе канал получит четыре публикации подряд, и это прочтут как спам.
    const picked = pickPostableRow(
      [
        row({ format: "post", queuedAt: t(0) }),
        row({ format: "carousel", queuedAt: t(1) }),
        row({ format: "video", queuedAt: t(2) }),
        row({ format: "host_video", queuedAt: t(3) }),
      ],
      OPEN,
    );
    expect(picked).toEqual({ articleId: "a-1", format: "post" });
  });

  it("🔴 заблокированная воротами строка не держит остальные", () => {
    // Одна статья на ревью не должна означать пустой слот — канал молчал бы
    // без причины.
    const closed: GateOptions = { reviewConfigured: true, gateHours: 6, now: t(0) };
    const picked = pickPostableRow(
      [
        row({ articleId: "ждёт", awaitingSince: t(0), hasAnyCard: true }),
        row({ articleId: "решён", format: "carousel", hasAnyCard: true }),
      ],
      closed,
    );
    expect(picked).toEqual({ articleId: "решён", format: "carousel" });
  });

  it("пустая очередь — пустой слот, а не падение", () => {
    expect(pickPostableRow([], OPEN)).toBeNull();
  });
});
