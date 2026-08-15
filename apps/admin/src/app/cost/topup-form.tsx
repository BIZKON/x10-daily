"use client";

import { TOPUP_AMOUNTS_RUB } from "@x10/config";
import { CreditCard, Loader2 } from "lucide-react";
import { useActionState, useState } from "react";
import { startTopup } from "./actions";
import { TOPUP_FORM_IDLE } from "./form-state";

const rub = (v: number) => `${v.toLocaleString("ru-RU")} ₽`;

/**
 * Пополнение баланса.
 *
 * Номиналы — кнопки, но поле остаётся редактируемым: подсказка не должна
 * превращаться в запрет. Почта спрашивается здесь же, потому что без неё касса
 * не выбьет чек, а узнать об этом после оплаты — худший момент.
 */
export function TopupForm({ defaultEmail }: { defaultEmail?: string }) {
  const [state, action, pending] = useActionState(startTopup, TOPUP_FORM_IDLE);
  const [amount, setAmount] = useState<number>(TOPUP_AMOUNTS_RUB[1] ?? TOPUP_AMOUNTS_RUB[0]);

  return (
    <form action={action} className="mt-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        {TOPUP_AMOUNTS_RUB.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setAmount(v)}
            className={`rounded-xl border px-3.5 py-2 font-mono text-[13px] transition-colors ${
              amount === v
                ? "border-gold bg-gold/15 text-paper"
                : "border-fence bg-card text-mist hover:border-gold/50"
            }`}
          >
            {rub(v)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex-1 min-w-[160px]">
          <span className="block text-[12px] text-mist">Сумма, ₽</span>
          <input
            name="amountRub"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, "")) || 0)}
            className="mt-1 w-full rounded-xl border border-fence bg-card px-3 py-2 font-mono text-[14px] text-paper"
          />
        </label>

        <label className="flex-1 min-w-[220px]">
          <span className="block text-[12px] text-mist">Почта для чека</span>
          <input
            name="payerEmail"
            type="email"
            required
            defaultValue={defaultEmail}
            placeholder="почта@пример.ру"
            className="mt-1 w-full rounded-xl border border-fence bg-card px-3 py-2 text-[14px] text-paper"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-5 py-2.5 text-[13.5px] font-bold text-ink transition-opacity disabled:opacity-60"
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
          {pending ? "Открываем оплату" : `Пополнить на ${rub(amount)}`}
        </button>

        {state.status === "error" && (
          <span className="text-[13px] text-red" role="status">
            {state.message}
          </span>
        )}
      </div>

      <p className="m-0 text-[12px] leading-[1.5] text-mist">
        Оплата идёт на странице ЮKassa. Чек по 54-ФЗ придёт на указанную почту, деньги встанут на
        баланс сразу после подтверждения банком.
      </p>
    </form>
  );
}
