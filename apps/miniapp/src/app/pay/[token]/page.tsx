import { type ApiPayOrder, fetchPayOrder } from "@/lib/api";
import { formatDealNo } from "@x10/config";
import { Check, CircleCheck, Clock } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PayForm } from "./pay-form";

/**
 * Публичная страница оплаты (спека 7, вариант Б с реквизитами из А).
 *
 * 🔴 Живёт ВНЕ `(shell)`: нижнего меню здесь нет и быть не должно — это не
 * раздел приложения, а последний экран перед списанием сотен тысяч рублей.
 * Клиент открывает её в обычном браузере, часто с рабочего компьютера, и
 * входа по Telegram у него нет.
 *
 * Светлая тема выставляется прямо здесь, поверх тёмного корневого шелла:
 * платёжных страниц в тёмной гамме не делают, а клиент приходит сюда с
 * коммерческого предложения, которое светлое.
 */

export const metadata: Metadata = {
  title: "Оплата заказа",
  // Ссылка уходит в переписку: превью с суммой и клиентом там лишнее.
  robots: { index: false, follow: false },
};

export async function generateStaticParams() {
  // Cache Components (Next 16) требует ≥1 результат для динамического сегмента,
  // иначе маршрут пытается пререндериться целиком и сборка падает на «uncached
  // data outside <Suspense>». Реальных кодов на билде нет и быть не может —
  // отдаём заглушку; настоящие заказы читаются в рантайме внутри дыры.
  return [{ token: "__prerender_placeholder__" }];
}

const rub = (v: number) => `${v.toLocaleString("ru-RU")} ₽`;

export default function PayPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main className="min-h-dvh bg-[#F3F0F8] px-4 py-6 text-[#1A1626]">
      <div className="mx-auto w-full max-w-[440px]">
        <Suspense fallback={<Skeleton />}>
          {/* Промис уезжает ВНУТРЬ дыры: разворачивать его на уровне страницы
              значит читать данные вне Suspense — сборка падает целиком. */}
          <PayContent params={params} />
        </Suspense>
      </div>
    </main>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      <div className="h-36 animate-pulse rounded-3xl bg-[#EADDFF]" />
      <div className="h-52 animate-pulse rounded-3xl bg-white/70" />
    </div>
  );
}

async function PayContent({ params }: { params: Promise<{ token: string }> }) {
  // 🔴 PPR-грабля (CLAUDE.md §8): без connection() на билде фетчер вернёт null
  // не тронув динамику, и «ссылка не открылась» запечётся в статику навсегда.
  await connection();
  const { token } = await params;
  const order = await fetchPayOrder(token);

  if (!order) return <NotFound />;
  return <Order token={token} order={order} />;
}

