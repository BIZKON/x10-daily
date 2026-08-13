import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { AppBindings, RateLimiter } from "../src/bindings";
import {
  MIN_REJECT_REASON,
  buildRequeuePatch,
  checkRejectable,
  checkRequeueable,
  groupPublications,
  isStaleForSlot,
} from "../src/routes/admin-posting";

/**
 * Очередь публикаций: снятие площадкой и возврат в очередь (спека 13.08,
 * реестр разрыва §3.12).
 *
 * Проверяем то, что иначе всплывёт у клиента: ворота обоих переходов, причину
 * снятия, сохранность следа снятия при возврате и то, что выпуском нельзя
 * управлять без прав.
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
const ROW_ID = "00000000-0000-4000-8000-000000000001";

function call(path: string, init?: RequestInit) {
  return createApp().fetch(new Request(`${BASE}${path}`, init), TEST_BINDINGS);
}

describe("гейт снятия площадкой", () => {
  it("опубликованную публикацию снять можно", () => {
    expect(checkRejectable({ status: "posted" }).ok).toBe(true);
  });

  it("🔴 то, что ещё не выходило, снять нельзя", () => {
    // Иначе строка уходит в «снято», не побывав в канале: слот её больше не
    // возьмёт, и материал молча пропадёт из выпуска.
    const r = checkRejectable({ status: "queued" });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("invalid_state");
    expect(r.ok === false && r.message).toMatch(/не выходил|очеред/i);
  });

  it("🔴 повторное снятие отклоняется", () => {
    // Второе нажатие затёрло бы первую причину и время — след снятия должен
    // оставаться тем, что записал человек в первый раз.
    const r = checkRejectable({ status: "rejected" });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("already_rejected");
  });
});

describe("гейт возврата в очередь", () => {
  it("снятую публикацию вернуть можно", () => {
    expect(checkRequeueable({ status: "rejected" }).ok).toBe(true);
  });

  it("🔴 живую публикацию вернуть в очередь нельзя", () => {
    // Строка ушла бы на второй круг, и тот же материал вышел бы в канал дважды.
    const r = checkRequeueable({ status: "posted" });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("invalid_state");
  });

  it("то, что и так в очереди, возвращать нечего", () => {
    const r = checkRequeueable({ status: "queued" });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("invalid_state");
  });
});

describe("возврат в очередь", () => {
  it("🔴 не стирает след снятия", () => {
    // Спека §7: причина и время снятия ОСТАЮТСЯ. Иначе второй заход выглядит
    // первым, и та же причина повторяется — снимут снова.
    const patch = buildRequeuePatch(new Date());
    expect(patch).not.toHaveProperty("rejectedAt");
    expect(patch).not.toHaveProperty("rejectedReason");
  });

  it("возвращает строку в очередь и убирает следы публикации", () => {
    const patch = buildRequeuePatch(new Date("2026-08-13T12:00:00.000Z"));
    expect(patch.status).toBe("queued");
    expect(patch.postedAt).toBeNull();
    expect(patch.postRef).toBeNull();
  });

  it("🔴 строка встаёт в очередь заново, а не остаётся со старым временем", () => {
    // Слот берёт только строки не старше суток (STALE_HOURS в
    // drain-post-slots). Публикацию снимают обычно на следующий день, и со
    // старым `created_at` возвращённая строка не вышла бы НИКОГДА: кнопка
    // отработала бы молча и без эффекта.
    const at = new Date("2026-08-13T12:00:00.000Z");
    expect(buildRequeuePatch(at).createdAt).toBe(at);
  });
});

describe("список публикаций", () => {
  const row = (over: Partial<Parameters<typeof groupPublications>[0][number]>) => ({
    id: ROW_ID,
    articleId: "art-1",
    slug: "kak-agent-snyal-40-chasov",
    title: "Как ИИ-агент снял 40 часов",
    channel: "tg" as const,
    format: "post" as const,
    status: "posted" as const,
    postedAt: "2026-08-13T09:30:00.000Z",
    rejectedAt: null,
    rejectedReason: null,
    postRef: "555",
    attempts: 0,
    lastError: null,
    createdAt: "2026-08-13T06:00:00.000Z",
    ...over,
  });

  it("🔴 форматы одного материала собираются в одну карточку", () => {
    // Ровно то, что чинит миграция 0033: один материал живёт в площадке
    // столько раз, сколько у него форматов. Рассыпанные по ленте строки этого
    // не показывают.
    const cards = groupPublications([
      row({ format: "post" }),
      row({ id: "row-2", format: "carousel", status: "queued", postedAt: null, postRef: null }),
    ]);

    expect(cards).toHaveLength(1);
    expect(cards[0]?.rows.map((r) => r.format)).toEqual(["post", "carousel"]);
  });

  it("разные материалы не смешиваются", () => {
    const cards = groupPublications([
      row({}),
      row({ id: "row-2", articleId: "art-2", slug: "vtoraya", title: "Вторая" }),
    ]);
    expect(cards).toHaveLength(2);
  });

  it("форматы внутри карточки идут в одном порядке независимо от базы", () => {
    // Иначе карточка каждый раз перетасовывается, и человек ищет строку заново.
    const cards = groupPublications([
      row({ id: "r1", format: "video" }),
      row({ id: "r2", format: "post" }),
      row({ id: "r3", format: "carousel" }),
    ]);
    expect(cards[0]?.rows.map((r) => r.format)).toEqual(["post", "carousel", "video"]);
  });

  it("свежий материал идёт первым", () => {
    const cards = groupPublications([
      row({ id: "r1", articleId: "art-1", postedAt: "2026-08-10T09:30:00.000Z" }),
      row({
        id: "r2",
        articleId: "art-2",
        slug: "svezhaya",
        title: "Свежая",
        postedAt: "2026-08-13T09:30:00.000Z",
      }),
    ]);
    expect(cards[0]?.articleId).toBe("art-2");
  });
});

describe("окно свежести очереди", () => {
  const now = new Date("2026-08-13T18:00:00.000Z");

  it("свежая строка очереди ждёт слота", () => {
    expect(isStaleForSlot({ status: "queued", createdAt: "2026-08-13T09:00:00.000Z" }, now)).toBe(
      false,
    );
  });

  it("🔴 строка старше суток не выйдет никогда — это надо показывать", () => {
    // На проде 13.08 из 2432 строк «в очереди» слот видел ПЯТЬ: остальные
    // старше окна свежести. Счётчик без этой пометки врал бы клиенту в
    // пятьсот раз — он бы думал, что две тысячи материалов ждут выхода.
    expect(isStaleForSlot({ status: "queued", createdAt: "2026-08-11T09:00:00.000Z" }, now)).toBe(
      true,
    );
  });

  it("к опубликованному и снятому окно свежести отношения не имеет", () => {
    const old = "2026-08-01T09:00:00.000Z";
    expect(isStaleForSlot({ status: "posted", createdAt: old }, now)).toBe(false);
    expect(isStaleForSlot({ status: "rejected", createdAt: old }, now)).toBe(false);
  });
});

describe("причина снятия обязательна", () => {
  it("🔴 снятие без причины не принимается", async () => {
    // «Сняли» без причины не помогает ни повторить, ни не повторить: через
    // неделю никто не вспомнит, за что именно площадка убрала пост.
    const res = await call(`/posting/publications/${ROW_ID}/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "   " }),
    });
    expect(res.status).toBe(400);
  });

  it("отписка в один символ не принимается", async () => {
    const res = await call(`/posting/publications/${ROW_ID}/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "-".repeat(MIN_REJECT_REASON - 1) }),
    });
    expect(res.status).toBe(400);
  });
});

describe("без прав выпуском не управляют", () => {
  it("список публикаций без Authorization → не 200", async () => {
    const res = await call("/posting/publications");
    expect([401, 403, 503]).toContain(res.status);
  });

  it("🔴 снятие без Authorization → не 200", async () => {
    const res = await call(`/posting/publications/${ROW_ID}/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "реклама без маркировки" }),
    });
    expect([401, 403, 503]).toContain(res.status);
  });

  it("🔴 возврат в очередь без Authorization → не 200", async () => {
    const res = await call(`/posting/publications/${ROW_ID}/requeue`, { method: "POST" });
    expect([401, 403, 503]).toContain(res.status);
  });

  it("Bearer-мусор не принимается", async () => {
    const res = await call("/posting/publications", {
      headers: { Authorization: "Bearer not-a-jwt" },
    });
    expect([401, 403, 503]).toContain(res.status);
  });
});
