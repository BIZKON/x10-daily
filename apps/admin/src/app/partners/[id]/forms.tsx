"use client";

import { Field } from "@/components/form/field";
import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { addPayment, addPayout, createDeal, setMentor, updatePartner } from "../actions";
import { PARTNER_FORM_IDLE, type PartnerFormState } from "../form-state";

/**
 * Формы партнёрской карточки (спека 14.08).
 *
 * У каждого поля — раскрывающееся «Зачем это поле»: эти экраны едут клиенту
 * вместе с продуктом, а человек, который их откроет, не читает наши доки и не
 * может спросить разработчика.
 */

const input =
  "w-full rounded-lg border border-fence bg-night px-3 py-2 text-[14px] text-paper outline-none placeholder:text-haze focus:border-gold/60 focus:bg-card";

function Result({ state }: { state: PartnerFormState }) {
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

export function DealForm({
  partnerId,
  maxInstallmentMonths,
}: {
  partnerId: string;
  maxInstallmentMonths: number;
}) {
  const [state, action, pending] = useActionState(createDeal, PARTNER_FORM_IDLE);

  return (
    <section className="rounded-2xl border border-fence bg-card p-4">
      <h3 className="m-0 mb-3 font-display text-[15px] font-extrabold">Новая сделка</h3>
      <form action={action} className="space-y-3">
        <input type="hidden" name="partnerId" value={partnerId} />

        <Field
          label="Клиент"
          required
          help="Компания или человек, которого привёл партнёр. Это имя партнёр увидит в своём кабинете — пишите так, чтобы он узнал."
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
          help="Телефон, почта или Telegram — чтобы не искать переписку, когда придёт оплата. Необязательно."
        >
          <input name="clientContact" maxLength={200} className={input} placeholder="@romashka" />
        </Field>

        <Field
          label="Пакет"
          help="Ручной режим — 180 000 ₽, линия — 350 000 ₽. От пакета зависит сумма, а не размер доли."
        >
          <select name="package" defaultValue="line" className={input}>
            <option value="line">Линия — 350 000 ₽</option>
            <option value="manual">Ручной режим — 180 000 ₽</option>
          </select>
        </Field>

        <Field
          label="Сумма сделки, ₽"
          required
          help="Сколько клиент платит за вход. Доля партнёра считается не отсюда, а от каждой ПОСТУПИВШЕЙ оплаты: сумма здесь нужна, чтобы видеть, сколько осталось получить."
        >
          <input
            name="amountRub"
            required
            inputMode="decimal"
            className={input}
            placeholder="350000"
          />
        </Field>

        <Field
          label="Рассрочка, месяцев"
          hint={`Не больше ${maxInstallmentMonths} — дальше по согласованию с владельцем`}
          help="График платежей от нас, без банка. Потолок стоит в коде: больше двух месяцев — это отдельное решение, а не галочка в форме."
        >
          <input
            name="installmentMonths"
            type="number"
            min={1}
            max={maxInstallmentMonths}
            defaultValue={1}
            className={input}
          />
        </Field>

        <Field
          label="Заметка"
          help="Что важно помнить об этой сделке: обещания, сроки, особые условия. Партнёр этого не видит."
        >
          <textarea name="note" rows={2} maxLength={2000} className={`${input} resize-y`} />
        </Field>

        <Submit pending={pending}>{pending ? "Заводим" : "Завести сделку"}</Submit>
        <Result state={state} />
      </form>
    </section>
  );
}

export function PaymentForm({
  partnerId,
  deals,
}: {
  partnerId: string;
  deals: Array<{ id: string; clientName: string; amountRub: number; paidRub: number }>;
}) {
  const [state, action, pending] = useActionState(addPayment, PARTNER_FORM_IDLE);

  return (
    <section className="rounded-2xl border border-gold/40 bg-card p-4">
      <h3 className="m-0 mb-1 font-display text-[15px] font-extrabold">Клиент заплатил</h3>
      <p className="m-0 mb-3 text-[12.5px] leading-relaxed text-mist">
        Отметьте поступившую оплату — доля партнёра начислится сама, в тот же момент.
      </p>
      {/* 🔴 Без этой строки владелец однажды отметит вручную оплату, уже
          записанную вебхуком, и партнёр получит долю дважды. Интерфейс должен
          сказать это до ошибки, а не после разбирательства по деньгам. */}
      <p className="m-0 mb-3 rounded-xl border border-gold/40 bg-gold/5 px-3 py-2 text-[12px] leading-relaxed text-mist">
        Только для безнала и наличных. Оплату картой по ссылке система записывает сама — отмечать её
        здесь не нужно, иначе доля начислится дважды.
      </p>
      <form action={action} className="space-y-3">
        <input type="hidden" name="partnerId" value={partnerId} />

        <Field
          label="Сделка"
          required
          help="За какую сделку пришли деньги. В скобках — сколько по ней уже оплачено."
        >
          <select name="dealId" required className={input}>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.clientName} (оплачено {new Intl.NumberFormat("ru-RU").format(d.paidRub)} из{" "}
                {new Intl.NumberFormat("ru-RU").format(d.amountRub)} ₽)
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Сколько пришло, ₽"
          required
          help="Ровно та сумма, что поступила на счёт. Если клиент платит частями — заводите каждую часть отдельно: доля партнёра считается с каждой."
        >
          <input
            name="amountRub"
            required
            inputMode="decimal"
            className={input}
            placeholder="175000"
          />
        </Field>

        <Field
          label="Заметка"
          help="Например, «первый платёж по договору» или номер платёжки. Помогает сверяться с банком."
        >
          <input name="note" maxLength={500} className={input} />
        </Field>

        <Submit pending={pending}>{pending ? "Записываем" : "Записать платёж"}</Submit>
        <Result state={state} />
      </form>
    </section>
  );
}