function NotFound() {
  return (
    <div className="rounded-3xl bg-white p-6 text-center">
      <h1 className="m-0 font-display text-[19px] font-extrabold">Ссылка не открылась</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-[#6B6478]">
        Возможно, заказ отменён или ссылка скопирована не полностью. Напишите тому, кто её прислал,
        — он выпустит новую.
      </p>
    </div>
  );
}

function Order({ token, order }: { token: string; order: ApiPayOrder }) {
  const paidUp = order.state === "paid";
  const partial = order.state === "partially_paid";
  /** Сколько останется должен клиент ПОСЛЕ текущего платежа. */
  const restAfterNow = order.amountRub - order.paidRub - order.dueNowRub;

  return (
    <>
      <section className="rounded-3xl bg-gradient-to-br from-[#EADDFF] to-[#F7F0FF] p-5">
        <div className="font-mono text-[11px] uppercase tracking-wider text-[#5B21B6]">
          Заказ № {formatDealNo(order.dealNo)}
        </div>
        <h1 className="mt-1 mb-0 font-display text-[22px] font-extrabold">{order.package.title}</h1>

        {paidUp ? (
          <div className="mt-3 flex items-center gap-2 font-display text-[19px] font-extrabold text-[#127a4d]">
            <CircleCheck size={20} /> Оплачено полностью
          </div>
        ) : (
          <>
            <div className="mt-2 font-mono text-[32px] font-bold leading-none tracking-tight">
              {rub(order.dueNowRub)}
            </div>
            <div className="mt-1.5 text-[12.5px] text-[#5B21B6]">
              {order.installments > 1
                ? `${partial ? "второй" : "первый"} платёж из ${order.installments} · всего ${rub(order.amountRub)}`
                : "единоразово, за разработку и настройку"}
            </div>
          </>
        )}
      </section>

      {/* 🔴 График показываем, только если после этого платежа что-то ОСТАНЕТСЯ.
          На второй части рассрочки остаток равен нулю, и блок «до 15.09 — 0 ₽»
          заставляет человека гадать, что это значит. Поймано живым прогоном. */}
      {order.installments > 1 && !paidUp && restAfterNow > 0 && (
        <div className="mt-3 flex gap-2.5">
          <Part label="Сейчас" value={rub(order.dueNowRub)} active />
          <Part
            label={order.nextDueAt ? `До ${formatDate(order.nextDueAt)}` : "Через месяц"}
            value={rub(restAfterNow)}
          />
        </div>
      )}

      <section className="mt-3 rounded-3xl bg-white p-5">
        <p className="m-0 text-[13.5px] leading-relaxed text-[#6B6478]">{order.package.summary}</p>
        <ul className="mt-3 mb-0 list-none space-y-1.5 p-0 text-[13.5px] leading-snug">
          {order.package.includes.map((line) => (
            <li key={line} className="flex gap-2.5">
              <Check size={15} className="mt-0.5 shrink-0 text-[#127a4d]" />
              <span>{line}</span>
            </li>
          ))}
        </ul>

        {paidUp ? (
          <p className="mt-4 mb-0 rounded-2xl bg-[#C6EFDD] px-4 py-3 text-[13.5px] leading-snug">
            Деньги получены полностью. Мы уже начали работу — дальше с вами свяжется тот, кто вёл
            переговоры.
          </p>
        ) : order.state === "cancelled" ? (
          <p className="mt-4 mb-0 rounded-2xl bg-[#FBE3B8] px-4 py-3 text-[13.5px] leading-snug">
            Заказ отменён. Если это ошибка, напишите тому, кто прислал ссылку.
          </p>
        ) : (
          <PayForm
            token={token}
            dueRub={order.dueNowRub}
            cardAvailable={order.cardAvailable}
            defaultEmail={order.payerEmail}
            companyName={order.payerName}
          />
        )}
      </section>

      {partial && (
        <div className="mt-3 flex items-start gap-2.5 rounded-2xl bg-white px-4 py-3 text-[12.5px] leading-snug text-[#6B6478]">
          <Clock size={15} className="mt-0.5 shrink-0 text-[#B45309]" />
          <span>
            Первый платёж {rub(order.paidRub)} получен, работа идёт. Вторую часть можно оплатить по
            этой же ссылке — она не меняется.
          </span>
        </div>
      )}

      {/* Реквизиты продавца — из варианта «Счёт»: без них страница, просящая
          350 000 ₽, выглядит как чья угодно. */}
      <footer className="mt-4 px-1 pb-6 text-[11.5px] leading-relaxed text-[#6B6478]">
        <div>{order.seller.legalName}</div>
        <div className="font-mono">
          ИНН {order.seller.inn} · ОГРНИП {order.seller.ogrnip}
        </div>
        <div className="mt-1">
          {order.seller.phone} · {order.seller.email}
        </div>
        <div className="mt-1.5">{order.seller.vatNote}</div>
        <div className="mt-1.5">Оплата через ЮKassa. Чек по 54-ФЗ придёт на указанную почту.</div>
      </footer>
    </>
  );
}

function Part({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div
      className={`flex-1 rounded-2xl border-[1.5px] p-3 ${
        active ? "border-[#7C3AED] bg-[#F7F0FF]" : "border-[#E8E3F0] bg-white"
      }`}
    >
      <div className="text-[11.5px] text-[#6B6478]">{label}</div>
      <div className="mt-0.5 font-mono text-[15px] font-bold">{value}</div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}
