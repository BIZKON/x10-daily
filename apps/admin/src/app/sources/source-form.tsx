"use client";

import { Field, SelectInput, TextArea, TextInput } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { SOURCE_FORM_IDLE, type SourceFormState } from "./form-state";

const KIND_OPTIONS = [
  { value: "rss", label: "Сайт или блог (RSS)" },
  { value: "youtube", label: "YouTube-канал" },
  { value: "github", label: "Релизы проекта на GitHub" },
  { value: "reddit", label: "Раздел Reddit" },
] as const;

const TIER_OPTIONS = [
  { value: "primary", label: "Основной — читаем в первую очередь" },
  { value: "secondary", label: "Дополнительный — обычный вес" },
  { value: "fringe", label: "Фоновый — берём редко" },
] as const;

const INTERVAL_OPTIONS = [
  { value: "900", label: "Каждые 15 минут" },
  { value: "1800", label: "Каждые 30 минут" },
  { value: "3600", label: "Раз в час" },
  { value: "21600", label: "4 раза в сутки" },
  { value: "86400", label: "Раз в сутки" },
] as const;

const LOCALE_OPTIONS = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "Английский" },
] as const;

export function SourceForm({
  action,
}: {
  action: (prev: SourceFormState, form: FormData) => Promise<SourceFormState>;
}) {
  const [state, formAction] = useActionState(action, SOURCE_FORM_IDLE);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Название"
          required
          help="Как источник подписан в списке и в служебных пометках. Пишите понятно для себя: «Хабр · Искусственный интеллект», а не «feed-1»."
        >
          <TextInput name="name" required maxLength={128} placeholder="Хабр · ИИ" />
        </Field>
        <Field
          label="Тип"
          required
          help="Определяет, как забирать ленту. Для YouTube и GitHub адрес выглядит иначе, чем обычный RSS — подсказки в поле адреса."
        >
          <SelectInput name="adapterType" defaultValue="rss" options={KIND_OPTIONS} required />
        </Field>
      </div>

      <Field
        label="Адрес ленты"
        required
        hint="Полный адрес, начиная с https://"
        help={
          <>
            Ссылка на <b>ленту</b>, а не на главную страницу сайта. Примеры:
            <br />• сайт — <code>https://habr.com/ru/rss/hub/artificial_intelligence/all/</code>
            <br />• YouTube — <code>https://www.youtube.com/feeds/videos.xml?channel_id=UC…</code>
            <br />• GitHub — <code>https://github.com/владелец/проект/releases.atom</code>
            <br />
            <br />
            Адрес проверяется сразу после добавления. Если лента не читается или пуста, источник не
            включится и вы увидите причину — менять адрес у существующего источника нельзя, заведите
            заново.
          </>
        }
      >
        <TextInput name="url" type="url" required placeholder="https://example.ru/rss" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Насколько важен"
          help="Влияет на приоритет материалов из этого источника в конвейере. Сомневаетесь — оставьте «Дополнительный»."
        >
          <SelectInput name="tier" defaultValue="secondary" options={TIER_OPTIONS} />
        </Field>
        <Field
          label="Как часто проверять"
          help="Как часто ходить за новыми записями. Чаще — быстрее реакция, но больше нагрузки на чужой сайт. Для новостных лент хватает 15 минут, для блогов и релизов — раза в час."
        >
          <SelectInput name="pollIntervalSec" defaultValue="900" options={INTERVAL_OPTIONS} />
        </Field>
        <Field
          label="Язык"
          help="На каком языке пишет источник. Публикации всё равно выходят по-русски — иноязычные материалы конвейер переводит и пересказывает."
        >
          <SelectInput name="locale" defaultValue="ru" options={LOCALE_OPTIONS} />
        </Field>
      </div>

      <Field
        label="Заметка"
        help="Для себя и коллег: почему этот источник в списке и чего от него ждать. Нигде читателю не показывается. Можно оставить пустым."
      >
        <TextArea name="notes" rows={2} placeholder="Например: практика внедрения ИИ в рознице" />
      </Field>

      {state.status === "error" && (
        <div className="rounded-lg border border-red/40 bg-red/[0.06] px-3 py-2 text-[13px] text-red">
          {state.message}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-fence pt-4">
        {state.status === "checking" && (
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-gold">
            <Loader2 size={14} strokeWidth={2.5} className="animate-spin" />
            Добавлен, проверяем ленту
          </span>
        )}
        <SubmitButton label="Добавить источник" pendingLabel="Добавляем…" />
      </div>
    </form>
  );
}
