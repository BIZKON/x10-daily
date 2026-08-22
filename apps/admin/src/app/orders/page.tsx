import { type AdminOrder, type AdminOrders, fetchOrders } from "@/lib/api";
import { Receipt, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CopyLink, NewOrderForm, PaymentForm, RefundForm } from "./forms";

export const metadata = { title: "Заказы — ProAgent AI Admin" };

/**
 * Заказы — воронка продаж целиком (спека 7).
 *
 * 🔴 Появился, потому что заказ было видно только внутри карточки своего
 * партнёра, а прямая продажа не заводилась вовсе: единственный маршрут
 * создания требовал партнёра. База к прямым продажам готова с самого начала —
 * `partner_deals.partner_id` NULL-able именно ради этого.
 *
 * Порядок на экране повторяет порядок в жизни: завёл заказ → отдал ссылку →
 * пришли деньги. Возврат рядом с оплатой, а не в отдельном углу: это то же
 * событие с обратным знаком.
 */
export default function OrdersPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <Content />
    </Suspense>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      <div className="h-10 w-64 animate-pulse rounded-xl bg-card" />
      <div className="h-64 animate-pulse rounded-2xl bg-card" />
    </div>
  );
}

const rub = (v: number) =>
  `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(v)} ₽`;

const no = (v: number) => String(v).padStart(4, "0");

const PACKAGE_TITLE: Record<string, string> = { line: "Линия", manual: "Ручной режим" };

async function Content() {
  // 🔴 PPR-грабля (CLAUDE.md §8): без connection() внутри Suspense-компонента
  // билд запёк бы «данные недоступны» в статичную оболочку навсегда.
  await connection();
  const data = await fetchOrders();

  return (
    <>
      <header className="mb-6 border-b border-fence pb-5">
        <h1 className="m-0 flex items-center gap-2 font-display text-2xl font-extrabold">
          <ShoppingBag size={22} strokeWidth={1.75} /> Заказы
        </h1>
        <p className="mt-1.5 max-w-[76ch] text-[13px] leading-relaxed text-mist">
          Все продажи одним списком: и те, что привёл партнёр, и те, что продали сами. У каждого
          заказа своя ссылка на оплату — по ней клиент платит картой или скачивает счёт.
        </p>
      </header>

      {!data ? <Unavailable /> : <Board data={data} />}
    </>
  );
}

