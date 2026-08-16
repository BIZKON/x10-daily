"use client";

import { CreditCard, FileText, Loader2 } from "lucide-react";
import { useActionState, useState } from "react";
import { saveCompany, startCardPayment } from "./actions";
import { PAY_FORM_IDLE } from "./form-state";

const rub = (v: number) => `${v.toLocaleString("ru-RU")} ₽`;

/**
 * Выбор способа оплаты и всё, что нужно ввести (спека 7, вариант Б).
 *
 * Карта и счёт — не два разных экрана, а два ответа на один вопрос: клиент
 * решает уже после того, как увидел, что покупает и сколько платит сейчас.
 *
 * ⚠️ Почта спрашивается до оплаты, а не после: без неё касса не выбьет чек по
 * 54-ФЗ, и узнать об этом после списания 175 000 ₽ — худший момент.
 */
export function PayForm({
  token,
  dueRub,
  cardAvailable,
  defaultEmail,
  companyName,
}: {
  token: string;
  dueRub: number;
  cardAvailable: boolean;
  defaultEmail: string | null;
  companyName: string | null;
}) {
  const [method, setMethod] = useState<"card" | "invoice">(cardAvailable ? "card" : "invoice");
  const [cardState, cardAction, cardPending] = useActionState(startCardPayment, PAY_FORM_IDLE);
  const [companyState, companyAction, companyPending] = useActionState(saveCompany, PAY_FORM_IDLE);

  return (
    <div className="mt-5">
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => setMethod("card")}
          disabled={!cardAvailable}
          className={`rounded-2xl border-[1.5px] p-3 text-left transition-colors disabled:opacity-40 ${
            method === "card" ? "border-[#7C3AED] bg-[#F7F0FF]" : "border-[#E8E3F0] bg-white"
          }`}
        >
          <span className="block font-display text-[14px] font-extrabold">Картой</span>
          <span className="mt-0.5 block text-[11.5px] leading-snug text-[#6B6478]">
            {cardAvailable ? "сразу, чек на почту" : "временно недоступно"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMethod("invoice")}
          className={`rounded-2xl border-[1.5px] p-3 text-left transition-colors ${
            method === "invoice" ? "border-[#7C3AED] bg-[#F7F0FF]" : "border-[#E8E3F0] bg-white"
          }`}
        >
          <span className="block font-display text-[14px] font-extrabold">Счётом</span>
          <span className="mt-0.5 block text-[11.5px] leading-snug text-[#6B6478]">
            для юрлица, 1–3 дня
          </span>
        </button>
      </div>

      {method === "card" ? (
        <form action={cardAction} className="mt-4">
          <input type="hidden" name="token" value={token} />

          <label className="block">
            <span className="block text-[12px] text-[#6B6478]">Почта для чека</span>
            <input
              name="payerEmail"
              type="email"
              required
              defaultValue={defaultEmail ?? ""}
              placeholder="почта@пример.ру"
              className="mt-1 w-full rounded-xl border-[1.5px] border-[#E8E3F0] bg-white px-3 py-2.5 text-[15px] text-[#1A1626]"
            />
          </label>

          <label className="mt-3 flex items-start gap-2 text-[11.5px] leading-snug text-[#6B6478]">
            <input
              type="checkbox"
              name="offerAccepted"
              required
              className="mt-0.5 h-4 w-4 accent-[#7C3AED]"
            />
            <span>
              Согласен с{" "}
              <a href="/legal/offer" className="text-[#7C3AED] underline">
                офертой
              </a>{" "}
              и{" "}
              <a href="/legal/privacy" className="text-[#7C3AED] underline">
                политикой обработки данных
              </a>
              .
            </span>
          </label>

          <button
            type="submit"
            disabled={cardPending}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#7C3AED] px-5 py-3.5 font-display text-[15.5px] font-extrabold text-white disabled:opacity-60"
          >
            {cardPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <CreditCard size={16} />
            )}
            {cardPending ? "Открываем оплату" : `Оплатить ${rub(dueRub)}`}
          </button>

          {cardState.status === "error" && (
            <p className="mt-2 text-[13px] text-[#B3261E]" role="status">
              {cardState.message}
            </p>
          )}
        </form>
      ) : (
        <form action={companyAction} className="mt-4">
          <input type="hidden" name="token" value={token} />

          <div className="grid gap-3">
            <label className="block">
              <span className="block text-[12px] text-[#6B6478]">Название организации</span>
              <input
                name="payerName"
                required
                defaultValue={companyName ?? ""}
                placeholder="ООО «Ромашка»"
                className="mt-1 w-full rounded-xl border-[1.5px] border-[#E8E3F0] bg-white px-3 py-2.5 text-[15px] text-[#1A1626]"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-[12px] text-[#6B6478]">ИНН</span>
                <input
                  name="payerInn"
                  inputMode="numeric"
                  required
                  className="mt-1 w-full rounded-xl border-[1.5px] border-[#E8E3F0] bg-white px-3 py-2.5 font-mono text-[15px] text-[#1A1626]"
                />
              </label>
              <label className="block">
                <span className="block text-[12px] text-[#6B6478]">КПП, если есть</span>
                <input
                  name="payerKpp"
                  inputMode="numeric"
                  className="mt-1 w-full rounded-xl border-[1.5px] border-[#E8E3F0] bg-white px-3 py-2.5 font-mono text-[15px] text-[#1A1626]"
                />
              </label>
            </div>

            <label className="block">
              <span className="block text-[12px] text-[#6B6478]">Адрес, если нужен в счёте</span>
              <input
                name="payerAddress"
                className="mt-1 w-full rounded-xl border-[1.5px] border-[#E8E3F0] bg-white px-3 py-2.5 text-[15px] text-[#1A1626]"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={companyPending}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#7C3AED] px-5 py-3.5 font-display text-[15.5px] font-extrabold text-white disabled:opacity-60"
          >
            {companyPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <FileText size={16} />
            )}
            {companyPending ? "Готовим счёт" : "Получить счёт"}
          </button>

          {companyState.status === "error" && (
            <p className="mt-2 text-[13px] text-[#B3261E]" role="status">
              {companyState.message}
            </p>
          )}

          {companyState.status === "invoice" && (
            <a
              href={companyState.invoiceUrl}
              className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-[#7C3AED] bg-white px-5 py-3 font-display text-[14.5px] font-extrabold text-[#7C3AED]"
            >
              <FileText size={15} /> Открыть счёт № заказа
            </a>
          )}

          <p className="mt-2.5 text-[11.5px] leading-snug text-[#6B6478]">
            Счёт откроется здесь же — его можно скачать и передать в бухгалтерию. Оплата по счёту
            идёт без комиссии, деньги приходят за один–три рабочих дня.
          </p>
        </form>
      )}
    </div>
  );
}
