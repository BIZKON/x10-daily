import { zValidator } from "@hono/zod-validator";
import { MERCHANT, PACKAGE_INFO, VAT_NOTE } from "@x10/config";
import { type DealPackage, dealPayments, eq, partnerDeals, payments, sql } from "@x10/db";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { getDb } from "../db";
import { getEnv } from "../env";
import { amountInWords } from "../lib/amount-in-words";
import { dueNowRub } from "../lib/partner-money";
import { isPayToken } from "../lib/pay-token";
import { YooKassaError, createPayment } from "../lib/yookassa";
import { applyRateLimit } from "../rate-limit";
import { readCreds } from "./billing";

/**
 * Публичная страница оплаты (спека 7).
 *
 * 🔴 Здесь нет входа по Telegram и быть не может: платит КЛИЕНТ, а не читатель
 * канала. Он открывает ссылку в обычном браузере, часто с рабочего компьютера
 * бухгалтера. Защита заказа — сам токен: 96 бит, без смысла внутри.
 *
 * ⚠️ Что наружу НЕ уходит ни при каких условиях: партнёр, его ставка и суммы
 * начислений. Клиент, увидевший «продавцу 70 000», начинает торговаться не с
 * нами, а с человеком, который его привёл.
 */

const tokenParam = z.object({ token: z.string() });

const startSchema = z.object({
  payerEmail: z.string().email(),
  /** Отметка о принятии оферты. Без неё продажа на 350 000 ₽ недоказуема. */
  offerAccepted: z.literal(true),
});

const companySchema = z.object({
  payerName: z.string().trim().min(2).max(200),
  payerInn: z
    .string()
    .trim()
    .regex(/^\d{10}$|^\d{12}$/, "ИНН — 10 цифр у юрлица, 12 у ИП"),
  payerKpp: z
    .string()
    .trim()
    .regex(/^\d{9}$/)
    .optional(),
  payerAddress: z.string().trim().max(300).optional(),
});

const num = (v: unknown): number => Number(v ?? 0);

/**
 * Банковские реквизиты продавца или null, если не настроены.
 *
 * 🔴 Все четыре обязательны: счёт с тремя реквизитами из четырёх не пройдёт в
 * банке клиента, но выглядит заполненным — и ошибку заметят на второй день.
 */
function readBank(env: {
  X10_BANK_NAME?: string;
  X10_BANK_BIK?: string;
  X10_BANK_ACCOUNT?: string;
  X10_BANK_CORR_ACCOUNT?: string;
}): { name: string; bik: string; account: string; corrAccount: string } | null {
  const name = env.X10_BANK_NAME?.trim();
  const bik = env.X10_BANK_BIK?.trim();
  const account = env.X10_BANK_ACCOUNT?.trim();
  const corrAccount = env.X10_BANK_CORR_ACCOUNT?.trim();
  if (!name || !bik || !account || !corrAccount) return null;
  return { name, bik, account, corrAccount };
}

/** Реквизиты продавца — то же, что печатается в счёте и в чеке. */
function sellerView() {
  return {
    legalName: MERCHANT.legalName,
    shortName: MERCHANT.shortName,
    inn: MERCHANT.inn,
    ogrnip: MERCHANT.ogrnip,
    phone: MERCHANT.phone,
    email: MERCHANT.email,
    vatNote: VAT_NOTE,
  };
}

/** Заказ по токену вместе с уже оплаченным. `null` — токена нет. */
async function loadOrder(db: ReturnType<typeof getDb>, token: string) {
  const [deal] = await db
    .select({
      id: partnerDeals.id,
      dealNo: partnerDeals.dealNo,
      clientName: partnerDeals.clientName,
      package: partnerDeals.package,
      amountRub: partnerDeals.amountRub,
      status: partnerDeals.status,
      installments: partnerDeals.installments,
      payerKind: partnerDeals.payerKind,
      payerName: partnerDeals.payerName,
      payerInn: partnerDeals.payerInn,
      payerKpp: partnerDeals.payerKpp,
      payerAddress: partnerDeals.payerAddress,
      payerEmail: partnerDeals.payerEmail,
      nextDueAt: partnerDeals.nextDueAt,
    })
    .from(partnerDeals)
    .where(eq(partnerDeals.payToken, token))
    .limit(1);

  if (!deal) return null;

  // Суммы — отдельной группировкой: коррелированный подзапрос в drizzle уже
  // отдавал ноль при верных данных (живой прогон 14.08).
  const [paid] = await db
    .select({ sum: sql<string>`coalesce(sum(${dealPayments.amountRub}), 0)` })
    .from(dealPayments)
    .where(eq(dealPayments.dealId, deal.id));

  return { deal, paidRub: num(paid?.sum ?? 0) };
}

