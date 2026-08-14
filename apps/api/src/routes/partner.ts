import { zValidator } from "@hono/zod-validator";
import { MENTOR_BONUS_MONTHS, MENTOR_RATE_PERCENT, PARTNER_RATE_PERCENT } from "@x10/config";
import {
  and,
  dealPayments,
  desc,
  eq,
  partnerAccruals,
  partnerDeals,
  partnerPayouts,
  partners,
  sql,
  users,
} from "@x10/db";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv } from "../app";
import { extractSession } from "../auth";
import { getDb } from "../db";
import { getEnv } from "../env";
import { partnerBalance } from "../lib/partner-money";

/**
 * Партнёрский кабинет в мини-аппе (спека 14.08).
 *
 * Читатель канала — самый вероятный партнёр: он уже понял, что делает продукт.
 * Поэтому программа живёт там же, где он читает, а не в админке: вход по
 * Telegram у него уже есть, и «стать партнёром» — это один тап, а не анкета.
 *
 * 🔴 Раздел включается настройкой ЭКЗЕМПЛЯРА. Завод продаётся клиентам копиями,
 * а партнёрская программа наша: без флага в кабинете клиента появилась бы
 * кнопка «Стать партнёром» с нашими условиями и нашими деньгами.
 */

/** Включена ли программа в этом экземпляре. По умолчанию — нет. */
export function partnersEnabled(env: Record<string, unknown>): boolean {
  return String(env.X10_PARTNERS_ENABLED ?? "") === "1";
}

/**
 * Условия, которые человек читает до нажатия кнопки.
 *
 * 🔴 Формулировки не украшение: доля платится с ОПЛАЧЕННОГО клиентом, и это
 * должно быть написано прямо. Плата за приведённых людей вместо продаж — признак
 * финансовой пирамиды (ст. 172.2 УК РФ), поэтому слов о взносах и «вступлении»
 * здесь нет и быть не может.
 */
export function publicProgram() {
  return {
    partnerRatePercent: PARTNER_RATE_PERCENT,
    mentorRatePercent: MENTOR_RATE_PERCENT,
    mentorMonths: MENTOR_BONUS_MONTHS,
    terms: [
      `Вы получаете ${PARTNER_RATE_PERCENT}% с каждой оплаты клиента, которого привели.`,
      "Клиент платит частями — ваша доля приходит с каждой частью, как только деньги получены.",
      `Привели партнёра — ${MENTOR_RATE_PERCENT}% с его продаж ещё ${MENTOR_BONUS_MONTHS} месяцев, сверх его доли.`,
      "Участие бесплатное: ни взносов, ни обязательных покупок.",
      "Выплата — на карту или счёт, после того как оплата клиента поступила нам.",
    ],
  };
}

export type PartnerGate = { ok: true } | { ok: false; error: string; message: string };

/** Можно ли стать партнёром этому человеку. */
export function checkJoinable(args: {
  existing: { id: string; status: string } | null;
}): PartnerGate {
  const { existing } = args;
  if (!existing) return { ok: true };
  if (existing.status === "paused") {
    return {
      ok: false,
      error: "paused",
      message: "Ваше участие приостановлено. Напишите нам — разберёмся и вернём доступ.",
    };
  }
  // Второй аккаунт завёл бы вторую ветку дерева на того же человека.
  return { ok: false, error: "already_partner", message: "Вы уже участвуете в программе." };
}

const joinSchema = z.object({
  /** Кто пригласил: slug партнёра из ссылки-приглашения. */
  ref: z.string().trim().max(64).optional(),
});

const num = (v: unknown): number => Number(v ?? 0);
const iso = (v: Date | string | null): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString() : String(v);

/** Общий гейт: раздел выключен — маршрута как будто нет. */
function requireEnabled(c: { env: unknown }) {
  const env = getEnv(c.env as never);
  if (!partnersEnabled(env as unknown as Record<string, unknown>)) {
    throw new HTTPException(404, { message: "Партнёрская программа в этом кабинете не включена" });
  }
  return env;
}

