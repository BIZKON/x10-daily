import { type AdminPartnerCard, type AdminPartnerDeal, fetchPartnerCard } from "@/lib/api";
import { ArrowLeft, HandCoins, Link as LinkIcon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DealForm, MentorForm, PaymentForm, PayoutForm, ProfileForm } from "./forms";

export const metadata = { title: "Партнёр — ProAgent AI Admin" };

/**
 * Карточка партнёра: сделки, платежи, выплаты (спека 14.08).
 *
 * Здесь ведут чужие деньги, поэтому экран устроен так, чтобы порядок действий
 * был очевиден: завёл сделку → отметил поступивший платёж (в этот момент
 * начисляется доля) → отметил выплату. Пропустить средний шаг нельзя: без него
 * партнёру ничего не начислится, а он уже ждёт.
 */
export default function PartnerCardPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-card" />}>
      <Content params={params} />
    </Suspense>
  );
}

/** Домен витрины: отсюда собирается ссылка на версию КП партнёра. */
const KP_BASE = process.env.X10_APP_PUBLIC_URL ?? "https://app.pro-agent-ai.ru";

const rub = (v: number) =>
  `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(v)} ₽`;

const PACKAGE_LABEL: Record<string, string> = { manual: "Ручной", line: "Линия" };
const DEAL_STATUS: Record<string, string> = {
  negotiating: "В работе",
  awaiting_payment: "Ждёт оплаты",
  signed: "Оплачивается",
  cancelled: "Отменена",
};
const ACCRUAL_REASON: Record<string, string> = {
  sale: "с продажи",
  mentor: "наставнику",
  refund: "возврат",
  manual: "вручную",
};

