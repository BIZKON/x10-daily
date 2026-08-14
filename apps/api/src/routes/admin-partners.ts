import { zValidator } from "@hono/zod-validator";
import { MAX_INSTALLMENT_MONTHS } from "@x10/config";
import {
  DEAL_PACKAGES,
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
import { accrualsForPayment, wouldMakeCycle } from "../lib/partner-money";

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

const payoutSchema = z.object({
  amountRub: z.coerce.number().positive().max(100_000_000),
  paidAt: z.string().datetime().optional(),
  method: z.string().trim().max(64).optional(),
  note: z.string().trim().max(500).optional(),
});

const mentorSchema = z.object({ parentId: z.string().uuid().nullable() });

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

    const rows = await db
      .select({
        id: partners.id,
        name: partners.name,
        slug: partners.slug,
        contact: partners.contact,
        status: partners.status,
        ratePercent: partners.ratePercent,
        parentId: partners.parentId,
        joinedAt: partners.joinedAt,
        accruedRub: sql<string>`coalesce((
          select sum(${partnerAccruals.amountRub}) from ${partnerAccruals}
          where ${partnerAccruals.partnerId} = ${partners.id}
        ), 0)`,
        paidRub: sql<string>`coalesce((
          select sum(${partnerPayouts.amountRub}) from ${partnerPayouts}
          where ${partnerPayouts.partnerId} = ${partners.id}
        ), 0)`,
      })
      .from(partners)
      .orderBy(desc(partners.joinedAt))
      .limit(200);

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
        accruedRub: num(r.accruedRub),
        paidRub: num(r.paidRub),
        dueRub: num(r.accruedRub) - num(r.paidRub),
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
      })
      .from(partners)
      .where(eq(partners.id, id))
      .limit(1);
    if (!partner) return c.json({ error: "not_found", id }, 404);

    const [deals, accruals, payouts, everyone] = await Promise.all([
      db
        .select({
          id: partnerDeals.id,
          clientName: partnerDeals.clientName,
          clientContact: partnerDeals.clientContact,
          package: partnerDeals.package,
          amountRub: partnerDeals.amountRub,
          ratePercent: partnerDeals.ratePercent,
          status: partnerDeals.status,
          createdAt: partnerDeals.createdAt,
          paidRub: sql<string>`coalesce((
            select sum(${dealPayments.amountRub}) from ${dealPayments}
            where ${dealPayments.dealId} = ${partnerDeals.id}
          ), 0)`,
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
      db.select({ id: partners.id, name: partners.name }).from(partners).limit(200),
    ]);

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
      },
      balance: { accruedRub: accrued, paidRub: paid, dueRub: accrued - paid },
      deals: deals.map((d) => ({
        id: d.id,
        clientName: d.clientName,
        clientContact: d.clientContact,
        package: d.package,
        amountRub: num(d.amountRub),
        paidRub: num(d.paidRub),
        ratePercent: num(d.ratePercent),
        status: d.status,
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
          note: body.note ?? null,
        })
        .returning({ id: partnerDeals.id });

      return c.json(
        {
          id: created?.id,
          ratePercent: rate,
          installmentMonths: body.installmentMonths,
          maxInstallmentMonths: MAX_INSTALLMENT_MONTHS,
        },
        201,
      );
    },
  )

  /**
   * POST /v1/admin/deals/:id/payments
   * Записывает поступивший платёж и НАЧИСЛЯЕТ доли — продавцу и наставнику.
   *
   * 🔴 Платёж и начисления пишутся ОДНОЙ транзакцией. Иначе деньги клиента
   * записаны, а доля партнёра нет — расхождение всплывёт через месяц, когда
   * никто не вспомнит подробностей.
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

      const [deal] = await db
        .select({
          id: partnerDeals.id,
          partnerId: partnerDeals.partnerId,
          amountRub: partnerDeals.amountRub,
          ratePercent: partnerDeals.ratePercent,
          status: partnerDeals.status,
        })
        .from(partnerDeals)
        .where(eq(partnerDeals.id, id))
        .limit(1);
      if (!deal) return c.json({ error: "not_found", id }, 404);
      if (deal.status === "cancelled") {
        return c.json(
          { error: "deal_cancelled", message: "Сделка отменена — начислять нечего." },
          409,
        );
      }

      const [seller] = await db
        .select({ id: partners.id, parentId: partners.parentId, joinedAt: partners.joinedAt })
        .from(partners)
        .where(eq(partners.id, deal.partnerId))
        .limit(1);
      if (!seller) return c.json({ error: "partner_not_found" }, 404);

      const mentor = seller.parentId
        ? ((
            await db
              .select({ id: partners.id, parentId: partners.parentId, status: partners.status })
              .from(partners)
              .where(eq(partners.id, seller.parentId))
              .limit(1)
          )[0] ?? null)
        : null;

      const paidAt = body.paidAt ? new Date(body.paidAt) : new Date();

      const result = await db.transaction(async (tx) => {
        const [payment] = await tx
          .insert(dealPayments)
          .values({
            dealId: deal.id,
            amountRub: String(body.amountRub),
            paidAt,
            note: body.note ?? null,
          })
          .returning({ id: dealPayments.id });
        if (!payment) throw new Error("payment insert failed");

        const rows = accrualsForPayment({
          payment: { id: payment.id, dealId: deal.id, amountRub: body.amountRub, paidAt },
          deal: {
            id: deal.id,
            partnerId: deal.partnerId,
            amountRub: num(deal.amountRub),
            ratePercent: num(deal.ratePercent),
          },
          seller: {
            id: seller.id,
            parentId: seller.parentId,
            joinedAt: seller.joinedAt,
          },
          // Приостановленный наставник долю не получает: участие заморожено.
          mentor:
            mentor && mentor.status === "active"
              ? { id: mentor.id, parentId: mentor.parentId }
              : null,
        });

        await tx.insert(partnerAccruals).values(
          rows.map((r) => ({
            partnerId: r.partnerId,
            paymentId: r.paymentId,
            level: r.level,
            ratePercent: String(r.ratePercent),
            amountRub: String(r.amountRub),
            reason: r.reason,
          })),
        );

        // Первый платёж переводит сделку в «подписана»: деньги пришли — значит
        // договорились. Статус не понижаем, если он уже выставлен вручную.
        if (deal.status !== "signed") {
          await tx
            .update(partnerDeals)
            .set({ status: "signed", signedAt: sql`coalesce(${partnerDeals.signedAt}, now())` })
            .where(eq(partnerDeals.id, deal.id));
        }

        return { paymentId: payment.id, accruals: rows };
      });

      return c.json(
        {
          paymentId: result.paymentId,
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