export const partnerRoute = new Hono<AppEnv>()
  /**
   * GET /v1/partner/program
   * Условия программы плюс «участвую ли я». Читается ДО регистрации.
   */
  .get("/program", async (c) => {
    const env = requireEnabled(c);
    const claims = await extractSession(c);
    const db = getDb(env.DATABASE_URL);

    const [me] = await db
      .select({ id: partners.id, status: partners.status, slug: partners.slug })
      .from(partners)
      .where(eq(partners.userId, claims.userId))
      .limit(1);

    return c.json({
      program: publicProgram(),
      isPartner: Boolean(me && me.status === "active"),
      status: me?.status ?? null,
    });
  })

  /**
   * POST /v1/partner/join
   * Регистрация в один тап: человек уже вошёл через Telegram.
   */
  .post("/join", zValidator("json", joinSchema), async (c) => {
    const env = requireEnabled(c);
    const claims = await extractSession(c);
    const db = getDb(env.DATABASE_URL);
    const { ref } = c.req.valid("json");

    const [existing] = await db
      .select({ id: partners.id, status: partners.status })
      .from(partners)
      .where(eq(partners.userId, claims.userId))
      .limit(1);

    const gate = checkJoinable({ existing: existing ?? null });
    if (!gate.ok) return c.json({ error: gate.error, message: gate.message }, 409);

    // Имя берём из профиля: спрашивать то, что уже известно, — лишний шаг.
    const [user] = await db
      .select({ displayName: users.displayName, username: users.username })
      .from(users)
      .where(eq(users.id, claims.userId))
      .limit(1);
    const name = user?.displayName?.trim() || user?.username || "Партнёр";

    // Наставник — по ссылке-приглашению. Себя пригласить нельзя: проверка ниже
    // покрывает случай, когда человек открыл собственную ссылку.
    let parentId: string | null = null;
    if (ref) {
      const [mentor] = await db
        .select({ id: partners.id, userId: partners.userId, status: partners.status })
        .from(partners)
        .where(eq(partners.slug, ref))
        .limit(1);
      if (mentor && mentor.status === "active" && mentor.userId !== claims.userId) {
        parentId = mentor.id;
      }
    }

    const [created] = await db
      .insert(partners)
      .values({
        userId: claims.userId,
        name,
        contact: user?.username ? `@${user.username}` : null,
        ratePercent: String(PARTNER_RATE_PERCENT),
        parentId,
      })
      .returning({ id: partners.id, name: partners.name, joinedAt: partners.joinedAt });

    if (!created) return c.json({ error: "create_failed" }, 500);
    return c.json({ id: created.id, name: created.name, joinedAt: iso(created.joinedAt) }, 201);
  })

  /**
   * GET /v1/partner/me
   * Кабинет: сводка, сделки, начисления, выплаты, приведённые партнёры.
   */
  .get("/me", async (c) => {
    const env = requireEnabled(c);
    const claims = await extractSession(c);
    const db = getDb(env.DATABASE_URL);

    const [me] = await db
      .select({
        id: partners.id,
        name: partners.name,
        slug: partners.slug,
        status: partners.status,
        ratePercent: partners.ratePercent,
        parentId: partners.parentId,
        joinedAt: partners.joinedAt,
      })
      .from(partners)
      .where(eq(partners.userId, claims.userId))
      .limit(1);

    if (!me) return c.json({ error: "not_partner" }, 404);

    const [dealRows, accrualRows, payoutRows, invitedRows, paidRows, soldRows] = await Promise.all([
      db
        .select({
          id: partnerDeals.id,
          clientName: partnerDeals.clientName,
          package: partnerDeals.package,
          amountRub: partnerDeals.amountRub,
          ratePercent: partnerDeals.ratePercent,
          status: partnerDeals.status,
          signedAt: partnerDeals.signedAt,
          createdAt: partnerDeals.createdAt,
        })
        .from(partnerDeals)
        .where(eq(partnerDeals.partnerId, me.id))
        .orderBy(desc(partnerDeals.createdAt))
        .limit(50),
      db
        .select({
          id: partnerAccruals.id,
          amountRub: partnerAccruals.amountRub,
          level: partnerAccruals.level,
          reason: partnerAccruals.reason,
          ratePercent: partnerAccruals.ratePercent,
          createdAt: partnerAccruals.createdAt,
        })
        .from(partnerAccruals)
        .where(eq(partnerAccruals.partnerId, me.id))
        .orderBy(desc(partnerAccruals.createdAt))
        .limit(50),
      db
        .select({
          id: partnerPayouts.id,
          amountRub: partnerPayouts.amountRub,
          paidAt: partnerPayouts.paidAt,
          method: partnerPayouts.method,
        })
        .from(partnerPayouts)
        .where(eq(partnerPayouts.partnerId, me.id))
        .orderBy(desc(partnerPayouts.paidAt))
        .limit(50),
      // Приведённые партнёры: наставник видит ОБОРОТ, но не чужих клиентов по
      // именам. Процент — не повод открывать чужую клиентскую базу.
      db
        .select({
          id: partners.id,
          name: partners.name,
          joinedAt: partners.joinedAt,
        })
        .from(partners)
        .where(eq(partners.parentId, me.id))
        .orderBy(desc(partners.joinedAt))
        .limit(50),
      // 🔴 Суммы — отдельными группировками. Коррелированный подзапрос в
      // drizzle тихо возвращал ноль при верных данных (живой прогон 14.08):
      // кабинет показывал бы партнёру нули по оплаченным сделкам.
      db
        .select({ dealId: dealPayments.dealId, total: sql<string>`sum(${dealPayments.amountRub})` })
        .from(dealPayments)
        .innerJoin(partnerDeals, eq(partnerDeals.id, dealPayments.dealId))
        .where(eq(partnerDeals.partnerId, me.id))
        .groupBy(dealPayments.dealId),
      db
        .select({
          partnerId: partnerDeals.partnerId,
          total: sql<string>`sum(${dealPayments.amountRub})`,
        })
        .from(dealPayments)
        .innerJoin(partnerDeals, eq(partnerDeals.id, dealPayments.dealId))
        .groupBy(partnerDeals.partnerId),
    ]);

    const paidByDeal = new Map(paidRows.map((r) => [r.dealId, num(r.total)]));
    const soldByPartner = new Map(soldRows.map((r) => [r.partnerId, num(r.total)]));

    const balance = partnerBalance(
      accrualRows.map((a) => ({ amountRub: num(a.amountRub) })),
      payoutRows.map((p) => ({ amountRub: num(p.amountRub) })),
    );

    return c.json({
      partner: {
        id: me.id,
        name: me.name,
        slug: me.slug,
        status: me.status,
        ratePercent: num(me.ratePercent),
        hasMentor: Boolean(me.parentId),
        joinedAt: iso(me.joinedAt),
        /** Ссылка на его версию КП — то, что он отправляет клиенту. */
        kpUrl: me.slug
          ? `https://app.${env.X10_BASE_DOMAIN ?? "pro-agent-ai.ru"}/kp/${me.slug}/`
          : null,
      },
      balance,
      program: publicProgram(),
      deals: dealRows.map((d) => ({
        id: d.id,
        clientName: d.clientName,
        package: d.package,
        amountRub: num(d.amountRub),
        paidRub: paidByDeal.get(d.id) ?? 0,
        ratePercent: num(d.ratePercent),
        status: d.status,
        signedAt: iso(d.signedAt),
        createdAt: iso(d.createdAt),
      })),
      accruals: accrualRows.map((a) => ({
        id: a.id,
        amountRub: num(a.amountRub),
        level: a.level,
        reason: a.reason,
        ratePercent: num(a.ratePercent),
        createdAt: iso(a.createdAt),
      })),
      payouts: payoutRows.map((p) => ({
        id: p.id,
        amountRub: num(p.amountRub),
        paidAt: iso(p.paidAt),
        method: p.method,
      })),
      invited: invitedRows.map((p) => ({
        id: p.id,
        name: p.name,
        joinedAt: iso(p.joinedAt),
        soldRub: soldByPartner.get(p.id) ?? 0,
      })),
    });
  });
