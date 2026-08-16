import { type Database, eq, partnerDeals, partners, sql, users } from "@x10/db";
import { dealPayments } from "@x10/db";
import {
  type PaidNotice,
  mentorPaidMessage,
  ownerPaidMessage,
  sellerPaidMessage,
} from "./payment-messages";
import type { SettleDealResult } from "./payment-settle";
import { sendMessage } from "./telegram-call";

/**
 * Кому и что сказать после поступившей оплаты (спека 7).
 *
 * 🔴 Вызывается ПОСЛЕ коммита транзакции, а не внутри неё. Telegram отвечает
 * сотни миллисекунд, а иногда не отвечает вовсе; держать на этом блокировки
 * денежных таблиц нельзя.
 *
 * ⚠️ Все ошибки глотаются. Деньги уже зачтены и начисления записаны — падать
 * из-за неотправленного сообщения значит ломать факт оплаты ради оповещения
 * о нём. Сбой виден в логах.
 */

type NotifyEnv = {
  TELEGRAM_BOT_TOKEN?: string;
  TG_OPS_CHAT_ID?: string;
};

async function send(env: NotifyEnv, chatId: number | null, text: string): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;
  try {
    await sendMessage({ token }, chatId, text);
  } catch (err) {
    console.error("[pay] уведомление не ушло:", err);
  }
}

/** Telegram-id человека или null: у веб-пользователя чата нет. */
function chatIdOf(platform: string | null, platformUserId: string | null): number | null {
  if (platform !== "telegram" || !platformUserId) return null;
  const n = Number(platformUserId);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

export async function notifyPaymentSettled(
  db: Database,
  env: NotifyEnv,
  args: { dealId: string; result: Extract<SettleDealResult, { ok: true }> },
): Promise<void> {
  try {
    const [deal] = await db
      .select({
        dealNo: partnerDeals.dealNo,
        clientName: partnerDeals.clientName,
        amountRub: partnerDeals.amountRub,
        partnerId: partnerDeals.partnerId,
      })
      .from(partnerDeals)
      .where(eq(partnerDeals.id, args.dealId))
      .limit(1);
    if (!deal) return;

    const [paid] = await db
      .select({ sum: sql<string>`coalesce(sum(${dealPayments.amountRub}), 0)` })
      .from(dealPayments)
      .where(eq(dealPayments.dealId, args.dealId));

    const notice: PaidNotice = {
      dealNo: deal.dealNo,
      clientName: deal.clientName,
      paymentRub: args.result.paymentRub,
      paidTotalRub: Number(paid?.sum ?? 0),
      amountRub: Number(deal.amountRub),
      fullyPaid: args.result.fullyPaid,
    };

    const sellerAccrual = args.result.accruals.find((a) => a.level === 0);
    const mentorAccrual = args.result.accruals.find((a) => a.level === 1);

    // Владельцу — всегда: это его деньги, даже если продажа без партнёра.
    let sellerName: string | null = null;

    if (deal.partnerId) {
      const [seller] = await db
        .select({
          name: partners.name,
          parentId: partners.parentId,
          platform: users.platform,
          platformUserId: users.platformUserId,
        })
        .from(partners)
        .innerJoin(users, eq(users.id, partners.userId))
        .where(eq(partners.id, deal.partnerId))
        .limit(1);

      if (seller) {
        sellerName = seller.name;
        await send(
          env,
          chatIdOf(seller.platform, seller.platformUserId),
          sellerPaidMessage(notice, sellerAccrual?.amountRub ?? 0),
        );

        if (mentorAccrual && seller.parentId) {
          const [mentor] = await db
            .select({ platform: users.platform, platformUserId: users.platformUserId })
            .from(partners)
            .innerJoin(users, eq(users.id, partners.userId))
            .where(eq(partners.id, seller.parentId))
            .limit(1);

          if (mentor) {
            await send(
              env,
              chatIdOf(mentor.platform, mentor.platformUserId),
              mentorPaidMessage(seller.name, mentorAccrual.amountRub),
            );
          }
        }
      }
    }

    const opsChat = Number(env.TG_OPS_CHAT_ID ?? "");
    await send(
      env,
      Number.isFinite(opsChat) && opsChat !== 0 ? opsChat : null,
      ownerPaidMessage(notice, {
        sellerName,
        sellerRub: sellerAccrual?.amountRub ?? 0,
        mentorRub: mentorAccrual?.amountRub ?? 0,
      }),
    );
  } catch (err) {
    console.error("[pay] не удалось разослать уведомления об оплате:", err);
  }
}
