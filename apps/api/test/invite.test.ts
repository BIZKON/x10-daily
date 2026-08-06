import { describe, expect, it, vi } from "vitest";
import { hashInviteToken, newInviteToken } from "../src/lib/invite-token";
import { redeemInvite } from "../src/lib/redeem-invite";

/**
 * Приглашения в команду (Спека 5). Проверяем то, что нельзя проверить глазами:
 * секрет не хранится, ссылка одноразовая, а гонку разрешает БАЗА.
 */

describe("секрет пригласительной ссылки", () => {
  it("каждый вызов даёт новый секрет", () => {
    const a = newInviteToken();
    const b = newInviteToken();
    expect(a).not.toBe(b);
  });

  it("достаточно длинный, чтобы не подбирался перебором", () => {
    expect(newInviteToken().length).toBeGreaterThanOrEqual(32);
  });

  it("без похожих символов: ссылку иногда переписывают руками", () => {
    // l/1 и 0/o путают при переписывании и диктовке.
    const t = newInviteToken();
    expect(t).not.toMatch(/[l10o]/);
  });

  it("🔴 хеш детерминирован и не равен самому секрету", async () => {
    const t = newInviteToken();
    const h1 = await hashInviteToken(t);
    const h2 = await hashInviteToken(t);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(t);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("разные секреты — разные хеши", async () => {
    expect(await hashInviteToken("aaaa")).not.toBe(await hashInviteToken("bbbb"));
  });
});

/**
 * Мок БД: цепочки drizzle. `updateResults` — очередь ответов на .returning()
 * у update, `selectResults` — у select.
 */
function makeDb(opts: {
  updateResults?: Array<Array<Record<string, unknown>>>;
  selectResults?: Array<Array<Record<string, unknown>>>;
  insertResults?: Array<Array<Record<string, unknown>>>;
}) {
  const updates: Array<{ set: Record<string, unknown>; hadWhere: boolean }> = [];
  const updateResults = [...(opts.updateResults ?? [])];
  const selectResults = [...(opts.selectResults ?? [])];
  const insertResults = [...(opts.insertResults ?? [])];

  const db = {
    update: () => ({
      set: (v: Record<string, unknown>) => {
        const chain = {
          where: () => {
            updates.push({ set: v, hadWhere: true });
            return {
              returning: async () => updateResults.shift() ?? [],
            };
          },
          // update без where — если такое появится, тест это заметит
          returning: async () => {
            updates.push({ set: v, hadWhere: false });
            return updateResults.shift() ?? [];
          },
        };
        return chain;
      },
    }),
    select: () => {
      const chain: Record<string, unknown> = {
        from: () => chain,
        where: () => chain,
        limit: async () => selectResults.shift() ?? [],
      };
      return chain;
    },
    insert: () => ({
      values: () => ({ returning: async () => insertResults.shift() ?? [] }),
    }),
  };
  return { db: db as never, updates };
}

const PROFILE = {
  platformUserId: "777",
  username: "petya",
  displayName: "Пётр",
  avatarUrl: null,
};

describe("погашение приглашения", () => {
  it("🔴 занятие использования идёт УСЛОВНЫМ update: проверки живут в WHERE, не в коде", async () => {
    const { db, updates } = makeDb({
      updateResults: [
        [{ id: "inv-1", role: "editor" }], // занять использование
        [{ id: "u-1", role: "editor", displayName: "Пётр", username: "petya", avatarUrl: null, locale: "ru" }],
        [], // markAccepted
      ],
    });

    const r = await redeemInvite(db, { token: "t".repeat(32), existingUserId: "u-1", ...PROFILE });

    expect(r.ok).toBe(true);
    // Первый UPDATE обязан иметь WHERE: без него счётчик поднялся бы у всех
    // приглашений сразу, а гонку разрешал бы порядок запросов.
    expect(updates[0]?.hadWhere).toBe(true);
    expect(updates[0]?.set).toHaveProperty("usedCount");
  });

  it("🔴 ссылка исчерпана/отозвана/просрочена → отказ, роль НЕ выдаётся", async () => {
    const { db, updates } = makeDb({
      updateResults: [[]], // условный update ничего не занял
      selectResults: [[{ id: "inv-1" }]], // приглашение существует
    });

    const r = await redeemInvite(db, { token: "t".repeat(32), existingUserId: "u-1", ...PROFILE });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(409);
      expect(r.message).toMatch(/не действует/i);
    }
    // Ни одного UPDATE по users — роль не выдана.
    expect(updates).toHaveLength(1);
  });

  it("несуществующая ссылка отличается от протухшей: человеку важно понимать, что не так", async () => {
    const { db } = makeDb({ updateResults: [[]], selectResults: [[]] });

    const r = await redeemInvite(db, { token: "t".repeat(32), existingUserId: null, ...PROFILE });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(404);
      expect(r.message).toMatch(/не найдено/i);
    }
  });

  it("новый человек заводится с ролью из приглашения", async () => {
    const { db } = makeDb({
      updateResults: [[{ id: "inv-1", role: "viewer" }], []],
      insertResults: [
        [
          {
            id: "u-new",
            role: "subscriber",
            displayName: "Пётр",
            username: "petya",
            avatarUrl: null,
            locale: "ru",
          },
        ],
      ],
    });

    const r = await redeemInvite(db, { token: "t".repeat(32), existingUserId: null, ...PROFILE });

    expect(r.ok).toBe(true);
    // viewer → subscriber: роль интерфейса легла на значение PG-enum.
    if (r.ok) expect(r.user.role).toBe("subscriber");
  });

  it("уже существующий читатель повышается, а не дублируется", async () => {
    const { db, updates } = makeDb({
      updateResults: [
        [{ id: "inv-1", role: "author" }],
        [
          {
            id: "u-1",
            role: "author",
            displayName: "Пётр",
            username: "petya",
            avatarUrl: null,
            locale: "ru",
          },
        ],
        [],
      ],
    });

    const r = await redeemInvite(db, { token: "t".repeat(32), existingUserId: "u-1", ...PROFILE });

    expect(r.ok).toBe(true);
    expect(updates[1]?.set.role).toBe("author");
  });

  it("пустой ник из Telegram не затирает уже известное имя", async () => {
    const { db, updates } = makeDb({
      updateResults: [
        [{ id: "inv-1", role: "editor" }],
        [
          {
            id: "u-1",
            role: "editor",
            displayName: "Пётр",
            username: "petya",
            avatarUrl: null,
            locale: "ru",
          },
        ],
        [],
      ],
    });

    await redeemInvite(db, {
      token: "t".repeat(32),
      existingUserId: "u-1",
      platformUserId: "777",
      username: null,
      displayName: null,
      avatarUrl: null,
    });

    const set = updates[1]?.set ?? {};
    expect(set).not.toHaveProperty("username");
    expect(set).not.toHaveProperty("displayName");
  });
});
