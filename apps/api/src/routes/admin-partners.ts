import { zValidator } from "@hono/zod-validator";
import { MAX_INSTALLMENT_MONTHS } from "@x10/config";
import {
  DEAL_PACKAGES,
  PARTNER_TAX_STATUSES,
  type PartnerTaxStatus,
  dealPayments,
  desc,
  eq,
  inArray,
  partnerAccruals,
  partnerDeals,
  partnerPayouts,
  partners,
  sql,
} from "@x10/db";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requirePermission } from "../auth";
import { getDb } from "../db";
import { getEnv } from "../env";
import { payoutBreakdown, wouldMakeCycle } from "../lib/partner-money";
import { normalizeSlug } from "../lib/partner-slug";
import { generatePayToken } from "../lib/pay-token";
import { notifyPaymentSettled } from "../lib/payment-notify";
import { refundDealPayment, settleDealPayment } from "../lib/payment-settle";
import { payUrlFor } from "./partner";

/**
 * Партнёрская программа со стороны владельца (спека 14.08).
 *
 * Сделки и платежи заводит человек: автоматического источника нет, пока не
 * построен магазин. Когда он появится, платежи начнут приходить вебхуком
 * ЮKassa — но начисление будет считать та же функция, что и здесь.
 *
 * Право `partners.manage` — только владелец: это чужие деньги и обязательства
 * наружу, редактор ведёт выпуск, а не расчёты с партнёрами.
 */

const idParam = z.object({ id: z.string().uuid() });

const dealSchema = z.object({
  clientName: z.string().trim().min(2).max(200),
  clientContact: z.string().trim().max(200).optional(),
  package: z.enum(DEAL_PACKAGES),
  amountRub: z.coerce.number().positive().max(100_000_000),
  /** Ставка сделки. Пусто — берём текущую ставку партнёра и копируем в сделку. */
  ratePercent: z.coerce.number().min(0).max(100).optional(),
  /** График рассрочки в месяцах. Потолок — решение владельца. */
  installmentMonths: z.coerce.number().int().min(1).max(MAX_INSTALLMENT_MONTHS).default(1),
  note: z.string().trim().max(2000).optional(),
});

const paymentSchema = z.object({
  amountRub: z.coerce.number().positive().max(100_000_000),
  paidAt: z.string().datetime().optional(),
  note: z.string().trim().max(500).optional(),
});

const refundSchema = z.object({
  /** Сколько вернули клиенту. Положительное: знак ставит сторно, а не человек. */
  amountRub: z.coerce.number().positive().max(100_000_000),
  refundedAt: z.string().datetime().optional(),
  note: z.string().trim().max(500).optional(),
});

const payoutSchema = z.object({
  amountRub: z.coerce.number().positive().max(100_000_000),
  paidAt: z.string().datetime().optional(),
  method: z.string().trim().max(64).optional(),
  note: z.string().trim().max(500).optional(),
});

const mentorSchema = z.object({ parentId: z.string().uuid().nullable() });

const profileSchema = z.object({
  /** Адрес его версии КП: `/kp/<slug>/`. Пусто — персональной страницы нет. */
  slug: z.string().trim().max(64).nullable().optional(),
  name: z.string().trim().min(2).max(160).optional(),
  contact: z.string().trim().max(200).nullable().optional(),
  ratePercent: z.coerce.number().min(0).max(100).optional(),
  status: z.enum(["active", "paused"]).optional(),
  /** Налоговый статус: от него зависит, удерживаем ли мы НДФЛ при выплате. */
  taxStatus: z.enum(PARTNER_TAX_STATUSES).nullable().optional(),
  inn: z
    .string()
    .trim()
    .regex(/^\d{10,12}$/, "ИНН — это 10 или 12 цифр")
    .nullable()
    .optional(),
});

const num = (v: unknown): number => Number(v ?? 0);
const iso = (v: Date | string | null): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString() : String(v);

