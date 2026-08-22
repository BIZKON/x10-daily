"use client";

import { Field } from "@/components/form/field";
import { Check, Copy, Loader2 } from "lucide-react";
import { useActionState, useState } from "react";
import { addOrderPayment, createOrder, refundOrder } from "./actions";
import { NEW_ORDER_IDLE, ORDER_FORM_IDLE, type OrderFormState } from "./form-state";

/**
 * Формы раздела «Заказы» (спека 7).
 *
 * У каждого поля — раскрывающееся «Зачем это поле»: экран едет клиенту вместе
 * с продуктом, а человек, который его откроет, не читает наши доки и не может
 * спросить разработчика.
 */

const input =
  "w-full rounded-lg border border-fence bg-night px-3 py-2 text-[14px] text-paper outline-none placeholder:text-haze focus:border-gold/60 focus:bg-card";

function Result({ state }: { state: OrderFormState }) {
  if (state.status === "idle") return null;
  return (
    <output
      className={`mt-2 block text-[12.5px] ${state.status === "ok" ? "text-success" : "text-red"}`}
    >
      {state.message}
    </output>
  );
}

function Submit({ pending, children }: { pending: boolean; children: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-[13.5px] font-bold text-ink transition-opacity disabled:opacity-60"
    >
      {pending && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

/** Ссылка с копированием: её отдают клиенту, и переписывать руками её нельзя. */
export function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(url).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        });
      }}
      className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-fence bg-night px-2.5 py-1.5 text-left font-mono text-[12px] text-mist transition hover:border-gold/50"
    >
      {done ? (
        <Check size={13} className="shrink-0 text-success" />
      ) : (
        <Copy size={13} className="shrink-0" />
      )}
      <span className="truncate">{done ? "Скопировано" : url}</span>
    </button>
  );
}

export function NewOrderForm({
  partners,
  maxInstallmentMonths,
}: {
  partners: Array<{ id: string; name: string; ratePercent: number }>;
  maxInstallmentMonths: number;
}) {
  const [state, action, pending] = useActionState(createOrder, NEW_ORDER_IDLE);

  return (
    <section className="rounded-2xl border border-gold/40 bg-card p-4">
      <h3 className="m-0 mb-1 font-display text-[15px] font-extrabold">Новый заказ</h3>
      <p className="m-0 mb-3 text-[12.5px] leading-relaxed text-mist">
        Появится ссылка на оплату — её и отправляете клиенту. Ничего подтверждать не нужно.
      </p>

      {state.status === "created" ? (
        <div className="rounded-xl border border-success/40 bg-success/5 p-3">
          <div className="mb-2 text-[13px] text-paper">
            Заказ № {String(state.dealNo).padStart(4, "0")} заведён. Ссылка для клиента:
          </div>
          <CopyLink url={state.payUrl} />
        </div>
      ) : (
        <form action={action} className="space-y-3">
          <Field
            label="Клиент"
            required
            help="Название компании или имя человека. Клиент увидит его на странице оплаты и в счёте — пишите так, как в документах."
          >
            <input
              name="clientName"
              required
              maxLength={200}
              className={input}
              placeholder="ООО «Ромашка»"
            />
          </Field>

          <Field
            label="Контакт клиента"
            help="Телеграм, почта или телефон — куда написать, если оплата зависла. Клиент этого не видит."
          >
            <input name="clientContact" maxLength={200} className={input} placeholder="@romashka" />
          </Field>

          <Field
            label="Кто продал"
            help="Партнёр получит 20% с каждой поступившей оплаты, его наставник — 5% сверх. «Продали сами» — начислять некому, вся сумма остаётся у нас."
          >
            <select name="partnerId" defaultValue="" className={input}>
              <option value="">Продали сами — без партнёра</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.ratePercent}%
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Пакет"
            help="Ручной режим — 180 000 ₽, линия — 350 000 ₽. От пакета зависит, что клиент увидит на странице оплаты; сумму ниже можно поставить любую."
          >
            <select name="package" defaultValue="line" className={input}>
              <option value="line">Линия — 350 000 ₽</option>
              <option value="manual">Ручной режим — 180 000 ₽</option>
            </select>
          </Field>

          <Field
            label="Сумма заказа, ₽"
            required
            help="Обычно цена пакета. Любая другая сумма — это и есть «скидка по согласованию»: партнёр сам поставить её не может, а вы можете."
          >
            <input
              name="amountRub"
              required
              inputMode="decimal"
              defaultValue="350000"
              className={input}
            />
          </Field>

          <Field
            label="Частей оплаты"
            help={`Одна — платит целиком. Две — 50/50, вторая часть через месяц по ТОЙ ЖЕ ссылке. Больше ${maxInstallmentMonths} частей не бывает: это решение владельца, а не ограничение системы.`}
          >
            <select name="installmentMonths" defaultValue="1" className={input}>
              <option value="1">Одна — сразу вся сумма</option>
              <option value="2">Две — 50/50, вторая через месяц</option>
            </select>
          </Field>

          <Field
            label="Заметка"
            help="Для себя: откуда клиент, что обещали, когда перезвонить. Клиент этого не видит."
          >
            <input name="note" maxLength={2000} className={input} />
          </Field>

          <Submit pending={pending}>{pending ? "Заводим" : "Завести заказ"}</Submit>
          {state.status === "error" && (
            <output className="mt-2 block text-[12.5px] text-red">{state.message}</output>
          )}
        </form>
      )}
    </section>
  );
}

/** Отметка поступивших денег — безнал и наличные. Карту система пишет сама. */
export function PaymentForm({ dealId, dueRub }: { dealId: string; dueRub: number }) {
  const [state, action, pending] = useActionState(addOrderPayment, ORDER_FORM_IDLE);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="dealId" value={dealId} />
      <div className="text-[12.5px] font-bold text-paper">Деньги пришли</div>
      {/* 🔴 Без этой строки владелец однажды отметит вручную оплату, уже
          записанную вебхуком, и партнёр получит долю дважды. */}
      <p className="m-0 text-[11.5px] leading-relaxed text-haze">
        Только безнал и наличные. Оплату картой по ссылке система записывает сама.
      </p>
      <input
        name="amountRub"
        required
        inputMode="decimal"
        defaultValue={dueRub > 0 ? String(Math.round(dueRub)) : ""}
        className={input}
        placeholder="Сколько пришло, ₽"
      />
      <input name="note" maxLength={500} className={input} placeholder="Номер платёжки" />
      <Submit pending={pending}>{pending ? "Записываем" : "Записать платёж"}</Submit>
      <Result state={state} />
    </form>
  );
}

/** Возврат клиенту: сторно комиссии уходит той же транзакцией. */
export function RefundForm({ dealId }: { dealId: string }) {
  const [state, action, pending] = useActionState(refundOrder, ORDER_FORM_IDLE);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="dealId" value={dealId} />
      <div className="text-[12.5px] font-bold text-red">Вернули клиенту</div>
      <p className="m-0 text-[11.5px] leading-relaxed text-haze">
        Сначала верните деньги в кабинете ЮKassa или со счёта. Здесь — только след: комиссия
        партнёра сторнируется в той же доле.
      </p>
      <input
        name="amountRub"
        required
        inputMode="decimal"
        className={input}
        placeholder="Сколько вернули, ₽"
      />
      <input name="note" maxLength={500} className={input} placeholder="Причина" />
      <Submit pending={pending}>{pending ? "Записываем" : "Записать возврат"}</Submit>
      <Result state={state} />
    </form>
  );
}