export function PayoutForm({ partnerId, dueRub }: { partnerId: string; dueRub: number }) {
  const [state, action, pending] = useActionState(addPayout, PARTNER_FORM_IDLE);

  return (
    <section className="rounded-2xl border border-fence bg-card p-4">
      <h3 className="m-0 mb-1 font-display text-[15px] font-extrabold">Выплата партнёру</h3>
      <p className="m-0 mb-3 text-[12.5px] text-mist">
        Перевод делаете вы сами — здесь остаётся след. К выплате сейчас{" "}
        <b className="font-mono text-gold">
          {new Intl.NumberFormat("ru-RU").format(Math.max(0, Math.round(dueRub)))} ₽
        </b>
        .
      </p>
      <form action={action} className="space-y-3">
        <input type="hidden" name="partnerId" value={partnerId} />

        <Field
          label="Сумма, ₽"
          required
          help="Сколько реально перевели. Можно частями: баланс считается как начислено минус выплачено."
        >
          <input
            name="amountRub"
            required
            inputMode="decimal"
            defaultValue={dueRub > 0 ? String(Math.round(dueRub)) : ""}
            className={input}
          />
        </Field>

        <Field
          label="Как перевели"
          help="Карта, СБП, счёт ИП. Свободный текст: способов много, а справочник устареет за месяц."
        >
          <input name="method" maxLength={64} className={input} placeholder="СБП" />
        </Field>

        <Field
          label="Заметка"
          help="Номер поручения, дата акта — всё, что поможет через полгода понять, за что этот перевод."
        >
          <input name="note" maxLength={500} className={input} />
        </Field>

        <Submit pending={pending}>{pending ? "Отмечаем" : "Отметить выплату"}</Submit>
        <Result state={state} />
      </form>
    </section>
  );
}

export function MentorForm({
  partnerId,
  parentId,
  candidates,
}: {
  partnerId: string;
  parentId: string | null;
  candidates: Array<{ id: string; name: string }>;
}) {
  return (
    <section className="rounded-2xl border border-fence bg-card p-4">
      <h3 className="m-0 mb-3 font-display text-[15px] font-extrabold">Наставник</h3>
      <form action={setMentor} className="space-y-3">
        <input type="hidden" name="partnerId" value={partnerId} />
        <Field
          label="Кто привёл этого партнёра"
          help="Наставник получает 5% с его продаж сверх доли самого партнёра, в течение года с регистрации. Пусто — партнёр пришёл сам. Замкнуть круг нельзя: если он сам приводил этого человека, сервер откажет."
        >
          <select name="parentId" defaultValue={parentId ?? ""} className={input}>
            <option value="">Пришёл сам</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-xl border border-fence px-4 py-2 text-[13px] text-mist transition hover:border-gold/50 hover:text-gold"
        >
          Сохранить
        </button>
      </form>
    </section>
  );
}

/**
 * Карточка партнёра: страница КП и настройки участия.
 *
 * Слаг обычно проставляется сам при регистрации — по брони за именем в
 * Telegram. Эта форма нужна, когда человек зашёл под другим аккаунтом или
 * страницу решили переназначить.
 */
export function ProfileForm({
  partnerId,
  slug,
  name,
  contact,
  ratePercent,
  status,
  baseUrl,
}: {
  partnerId: string;
  slug: string | null;
  name: string;
  contact: string | null;
  ratePercent: number;
  status: string;
  baseUrl: string;
}) {
  const [state, action, pending] = useActionState(updatePartner, PARTNER_FORM_IDLE);

  return (
    <section className="rounded-2xl border border-fence bg-card p-4">
      <h3 className="m-0 mb-3 font-display text-[15px] font-extrabold">Карточка партнёра</h3>
      <form action={action} className="space-y-3">
        <input type="hidden" name="partnerId" value={partnerId} />

        <Field
          label="Страница КП"
          hint={slug ? `${baseUrl}/kp/${slug}/` : "страница не привязана"}
          help="Имя его версии коммерческого предложения — то, что стоит в адресе после /kp/. Латиница, цифры и дефис. Партнёр отправляет эту ссылку клиенту, и на ней его фото и контакты. Обычно проставляется сама при регистрации; правьте, если человек зашёл под другим аккаунтом. Занятый адрес система не даст назначить дважды."
        >
          <input
            name="slug"
            defaultValue={slug ?? ""}
            maxLength={64}
            className={input}
            placeholder="ivanov"
          />
        </Field>

        <Field
          label="Имя"
          help="Как партнёр подписан у нас в списке. На его странице КП имя берётся из конфигурации лендинга, здесь — только для админки."
        >
          <input name="name" defaultValue={name} maxLength={160} className={input} />
        </Field>

        <Field label="Контакт" help="Telegram или телефон — чтобы было куда написать про выплату.">
          <input name="contact" defaultValue={contact ?? ""} maxLength={200} className={input} />
        </Field>

        <Field
          label="Ставка, %"
          help="Доля с продаж. Меняется только для БУДУЩИХ сделок: в каждой уже заведённой лежит своя копия ставки, и отчёт по ним не изменится задним числом."
        >
          <input name="ratePercent" defaultValue={String(ratePercent)} className={input} />
        </Field>

        <Field
          label="Участие"
          help="Приостановленный партнёр не видит кабинет и не получает наставнических долей. Начисленное сохраняется — приостановка не отменяет обязательств."
        >
          <select name="status" defaultValue={status} className={input}>
            <option value="active">Активен</option>
            <option value="paused">Приостановлен</option>
          </select>
        </Field>

        <Submit pending={pending}>{pending ? "Сохраняем" : "Сохранить"}</Submit>
        <Result state={state} />
      </form>
    </section>
  );
}