function Board({ data }: { data: AdminOrders }) {
  const { orders, totals, partners, maxInstallmentMonths } = data;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div>
        <section className="mb-5 flex flex-wrap gap-6 rounded-2xl border border-fence bg-card p-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-haze">
              Получено
            </div>
            <div className="font-mono text-[26px] font-extrabold text-success">
              {rub(totals.paidRub)}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-haze">
              Ждём от клиентов
            </div>
            <div className="font-mono text-[26px] font-bold text-gold">
              {rub(totals.awaitingRub)}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-haze">
              Заказов
            </div>
            <div className="font-mono text-[26px] font-bold text-mist">{totals.count}</div>
          </div>
        </section>

        {orders.length === 0 ? (
          <Empty />
        ) : (
          <div className="space-y-2">
            {orders.map((o) => (
              <Row key={o.id} o={o} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <NewOrderForm partners={partners} maxInstallmentMonths={maxInstallmentMonths} />
      </div>
    </div>
  );
}

/** Состояние заказа словами, а не полем базы: «negotiating» клиенту ни о чём. */
function stateOf(o: AdminOrder): { label: string; tone: string } {
  if (o.status === "cancelled") return { label: "отменён", tone: "text-haze" };
  if (o.paidRub <= 0) return { label: "ждёт оплаты", tone: "text-gold" };
  if (o.paidRub < o.amountRub) return { label: "оплачен частично", tone: "text-gold" };
  return { label: "оплачен", tone: "text-success" };
}

function Row({ o }: { o: AdminOrder }) {
  const state = stateOf(o);
  const rest = Math.max(0, o.amountRub - o.paidRub);

  return (
    <details className="group rounded-2xl border border-fence bg-card transition open:border-gold/40">
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3.5 marker:content-['']">
        <span className="font-mono text-[13px] text-haze">№ {no(o.dealNo)}</span>
        <span className="min-w-[10rem] flex-1">
          <span className="block font-display text-[15px] font-bold text-paper">
            {o.clientName}
          </span>
          <span className="mt-0.5 block text-[12.5px] text-haze">
            {PACKAGE_TITLE[o.package] ?? o.package}
            {o.installments > 1 ? " · рассрочка 50/50" : ""}
            {o.partner ? ` · ${o.partner.name}` : " · продали сами"}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-[11px] uppercase tracking-wider text-haze">оплачено</span>
          <span className="font-mono text-[14px] text-mist">
            {rub(o.paidRub)} из {rub(o.amountRub)}
          </span>
        </span>
        <span className={`w-[9rem] text-right font-bold text-[13px] ${state.tone}`}>
          {state.label}
        </span>
      </summary>

      <div className="grid gap-5 border-fence border-t px-4 py-4 md:grid-cols-2">
        <div className="space-y-3">
          {o.payUrl ? (
            <div>
              <div className="mb-1.5 text-[12.5px] font-bold text-paper">Ссылка для клиента</div>
              <CopyLink url={o.payUrl} />
              <Link
                href={`${o.payUrl}/invoice`}
                target="_blank"
                className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-mist transition hover:text-gold"
              >
                <Receipt size={13} strokeWidth={1.75} /> Счёт для юрлица
              </Link>
            </div>
          ) : (
            <p className="m-0 text-[12.5px] text-haze">
              Ссылки нет: заказ заведён до появления магазина.
            </p>
          )}

          <dl className="m-0 grid grid-cols-2 gap-y-1 text-[12.5px]">
            <dt className="m-0 text-haze">Осталось</dt>
            <dd className="m-0 text-right font-mono text-paper">{rub(rest)}</dd>
            {o.partner && (
              <>
                <dt className="m-0 text-haze">Доля партнёра</dt>
                <dd className="m-0 text-right font-mono text-paper">{o.ratePercent}%</dd>
              </>
            )}
            {o.nextDueAt && rest > 0 && (
              <>
                <dt className="m-0 text-haze">Вторая часть до</dt>
                <dd className="m-0 text-right font-mono text-paper">
                  {new Date(o.nextDueAt).toLocaleDateString("ru-RU", {
                    day: "2-digit",
                    month: "long",
                  })}
                </dd>
              </>
            )}
            {o.clientContact && (
              <>
                <dt className="m-0 text-haze">Контакт</dt>
                <dd className="m-0 text-right text-paper">{o.clientContact}</dd>
              </>
            )}
          </dl>

          {o.partner && (
            <Link
              href={`/partners/${o.partner.id}`}
              className="inline-block text-[12.5px] text-mist transition hover:text-gold"
            >
              Карточка партнёра →
            </Link>
          )}
        </div>

        <div className="space-y-4">
          {rest > 0 && o.status !== "cancelled" && (
            <PaymentForm dealId={o.id} dueRub={o.installments > 1 ? rest / 2 : rest} />
          )}
          {o.paidRub > 0 && <RefundForm dealId={o.id} />}
        </div>
      </div>
    </details>
  );
}

function Empty() {
  return (
    <div className="rounded-2xl border border-dashed border-fence bg-card p-8 text-center">
      <ShoppingBag size={26} strokeWidth={1.5} className="mx-auto mb-3 text-haze" />
      <h2 className="m-0 mb-2 font-display text-lg font-extrabold">Заказов пока нет</h2>
      <p className="m-0 mx-auto max-w-[62ch] text-[14px] leading-relaxed text-mist">
        Заведите первый справа — получите ссылку, по которой клиент платит сам. Заказы партнёров
        появляются здесь тоже: они заводят их из своего кабинета.
      </p>
    </div>
  );
}

function Unavailable() {
  return (
    <div className="rounded-2xl border border-red/40 bg-red/5 p-6">
      <h2 className="m-0 font-display text-lg font-extrabold text-red">Данные недоступны</h2>
      <p className="mt-2 text-[14px] text-mist">
        Api не ответил, сессия не установлена или у вашей роли нет права вести продажи — это может
        только владелец.
      </p>
    </div>
  );
}