export const payRoute = new Hono<AppEnv>()
  /**
   * GET /v1/pay/:token
   * Что клиент видит на странице: заказ, состав пакета, сумма к оплате сейчас.
   */
  .get("/:token", zValidator("param", tokenParam), async (c) => {
    const { token } = c.req.valid("param");
    // Формат проверяем до базы: мусорный токен не должен стоить нам запроса.
    if (!isPayToken(token)) return c.json({ error: "not_found" }, 404);

    await applyRateLimit(c, c.env.ENGAGEMENT_LIMITER, "pay-view");

    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const order = await loadOrder(db, token);
    if (!order) return c.json({ error: "not_found" }, 404);

    const { deal, paidRub } = order;
    const amountRub = num(deal.amountRub);
    const info = PACKAGE_INFO[deal.package as DealPackage];
    const due = dueNowRub({ amountRub, paidRub, installments: deal.installments });

    const state =
      deal.status === "cancelled"
        ? ("cancelled" as const)
        : due <= 0
          ? ("paid" as const)
          : paidRub > 0
            ? ("partially_paid" as const)
            : ("awaiting" as const);

    return c.json({
      dealNo: deal.dealNo,
      clientName: deal.clientName,
      state,
      package: {
        key: deal.package,
        title: info.title,
        summary: info.summary,
        includes: info.includes,
      },
      amountRub,
      paidRub,
      dueNowRub: due,
      installments: deal.installments,
      nextDueAt: deal.nextDueAt ? deal.nextDueAt.toISOString() : null,
      payerKind: deal.payerKind,
      payerName: deal.payerName,
      payerEmail: deal.payerEmail,
      seller: sellerView(),
      /** Настроена ли оплата картой. Нет ключей — остаётся счёт. */
      cardAvailable: Boolean(readCreds(env)),
    });
  })

  /**
   * GET /v1/pay/:token/invoice
   * Данные счёта на оплату. Номер счёта — номер заказа: второго номера у одного
   * заказа не бывает, иначе бухгалтерия клиента спросит, какой из них верный.
   */
  .get("/:token/invoice", zValidator("param", tokenParam), async (c) => {
    const { token } = c.req.valid("param");
    if (!isPayToken(token)) return c.json({ error: "not_found" }, 404);

    await applyRateLimit(c, c.env.ENGAGEMENT_LIMITER, "pay-invoice");

    const env = getEnv(c.env);
    const db = getDb(env.DATABASE_URL);
    const order = await loadOrder(db, token);
    if (!order) return c.json({ error: "not_found" }, 404);

    const { deal, paidRub } = order;
    const amountRub = num(deal.amountRub);
    const info = PACKAGE_INFO[deal.package as DealPackage];
    const due = dueNowRub({ amountRub, paidRub, installments: deal.installments });

    const bank = readBank(env);

    return c.json({
      // Реквизиты банка могут быть не заданы: тогда счёт не выставляем, а
      // страница честно предлагает карту. Пустой счёт хуже отсутствующего —
      // по нему нельзя заплатить, но выглядит он как настоящий.
      bankConfigured: Boolean(bank),
      dealNo: deal.dealNo,
      issuedAt: new Date().toISOString(),
      seller: { ...sellerView(), address: MERCHANT.postalAddress, bank },
      buyer: {
        name: deal.payerName ?? deal.clientName,
        inn: deal.payerInn,
        kpp: deal.payerKpp,
        address: deal.payerAddress,
      },
      item: {
        description: `${info.title}: разработка и настройка системы автоматической подготовки контента`,
        amountRub,
      },
      amountRub,
      paidRub,
      dueNowRub: due,
      dueInWords: amountInWords(due),
      installments: deal.installments,
      nextDueAt: deal.nextDueAt ? deal.nextDueAt.toISOString() : null,
      vatNote: VAT_NOTE,
    });
  })

  /**
   * POST /v1/pay/:token/start
   * Создаёт платёж и возвращает ссылку на страницу ЮKassa.
   */
  .post(
    "/:token/start",
    zValidator("param", tokenParam),
    zValidator("json", startSchema),
    async (c) => {
      const { token } = c.req.valid("param");
      if (!isPayToken(token)) return c.json({ error: "not_found" }, 404);

      await applyRateLimit(c, c.env.ENGAGEMENT_LIMITER, "pay-start");

      const env = getEnv(c.env);
      const creds = readCreds(env);
      if (!creds) {
        return c.json(
          {
            error: "store_not_configured",
            message: "Оплата картой временно недоступна — запросите счёт.",
          },
          503,
        );
      }

      const db = getDb(env.DATABASE_URL);
      const order = await loadOrder(db, token);
      if (!order) return c.json({ error: "not_found" }, 404);

      const { deal, paidRub } = order;
      if (deal.status === "cancelled") return c.json({ error: "cancelled" }, 409);

      const amountRub = num(deal.amountRub);
      const due = dueNowRub({ amountRub, paidRub, installments: deal.installments });
      if (due <= 0) return c.json({ error: "already_paid" }, 409);

      const body = c.req.valid("json");
      const info = PACKAGE_INFO[deal.package as DealPackage];
      const part =
        deal.installments > 1 ? ` (платёж ${paidRub > 0 ? 2 : 1} из ${deal.installments})` : "";
      const description = `Заказ № ${deal.dealNo}. ${info.title}${part}`;

      // Почта и согласие с офертой — на заказе: их спрашивают один раз, а
      // платежей по заказу может быть два.
      await db
        .update(partnerDeals)
        .set({ payerEmail: body.payerEmail, offerAcceptedAt: new Date() })
        .where(eq(partnerDeals.id, deal.id));

      const [row] = await db
        .insert(payments)
        .values({
          purpose: "entry",
          dealId: deal.id,
          amountRub: String(due),
          status: "pending",
          payerEmail: body.payerEmail,
          description,
        })
        .returning({ id: payments.id });
      if (!row) return c.json({ error: "internal" }, 500);

      try {
        const created = await createPayment(creds, {
          paymentId: row.id,
          amountRub: due,
          description,
          returnUrl: `https://app.${env.X10_BASE_DOMAIN ?? "pro-agent-ai.ru"}/pay/${token}?paid=1`,
          payerEmail: body.payerEmail,
        });

        await db
          .update(payments)
          .set({ providerPaymentId: created.providerPaymentId })
          .where(eq(payments.id, row.id));

        return c.json({ confirmationUrl: created.confirmationUrl }, 201);
      } catch (err) {
        console.error("[pay] платёж не создан:", err);
        return c.json(
          {
            error: "provider_error",
            message:
              err instanceof YooKassaError && err.status === 401
                ? "Оплата картой временно недоступна — запросите счёт."
                : "Не удалось открыть оплату. Попробуйте ещё раз или запросите счёт.",
          },
          502,
        );
      }
    },
  )

  /**
   * POST /v1/pay/:token/company
   * Реквизиты юрлица для счёта. Безнал дешевле на ~3% эквайринга.
   */
  .post(
    "/:token/company",
    zValidator("param", tokenParam),
    zValidator("json", companySchema),
    async (c) => {
      const { token } = c.req.valid("param");
      if (!isPayToken(token)) return c.json({ error: "not_found" }, 404);

      await applyRateLimit(c, c.env.ENGAGEMENT_LIMITER, "pay-company");

      const env = getEnv(c.env);
      const db = getDb(env.DATABASE_URL);
      const order = await loadOrder(db, token);
      if (!order) return c.json({ error: "not_found" }, 404);
      if (order.deal.status === "cancelled") return c.json({ error: "cancelled" }, 409);

      const body = c.req.valid("json");
      await db
        .update(partnerDeals)
        .set({
          payerKind: "company",
          payerName: body.payerName,
          payerInn: body.payerInn,
          payerKpp: body.payerKpp ?? null,
          payerAddress: body.payerAddress ?? null,
        })
        .where(eq(partnerDeals.id, order.deal.id));

      return c.json({ ok: true, invoiceUrl: `/pay/${token}/invoice` }, 200);
    },
  );
