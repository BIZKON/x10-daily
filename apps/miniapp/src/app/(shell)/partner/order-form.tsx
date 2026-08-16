"use client";

import { formatDealNo } from "@x10/config";
import { Check, Copy, Loader2, Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { createOrder } from "./actions";
import { ORDER_IDLE } from "./form-state";

const PACKAGES = [
  { key: "line", label: "Линия", priceRub: 350_000 },
  { key: "manual", label: "Ручной", priceRub: 180_000 },
] as const;

const rub = (v: number) => `${v.toLocaleString("ru-RU")} ₽`;

/**
 * «Завести на оплату» — то, ради чего строился магазин (спека 7).
 *
 * Форма закрыта до нажатия: кабинет открывают чаще, чтобы посмотреть деньги,
 * чем чтобы завести заказ, и постоянно развёрнутая форма отодвигала бы главное
 * вниз.
 *
 * 🔴 Сумму партнёр не вводит — выбирает пакет. Цена приходит из прайса, и
 * менять её через эту форму нельзя: договорная цена согласуется с владельцем.
 */
export function OrderForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createOrder, ORDER_IDLE);
  const [pkg, setPkg] = useState<"line" | "manual">("line");
  const [installments, setInstallments] = useState(1);
  const [copied, setCopied] = useState(false);

  const price = PACKAGES.find((p) => p.key === pkg)?.priceRub ?? 0;
  const first = installments > 1 ? Math.round(price / installments) : price;

  if (state.status === "created") {
    const text =
      `Ссылка на оплату заказа № ${formatDealNo(state.dealNo)}: ${state.payUrl}\n` +
      `К оплате ${rub(state.firstPaymentRub)}. Оплатить можно картой или по счёту для юрлица; ` +
      "чек придёт на почту, которую вы укажете.";

    return (
      <section className="mt-3 rounded-2xl border border-success/30 bg-success/10 p-4">
        <div className="font-display text-[15px] font-bold">
          Заказ № {formatDealNo(state.dealNo)} готов
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-white/65">
          Отправьте ссылку клиенту. Как только он заплатит, доля появится здесь сама — спрашивать
          нас не нужно.
        </p>

        <code className="mt-2.5 block truncate rounded-xl bg-black/30 px-3 py-2.5 font-mono text-[12.5px] text-gold">
          {state.payUrl}
        </code>

        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(text);
              setCopied(true);
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-[13.5px] font-bold text-ink"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Скопировано" : "Скопировать текст клиенту"}
          </button>
        </div>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 w-full rounded-xl border border-white/15 px-4 py-2 text-[13px] text-white/70"
        >
          Завести ещё один
        </button>
      </section>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gold px-5 py-3 font-display text-[14.5px] font-extrabold text-ink"
      >
        <Plus size={16} strokeWidth={2.5} /> Завести клиента на оплату
      </button>
    );
  }

  return (
    <form action={action} className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="font-display text-[15px] font-bold">Новый заказ</div>

      <label className="mt-3 block">
        <span className="block text-[12px] text-white/50">Клиент</span>
        <input
          name="clientName"
          required
          placeholder="ООО «Ромашка» или Иван Петров"
          className="mt-1 w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2.5 text-[14.5px] text-paper placeholder:text-white/25"
        />
      </label>

      <label className="mt-2.5 block">
        <span className="block text-[12px] text-white/50">Контакт, чтобы вы не потеряли</span>
        <input
          name="clientContact"
          placeholder="@nickname или телефон"
          className="mt-1 w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2.5 text-[14.5px] text-paper placeholder:text-white/25"
        />
      </label>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {PACKAGES.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPkg(p.key)}
            className={`rounded-xl border px-3 py-2.5 text-left ${
              pkg === p.key ? "border-gold bg-gold/12" : "border-white/12 bg-white/[0.02]"
            }`}
          >
            <span className="block text-[13.5px] font-bold">{p.label}</span>
            <span className="mt-0.5 block font-mono text-[12px] text-white/55">
              {rub(p.priceRub)}
            </span>
          </button>
        ))}
      </div>
      <input type="hidden" name="package" value={pkg} />

      <div className="mt-3 grid grid-cols-2 gap-2">
        {[1, 2].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setInstallments(n)}
            className={`rounded-xl border px-3 py-2.5 text-left ${
              installments === n ? "border-gold bg-gold/12" : "border-white/12 bg-white/[0.02]"
            }`}
          >
            <span className="block text-[13.5px] font-bold">
              {n === 1 ? "Одним платежом" : "Двумя платежами"}
            </span>
            <span className="mt-0.5 block font-mono text-[12px] text-white/55">
              {/* Один знак валюты на пару: с двумя строка ломается на три и
                  блоки выбора расходятся по высоте. */}
              {n === 1
                ? rub(price)
                : `${Math.round(price / 2).toLocaleString("ru-RU")} + ${rub(price - Math.round(price / 2))}`}
            </span>
          </button>
        ))}
      </div>
      <input type="hidden" name="installments" value={installments} />

      <button
        type="submit"
        disabled={pending}
        className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl bg-gold px-5 py-3 font-display text-[14.5px] font-extrabold text-ink disabled:opacity-60"
      >
        {pending ? <Loader2 size={15} className="animate-spin" /> : null}
        {pending ? "Готовим ссылку" : `Получить ссылку на ${rub(first)}`}
      </button>

      {state.status === "error" && (
        <p className="mt-2 text-[13px] text-red" role="status">
          {state.message}
        </p>
      )}

      <p className="mt-2 text-[11.5px] leading-relaxed text-white/40">
        Рассрочка — максимум два месяца. Другая цена или больше частей — сначала обсудите с нами.
      </p>
    </form>
  );
}