async function Content({ params }: { params: Promise<{ id: string }> }) {
  // 🔴 PPR-грабля (CLAUDE.md §8): connection() внутри Suspense-компонента, иначе
  // билд запечёт «недоступно» в статичную оболочку.
  await connection();
  const { id } = await params;
  const data = await fetchPartnerCard(id);

  if (!data) {
    return (
      <div className="rounded-2xl border border-red/40 bg-red/5 p-6">
        <h2 className="m-0 font-display text-lg font-extrabold text-red">Партнёр не найден</h2>
        <p className="mt-2 text-[14px] text-mist">
          Либо запись удалена, либо у вашей роли нет права вести партнёров.
        </p>
        <Link href="/partners" className="mt-3 inline-block text-[13px] text-gold">
          ← ко всем партнёрам
        </Link>
      </div>
    );
  }

  const { partner, balance, deals, accruals, payouts, candidates, maxInstallmentMonths } = data;
  const openDeals = deals.filter((d) => d.status !== "cancelled");

  return (
    <>
      <Link
        href="/partners"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-mist transition hover:text-gold"
      >
        <ArrowLeft size={14} /> Все партнёры
      </Link>

      <header className="mb-5 border-b border-fence pb-5">
        <h1 className="m-0 flex items-center gap-2 font-display text-2xl font-extrabold">
          <HandCoins size={21} strokeWidth={1.75} /> {partner.name}
        </h1>
        <p className="mt-1.5 text-[13px] text-mist">
          {partner.contact ?? "контакт не указан"} · ставка {partner.ratePercent}%
          {partner.mentorName ? ` · привёл ${partner.mentorName}` : " · пришёл сам"}
          {partner.status === "paused" ? " · участие приостановлено" : ""}
        </p>
        {partner.slug ? (
          <a
            href={`${KP_BASE}/kp/${partner.slug}/`}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-gold transition hover:underline"
          >
            <LinkIcon size={13} strokeWidth={1.75} /> {KP_BASE}/kp/{partner.slug}/
          </a>
        ) : (
          <p className="mt-2 text-[12.5px] text-haze">
            Страница КП не привязана — партнёру нечего отправить клиенту. Проставьте адрес в
            карточке справа.
          </p>
        )}
      </header>

      <section className="mb-5 flex flex-wrap gap-6 rounded-2xl border border-fence bg-card p-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-haze">
            К выплате
          </div>
          <div className="font-mono text-[28px] font-extrabold text-gold">
            {rub(balance.dueRub)}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-haze">
            Начислено
          </div>
          <div className="font-mono text-[28px] font-bold text-paper">
            {rub(balance.accruedRub)}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-haze">
            Выплачено
          </div>
          <div className="font-mono text-[28px] font-bold text-mist">{rub(balance.paidRub)}</div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <section>
            <h2 className="mb-2.5 font-display text-[16px] font-extrabold">Сделки</h2>
            {deals.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-fence bg-card p-5 text-[13.5px] text-mist">
                Сделок нет. Заведите первую — форма справа.
              </p>
            ) : (
              <div className="space-y-2">
                {deals.map((d) => (
                  <DealRow key={d.id} deal={d} partnerId={partner.id} />
                ))}
              </div>
            )}
          </section>

          {accruals.length > 0 && (
            <section>
              <h2 className="mb-2.5 font-display text-[16px] font-extrabold">Начисления</h2>
              <div className="space-y-1.5">
                {accruals.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-xl border border-fence bg-card px-4 py-2.5"
                  >
                    <span className="text-[13px] text-mist">
                      {a.createdAt
                        ? new Date(a.createdAt).toLocaleDateString("ru-RU", {
                            day: "2-digit",
                            month: "short",
                          })
                        : "—"}{" "}
                      · {ACCRUAL_REASON[a.reason] ?? a.reason}
                    </span>
                    <span
                      className={`font-mono text-[14px] font-bold ${a.amountRub < 0 ? "text-red" : "text-success"}`}
                    >
                      {a.amountRub < 0 ? "" : "+"}
                      {rub(a.amountRub)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {payouts.length > 0 && (
            <section>
              <h2 className="mb-2.5 font-display text-[16px] font-extrabold">Выплаты</h2>
              <div className="space-y-1.5">
                {payouts.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-xl border border-fence bg-card px-4 py-2.5"
                  >
                    <span className="text-[13px] text-mist">
                      {p.paidAt
                        ? new Date(p.paidAt).toLocaleDateString("ru-RU", {
                            day: "2-digit",
                            month: "short",
                          })
                        : "—"}
                      {p.method ? ` · ${p.method}` : ""}
                    </span>
                    <span className="font-mono text-[14px] font-bold text-mist">
                      −{rub(p.amountRub)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-4">
          <DealForm partnerId={partner.id} maxInstallmentMonths={maxInstallmentMonths} />
          {openDeals.length > 0 && <PaymentForm partnerId={partner.id} deals={openDeals} />}
          <PayoutForm partnerId={partner.id} dueRub={balance.dueRub} />
          <MentorForm partnerId={partner.id} parentId={partner.parentId} candidates={candidates} />
        </div>
      </div>
    </>
  );
}

function DealRow({ deal, partnerId }: { deal: AdminPartnerDeal; partnerId: string }) {
  // Доля показывается от ОПЛАЧЕННОГО: процент от суммы договора обещал бы
  // деньги, которых ещё нет.
  const earned = Math.round((deal.paidRub * deal.ratePercent) / 100);
  const rest = deal.amountRub - deal.paidRub;

  return (
    <article className="rounded-2xl border border-fence bg-card p-4" data-partner={partnerId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-[15px] font-bold text-paper">{deal.clientName}</div>
          <div className="mt-0.5 text-[12.5px] text-haze">
            {PACKAGE_LABEL[deal.package] ?? deal.package} · {rub(deal.amountRub)} · доля{" "}
            {deal.ratePercent}%{deal.clientContact ? ` · ${deal.clientContact}` : ""}
          </div>
        </div>
        <span className="text-[12px] font-semibold text-mist">
          {DEAL_STATUS[deal.status] ?? deal.status}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-fence pt-2.5 text-[13px]">
        <span className="text-mist">
          Оплачено {rub(deal.paidRub)}
          {rest > 0 ? ` · осталось ${rub(rest)}` : " · полностью"}
        </span>
        <span className="font-mono font-bold text-success">
          {earned > 0 ? `начислено ${rub(earned)}` : "начислений нет"}
        </span>
      </div>
    </article>
  );
}
