"use client";

import { Link2, Loader2 } from "lucide-react";
import { useActionState } from "react";
import { submitLink } from "./link-actions";
import { LINK_FORM_IDLE } from "./link-form-state";

/**
 * Второй вход конвейера: поле «вставьте ссылку».
 *
 * Стоит на экране очереди, а не отдельным разделом, — потому что результат
 * появляется здесь же, в этой очереди. Разводить действие и его результат по
 * разным экранам значит заставлять человека искать, что произошло.
 */
export function LinkForm() {
  const [state, action, pending] = useActionState(submitLink, LINK_FORM_IDLE);

  return (
    <form action={action} className="mb-6 rounded-2xl border border-fence bg-card p-4">
      <div className="flex items-center gap-2">
        <Link2 size={16} strokeWidth={1.75} className="shrink-0 text-gold" />
        <span className="font-display text-[15px] font-bold">Материал по ссылке</span>
      </div>

      <p className="mt-1.5 max-w-[70ch] text-[13px] leading-[1.55] text-mist">
        Увидели удачный материал — вставьте ссылку. Система разберёт, за счёт чего он сработал, и
        напишет свой на эту тему: в вашей рубрике, вашим голосом и с вашим углом. Результат придёт
        сюда же, в очередь на одобрение.
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          name="url"
          type="url"
          required
          placeholder="https://example.com/статья"
          className="min-w-0 flex-1 rounded-xl border border-fence bg-ink px-3 py-2.5 text-[14px] outline-none focus-visible:border-gold"
          aria-label="Ссылка на материал"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-5 py-2.5 text-[14px] font-bold text-ink disabled:opacity-60"
        >
          {pending && <Loader2 size={15} className="animate-spin" />}
          {pending ? "Разбираем" : "Разобрать"}
        </button>
      </div>

      {state.status !== "idle" && (
        <p
          className={`mt-2.5 text-[13px] leading-[1.5] ${
            state.status === "ok" ? "text-emerald" : "text-red"
          }`}
        >
          {state.message}
        </p>
      )}

      <details className="mt-3 text-[12.5px] text-mist">
        <summary className="cursor-pointer select-none text-gold">Зачем это поле</summary>
        <div className="mt-2 leading-[1.55]">
          Обычно темы приходят сами — из лент, которые вы завели в разделе «Источники». Это второй
          путь: когда тему принесли вы. Система не копирует чужой текст, а берёт приём — чем
          материал захватывает внимание, чем подкрепляет и к чему подводит, — и применяет его к
          вашей теме.
          <br />
          <br />
          Работает со статьями и текстовыми постами. Ссылка на видео или на соцсеть текста не даст:
          там он рисуется скриптом, и страница приходит пустой — система об этом честно скажет.
          <br />
          <br />
          Разбор — платный прогон, он виден в разделе «Расходы» отдельной строкой.
        </div>
      </details>
    </form>
  );
}
