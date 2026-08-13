"use client";

import { Loader2, Undo2, XCircle } from "lucide-react";
import { useActionState } from "react";
import { rejectPublication, requeuePublication } from "./actions";
import { MIN_REJECT_REASON, POSTING_FORM_IDLE } from "./form-state";

/**
 * «Снято площадкой» — с обязательной причиной.
 *
 * Форма спрятана под `<details>`: снятие происходит редко, а кнопка рядом с
 * каждой вышедшей публикацией не должна выглядеть основным действием экрана.
 * Раскрытие обходится без клиентского состояния и работает на телефоне.
 */
export function RejectForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(rejectPublication, POSTING_FORM_IDLE);

  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-fence px-2.5 py-1 text-[12px] text-mist transition hover:border-red/50 hover:text-red [&::-webkit-details-marker]:hidden">
        <XCircle size={13} strokeWidth={1.75} />
        <span className="group-open:hidden">Снято площадкой</span>
        <span className="hidden group-open:inline">Отмена</span>
      </summary>

      <form action={action} className="mt-2 rounded-xl border border-fence bg-night/60 p-3">
        <input type="hidden" name="id" value={id} />
        <label className="block" htmlFor={`reason-${id}`}>
          <span className="mb-1.5 flex items-center gap-1 text-[12px] font-semibold text-mist">
            Почему сняли <span className="text-red">*</span>
          </span>
          <textarea
            id={`reason-${id}`}
            name="reason"
            rows={2}
            required
            minLength={MIN_REJECT_REASON}
            maxLength={500}
            placeholder="Например: реклама без маркировки"
            className="w-full resize-y rounded-lg border border-fence bg-night px-3 py-2 text-[13.5px] text-paper outline-none placeholder:text-haze focus:border-gold/60 focus:bg-card"
          />
        </label>

        {/* Канон «админка объясняет себя»: человек в кабинете клиента не читает
            наши доки и не может спросить разработчика. */}
        <details className="group/help mt-1.5">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[11px] text-haze transition hover:text-mist [&::-webkit-details-marker]:hidden">
            <span
              aria-hidden
              className="grid h-3.5 w-3.5 place-items-center rounded-full border border-current text-[9px] font-bold leading-none"
            >
              ?
            </span>
            <span className="group-open/help:hidden">Зачем это поле</span>
            <span className="hidden group-open/help:inline">Свернуть</span>
          </summary>
          <div className="mt-1.5 rounded-lg border border-fence bg-night/60 px-3 py-2 text-[12px] leading-[1.55] text-mist">
            Площадка сняла пост — запишите, за что именно. Причина остаётся в строке навсегда, в том
            числе после возврата в очередь: без неё второй заход выглядит первым, и материал снимут
            снова по той же причине. Пустой её оставить нельзя.
          </div>
        </details>

        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red px-3.5 py-1.5 text-[12.5px] font-bold text-paper transition-opacity disabled:opacity-60"
          >
            {pending ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
            {pending ? "Отмечаем" : "Отметить снятым"}
          </button>
          {state.status !== "idle" && (
            <output
              className={`text-[12.5px] ${state.status === "ok" ? "text-success" : "text-red"}`}
            >
              {state.message}
            </output>
          )}
        </div>
      </form>
    </details>
  );
}

/**
 * «Вернуть в очередь» — следующий слот заберёт публикацию снова.
 *
 * Без подтверждения: действие обратимо (строку можно снова отметить снятой), а
 * лишний диалог на редком действии раздражает больше, чем защищает.
 */
export function RequeueButton({ id }: { id: string }) {
  return (
    <form action={requeuePublication}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-lg border border-fence px-2.5 py-1 text-[12px] text-mist transition hover:border-gold/50 hover:text-gold"
      >
        <Undo2 size={13} strokeWidth={1.75} /> Вернуть в очередь
      </button>
    </form>
  );
}