export const adminPartnersRoute = new Hono<AppEnv>()
  /**
   * GET /v1/admin/partners
   * Партнёры с балансами: начислено, выплачено, к выплате.
   */
  .get("/partners", async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requirePermission(c, db, "partners.manage");

    // 🔴 Суммы берём ОТДЕЛЬНЫМИ группировками, а не коррелированным подзапросом
    // внутри select. Живой прогон 14.08: подзапрос в drizzle тихо возвращал
    // ноль при верных данных в базе — тот же SQL руками считал правильно.
    // Группировка предсказуема, читается глазами и стоит два запроса вместо N.
    const [rows, accruedRows, paidRows] = await Promise.all([
      db
        .select({
          id: partners.id,
          name: partners.name,
          slug: partners.slug,
          contact: partners.contact,
          status: partners.status,
          ratePercent: partners.ratePercent,
          parentId: partners.parentId,
          joinedAt: partners.joinedAt,
        })
        .from(partners)
        .orderBy(desc(partners.joinedAt))
        .limit(200),
      db
        .select({
          partnerId: partnerAccruals.partnerId,
          total: sql<string>`sum(${partnerAccruals.amountRub})`,
        })
        .from(partnerAccruals)
        .groupBy(partnerAccruals.partnerId),
      db
        .select({
          partnerId: partnerPayouts.partnerId,
          total: sql<string>`sum(${partnerPayouts.amountRub})`,
        })
        .from(partnerPayouts)
        .groupBy(partnerPayouts.partnerId),
    ]);

    const accruedBy = new Map(accruedRows.map((r) => [r.partnerId, num(r.total)]));
    const paidBy = new Map(paidRows.map((r) => [r.partnerId, num(r.total)]));
    const byId = new Map(rows.map((r) => [r.id, r.name]));
    return c.json({
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        contact: r.contact,
        status: r.status,
        ratePercent: num(r.ratePercent),
        mentorName: r.parentId ? (byId.get(r.parentId) ?? null) : null,
        joinedAt: iso(r.joinedAt),
        accruedRub: accruedBy.get(r.id) ?? 0,
        paidRub: paidBy.get(r.id) ?? 0,
        dueRub: (accruedBy.get(r.id) ?? 0) - (paidBy.get(r.id) ?? 0),
      })),
    });
  })

  /**
   * GET /v1/admin/partners/:id
   * Карточка партнёра: сделки с оплаченным, начисления, выплаты.
   */
  .get("/partners/:id", zValidator("param", idParam), async (c) => {
    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    await requirePermission(c, db, "partners.manage");
    const { id } = c.req.valid("param");

    const [partner] = await db
      .select({
        id: partners.id,
        name: partners.name,
        slug: partners.slug,
        contact: partners.contact,
        status: partners.status,
        ratePercent: partners.ratePercent,
        parentId: partners.parentId,
        joinedAt: partners.joinedAt,
        taxStatus: partners.taxStatus,
        inn: partners.inn,
      })
      .from(partners)
      .where(eq(partners.id, id))
      .limit(1);
    if (!partner) return c.json({ error: "not_found", id }, 404);

    const [deals, accruals, payouts, everyone, paidRows] = await Promise.all([
      db
        .select({
          id: partnerDeals.id,
          clientName: partnerDeals.clientName,
          clientContact: partnerDeals.clientContact,
          package: partnerDeals.package,
          amountRub: partnerDeals.amountRub,
          ratePercent: partnerDeals.ratePercent,
          status: partnerDeals.status,
          installments: partnerDeals.installments,
          payToken: partnerDeals.payToken,
          nextDueAt: partnerDeals.nextDueAt,
          createdAt: partnerDeals.createdAt,
        })
        .from(partnerDeals)
        .where(eq(partnerDeals.partnerId, id))
        .orderBy(desc(partnerDeals.createdAt))
        .limit(100),
      db
        .select({
          id: partnerAccruals.id,
          amountRub: partnerAccruals.amountRub,
          level: partnerAccruals.level,
          reason: partnerAccruals.reason,
          createdAt: partnerAccruals.createdAt,
        })
        .from(partnerAccruals)
        .where(eq(partnerAccruals.partnerId, id))
        .orderBy(desc(partnerAccruals.createdAt))
        .limit(100),
      db
        .select({
          id: partnerPayouts.id,
          amountRub: partnerPayouts.amountRub,
          paidAt: partnerPayouts.paidAt,
          method: partnerPayouts.method,
          note: partnerPayouts.note,
        })
        .from(partnerPayouts)
        .where(eq(partnerPayouts.partnerId, id))
        .orderBy(desc(partnerPayouts.paidAt))
        .limit(100),
      // Для выбора наставника: список всех, кроме самого партнёра.
      db
        .select({ id: partners.id, name: partners.name })
        .from(partners)
        .limit(200),
      // Оплаченное по сделкам — отдельной группировкой, по той же причине.
      db
        .select({
          dealId: dealPayments.dealId,
          total: sql<string>`sum(${dealPayments.amountRub})`,
        })
        .from(dealPayments)
        .innerJoin(partnerDeals, eq(partnerDeals.id, dealPayments.dealId))
        .where(eq(partnerDeals.partnerId, id))
        .groupBy(dealPayments.dealId),
    ]);

    const paidByDeal = new Map(paidRows.map((r) => [r.dealId, num(r.total)]));

    const accrued = accruals.reduce((s, a) => s + num(a.amountRub), 0);
    const paid = payouts.reduce((s, p) => s + num(p.amountRub), 0);

    return c.json({
      partner: {
        id: partner.id,
        name: partner.name,
        slug: partner.slug,
        contact: partner.contact,
        status: partner.status,
        ratePercent: num(partner.ratePercent),
        parentId: partner.parentId,
        mentorName: partner.parentId
          ? (everyone.find((p) => p.id === partner.parentId)?.name ?? null)
          : null,
        joinedAt: iso(partner.joinedAt),
        taxStatus: partner.taxStatus,
        inn: partner.inn,
      },
      balance: { accruedRub: accrued, paidRub: paid, dueRub: accrued - paid },
      /**
       * Сколько переводить и что удержать (спека 7 §10).
       *
       * 🔴 Считается здесь, а не в админке: та же функция, что показывает
       * цифру партнёру. Два независимых расчёта одной выплаты — это спор,
       * в котором мы неправы по определению.
       */
      payout: payoutBreakdown(accrued - paid, partner.taxStatus as PartnerTaxStatus | null),
      deals: deals.map((d) => ({
        id: d.id,
        clientName: d.clientName,
        clientContact: d.clientContact,
        package: d.package,
        amountRub: num(d.amountRub),
        paidRub: paidByDeal.get(d.id) ?? 0,
        ratePercent: num(d.ratePercent),
        status: d.status,
        installments: d.installments,
        // Ссылка живёт в карточке заказа: владелец отдаёт её так же, как партнёр.
        payUrl: d.payToken ? payUrlFor(env, d.payToken) : null,
        nextDueAt: iso(d.nextDueAt),
        createdAt: iso(d.createdAt),
      })),
      accruals: accruals.map((a) => ({
        id: a.id,
        amountRub: num(a.amountRub),
        level: a.level,
        reason: a.reason,
        createdAt: iso(a.createdAt),
      })),
      payouts: payouts.map((p) => ({
        id: p.id,
        amountRub: num(p.amountRub),
        paidAt: iso(p.paidAt),
        method: p.method,
        note: p.note,
      })),
      candidates: everyone.filter((p) => p.id !== id),
      maxInstallmentMonths: MAX_INSTALLMENT_MONTHS,
    });
  })

  /**
   * POST /v1/admin/partners/:id/deals
   * Заводит сделку. 🔴 Ставка КОПИРУЕТСЯ в сделку — правка настроек партнёра
   * не должна переписывать уже случившиеся договорённости.
   */
  .post(
    "/partners/:id/deals",
    zValidator("param", idParam),
    zValidator("json", dealSchema),
    async (c) => {
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);
      await requirePermission(c, db, "partners.manage");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const [partner] = await db
        .select({ id: partners.id, ratePercent: partners.ratePercent, status: partners.status })
        .from(partners)
        .where(eq(partners.id, id))
        .limit(1);
      if (!partner) return c.json({ error: "not_found", id }, 404);

      const rate = body.ratePercent ?? num(partner.ratePercent);
      const payToken = generatePayToken();
      const [created] = await db
        .insert(partnerDeals)
        .values({
          partnerId: partner.id,
          clientName: body.clientName,
          clientContact: body.clientContact ?? null,
          package: body.package,
          amountRub: String(body.amountRub),
          ratePercent: String(rate),
          status: "negotiating",
          // Части рассрочки принимались и раньше, но до магазина их некуда было
          // сохранять: ответ повторял их обратно, и на этом всё кончалось.
          installments: body.installmentMonths,
          payToken,
          note: body.note ?? null,
        })
        .returning({ id: partnerDeals.id, dealNo: partnerDeals.dealNo });

      return c.json(
        {
          id: created?.id,
          dealNo: created?.dealNo,
          ratePercent: rate,
          installmentMonths: body.installmentMonths,
          maxInstallmentMonths: MAX_INSTALLMENT_MONTHS,
          // Ссылка на оплату — то же, что получает партнёр. Владелец продаёт
          // тем же механизмом, включая произвольную сумму по согласованию.
          payUrl: payUrlFor(env, payToken),
        },
        201,
      );
    },
  )

  /**
   * POST /v1/admin/deals/:id/payments
   * Отмечает поступивший платёж по сделке — безнал со счёта или наличные.
   *
   * 🔴 Считает ту же `settleDealPayment`, что и вебхук ЮKassa (спека 7): счёт
   * юрлицу через шлюз не проходит вообще, но комиссия партнёру с него
   * начисляться обязана. Была бы логика только в вебхуке — безналичная продажа
   * считалась бы руками, то есть через раз.
   */
  .post(
    "/deals/:id/payments",
    zValidator("param", idParam),
    zValidator("json", paymentSchema),
    async (c) => {
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);
      await requirePermission(c, db, "partners.manage");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const result = await db.transaction((tx) =>
        settleDealPayment(tx, {
          dealId: id,
          amountRub: body.amountRub,
          paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
          note: body.note ?? null,
        }),
      );

      if (!result.ok) {
        if (result.reason === "deal_not_found") return c.json({ error: "not_found", id }, 404);
        if (result.reason === "deal_cancelled") {
          return c.json(
            { error: "deal_cancelled", message: "Сделка отменена — начислять нечего." },
            409,
          );
        }
        return c.json({ error: result.reason }, 409);
      }

      // Уведомления — после коммита: партнёр узнаёт об оплате сам, без нас.
      await notifyPaymentSettled(db, env, { dealId: id, result });

      return c.json(
        {
          paymentId: result.paymentId,
          fullyPaid: result.fullyPaid,
          nextDueAt: result.nextDueAt ? result.nextDueAt.toISOString() : null,
          accruals: result.accruals.map((r) => ({
            partnerId: r.partnerId,
            level: r.level,
            ratePercent: r.ratePercent,
            amountRub: r.amountRub,
            reason: r.reason,
          })),
        },
        201,
      );
    },
  )

  /**
   * POST /v1/admin/deals/:id/refunds
   * Возврат денег клиенту: отрицательный платёж и сторно комиссии (спека 7 §11).
   *
   * 🔴 Возврат в самой ЮKassa делает человек — здесь фиксируется следствие. Без
   * этой отметки баланс партнёра врёт в его пользу, и мы платим комиссию за
   * отменённую продажу.
   */
  .post(
    "/deals/:id/refunds",
    zValidator("param", idParam),
    zValidator("json", refundSchema),
    async (c) => {
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);
      await requirePermission(c, db, "partners.manage");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const result = await refundDealPayment(db, {
        dealId: id,
        amountRub: body.amountRub,
        refundedAt: body.refundedAt ? new Date(body.refundedAt) : new Date(),
        note: body.note ?? null,
      });

      if (!result.ok) {
        if (result.reason === "deal_not_found") return c.json({ error: "not_found", id }, 404);
        if (result.reason === "nothing_paid") {
          return c.json(
            { error: "nothing_paid", message: "По этой сделке денег не приходило." },
            409,
          );
        }
        return c.json({ error: "over_refund", message: "Вернуть больше полученного нельзя." }, 409);
      }

      return c.json(
        {
          paymentId: result.paymentId,
          refundRub: result.refundRub,
          reversed: result.reversed.map((r) => ({
            partnerId: r.partnerId,
            level: r.level,
            ratePercent: r.ratePercent,
            amountRub: r.amountRub,
          })),
        },
        201,
      );
    },
  )

  /**
   * POST /v1/admin/partners/:id/payouts
   * Отмечает выплату партнёру. Перевод делает человек — здесь только след.
   */
  .post(
    "/partners/:id/payouts",
    zValidator("param", idParam),
    zValidator("json", payoutSchema),
    async (c) => {
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);
      await requirePermission(c, db, "partners.manage");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const [partner] = await db
        .select({ id: partners.id })
        .from(partners)
        .where(eq(partners.id, id))
        .limit(1);
      if (!partner) return c.json({ error: "not_found", id }, 404);

      const [created] = await db
        .insert(partnerPayouts)
        .values({
          partnerId: partner.id,
          amountRub: String(body.amountRub),
          paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
          method: body.method ?? null,
          note: body.note ?? null,
        })
        .returning({ id: partnerPayouts.id });

      return c.json({ id: created?.id }, 201);
    },
  )

  /**
   * PATCH /v1/admin/partners/:id
   * Правка карточки: страница КП, имя, контакт, ставка, участие.
   */
  .patch(
    "/partners/:id",
    zValidator("param", idParam),
    zValidator("json", profileSchema),
    async (c) => {
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);
      await requirePermission(c, db, "partners.manage");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const patch: Record<string, unknown> = {};
      if (body.name !== undefined) patch.name = body.name;
      if (body.contact !== undefined) patch.contact = body.contact || null;
      if (body.status !== undefined) patch.status = body.status;
      // 🔴 Ставка правится только для БУДУЩИХ сделок: в уже заведённых лежит
      // своя копия, и прошлое от этой правки не меняется.
      if (body.ratePercent !== undefined) patch.ratePercent = String(body.ratePercent);
      // Налоговый статус и ИНН: без них выплату физлицу не посчитать, а
      // самозанятому — не попросить чек НПД.
      if (body.taxStatus !== undefined) patch.taxStatus = body.taxStatus;
      if (body.inn !== undefined) patch.inn = body.inn || null;

      if (body.slug !== undefined) {
        const slug = normalizeSlug(body.slug);
        if (slug) {
          // Один и тот же адрес у двоих — это чужая страница с чужими
          // контактами в руках партнёра. Отбиваем до записи.
          const [taken] = await db
            .select({ id: partners.id })
            .from(partners)
            .where(eq(partners.slug, slug))
            .limit(1);
          if (taken && taken.id !== id) {
            return c.json(
              {
                error: "slug_taken",
                message: `Страница /kp/${slug}/ уже привязана к другому партнёру.`,
              },
              409,
            );
          }
        }
        patch.slug = slug;
      }

      if (Object.keys(patch).length === 0) return c.json({ error: "empty_patch" }, 400);

      const [updated] = await db
        .update(partners)
        .set(patch)
        .where(eq(partners.id, id))
        .returning({ id: partners.id, slug: partners.slug, name: partners.name });

      if (!updated) return c.json({ error: "not_found", id }, 404);
      return c.json(updated);
    },
  )

  /**
   * PATCH /v1/admin/partners/:id/mentor
   * Меняет наставника. 🔴 С проверкой цикла: A привёл B, B «переподписывает» A
   * на себя — и начисление ходит по кругу.
   */
  .patch(
    "/partners/:id/mentor",
    zValidator("param", idParam),
    zValidator("json", mentorSchema),
    async (c) => {
      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);
      await requirePermission(c, db, "partners.manage");
      const { id } = c.req.valid("param");
      const { parentId } = c.req.valid("json");

      if (parentId) {
        const tree = await db
          .select({ id: partners.id, parentId: partners.parentId })
          .from(partners);
        if (wouldMakeCycle(tree, id, parentId)) {
          return c.json(
            {
              error: "cycle",
              message: "Так наставничество замкнётся в круг — начисления пошли бы по кольцу.",
            },
            409,
          );
        }
      }

      const [updated] = await db
        .update(partners)
        .set({ parentId })
        .where(eq(partners.id, id))
        .returning({ id: partners.id, parentId: partners.parentId });

      if (!updated) return c.json({ error: "not_found", id }, 404);
      return c.json(updated);
    },
  );
