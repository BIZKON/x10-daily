"use client";

import { Globe, Loader2 } from "lucide-react";
import { useActionState } from "react";
import { startKnowledgeImport } from "./actions";
import { KB_FORM_IDLE } from "./form-state";

/**
 * Заполнить базу знаний с сайта клиента.
 *
 * Стоит рядом с анкетой, а не вместо неё: анкета отвечает на вопрос «чего не
 * хватает», кнопка — «возьмите это с моего сайта». Замер 10–11.08 показал, что
 * анкету не заполняют: в базе прода лежал ОДИН материал.
 */
export function ImportForm() {
  const [state, action, pending] = useActionState(startKnowledgeImport, KB_FORM_IDLE);

  return (
    <section className="rounded-2xl border border-dashed border-fence bg-card p-5">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.15em] text-gold">
        <Globe size={13} strokeWidth={2} /> Заполнить с сайта
      </div>

      <p className="m-0 mb-4 max-w-[62ch] text-[13.5px] leading-relaxed text-mist">
        Дайте адрес вашего сайта — система прочитает несколько страниц и предложит готовые материалы
        по полкам. Вы посмотрите и решите, что оставить. Обычно занимает минуту.
      </p>

      <form action={action} className="flex flex-wrap items-center gap-2.5">
        <input
          name="siteUrl"
          type="text"
          required
          inputMode="url"
          placeholder="veles-logistics.ru"
          className="min-w-0 flex-1 rounded-xl border border-fence bg-ink px-3.5 py-2.5 font-mono text-[13px] text-paper outline-none placeholder:text-haze focus-visible:border-gold"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-5 py-2.5 text-[13.5px] font-bold text-ink transition-opacity disabled:opacity-60"
        >
          {pending && <Loader2 size={14} className="animate-spin" />}
          {pending ? "Начинаем" : "Собрать по ссылке"}
        </button>
      </form>

      {state.status === "error" && (
        <p className="m-0 mt-2.5 text-[13px] text-red" role="status">
          {state.message}
        </p>
      )}

      <p className="m-0 mt-3 text-[12.5px] leading-relaxed text-haze">
        Заводим знание о вашем бизнесе. Чужой сайт брать бессмысленно: система начнёт писать про
        чужие услуги.
      </p>
    </section>
  );
}
