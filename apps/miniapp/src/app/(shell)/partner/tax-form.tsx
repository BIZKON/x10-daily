"use client";

import { Loader2, ReceiptText } from "lucide-react";
import { useActionState } from "react";
import { saveTaxStatus } from "./actions";
import { TAX_IDLE } from "./form-state";

/**
 * Налоговый статус партнёра — спрашиваем при первом начислении (спека 7 §10).
 *
 * 🔴 Показывается только когда деньги уже есть: анкета при вступлении отсеяла
 * бы часть людей ровно в момент интереса, а до первой комиссии статус ни на
 * что не влияет.
 *
 * Формулировки — про деньги человека, а не про наш учёт: «кто вы по документам»
 * ему ничего не говорит, «получите всё или за вычетом налога» говорит всё.
 */
export function TaxForm({ dueRub }: { dueRub: number }) {
  const [state, action, pending] = useActionState(saveTaxStatus, TAX_IDLE);

  if (state.status === "ok") {
    return (
      <section className="mt-3 rounded-2xl border border-success/40 bg-success/5 p-4">
        <div className="text-[13.5px] text-white/80">{state.message}</div>
      </section>
    );
  }

  return (
    <section className="mt-3 rounded-2xl border border-gold/40 bg-gold/5 p-4">
      <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-gold">
        <ReceiptText size={14} strokeWidth={2} /> Чтобы выплатить
      </div>
      <p className="mt-1.5 mb-3 text-[13.5px] leading-relaxed text-white/75">
        У вас появилось {new Intl.NumberFormat("ru-RU").format(Math.round(dueRub))} ₽ к выплате.
        Скажите, как вы оформлены, — от этого зависит, придёт вся сумма или за вычетом налога.
      </p>

      <form action={action} className="space-y-2.5">
        <select
          name="taxStatus"
          required
          defaultValue=""
          className="w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2.5 text-[14px] text-white outline-none focus:border-gold/60"
        >
          <option value="" disabled>
            Выберите
          </option>
          <option value="self_employed">Самозанятый — получу всё, налог плачу сам</option>
          <option value="entrepreneur">ИП — получу всё, налог плачу сам</option>
          <option value="individual">Обычное физлицо — удержите НДФЛ 13%</option>
        </select>

        <input
          name="inn"
          inputMode="numeric"
          maxLength={12}
          placeholder="ИНН (12 цифр)"
          className="w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2.5 text-[14px] text-white outline-none placeholder:text-white/35 focus:border-gold/60"
        />

        <button
          type="submit"
          disabled={pending}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gold px-4 py-3 font-display text-[14.5px] font-extrabold text-ink transition-opacity disabled:opacity-60"
        >
          {pending && <Loader2 size={15} className="animate-spin" />}
          {pending ? "Сохраняем" : "Сохранить"}
        </button>

        {state.status === "error" && (
          <output className="block text-center text-[13px] text-red">{state.message}</output>
        )}
      </form>
    </section>
  );
}
