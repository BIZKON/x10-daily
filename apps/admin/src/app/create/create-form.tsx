"use client";

import type { CreationMode } from "@/lib/api";
import {
  FileSignature,
  FileText,
  GalleryHorizontalEnd,
  Image as ImageIcon,
  Loader2,
  Presentation,
  Video,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useActionState, useState } from "react";
import { createMaterial } from "./actions";
import { CREATE_FORM_IDLE } from "./form-state";

/**
 * Выбор режима и тема — то самое отличие ручного режима от чата.
 *
 * В чате человек стоит перед пустым полем и обязан описать задачу целиком.
 * Здесь «как делается правильно» лежит внутри режима, поэтому спрашиваем
 * только тему. Всё остальное на экране служит одному: чтобы человек понимал,
 * что именно система знает и возьмёт в работу.
 */

/**
 * Потолок темы. Дублирует `MAX_PROMPT` маршрутов api намеренно: здесь он —
 * подсказка человеку (счётчик и обрезка ввода), а настоящий гард стоит на
 * сервере и сверен тестом со схемой агента.
 */
const MAX_PROMPT = 2000;

/** Иконка по режиму. Неизвестный режим получает нейтральную — клиент вправе завести свой. */
const ICONS: Record<string, LucideIcon> = {
  post: FileText,
  carousel: GalleryHorizontalEnd,
  video: Video,
  cover: ImageIcon,
  deck: Presentation,
  doc: FileSignature,
};

export function CreateForm({
  modes,
  shelfTitles,
}: {
  modes: CreationMode[];
  shelfTitles: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(createMaterial, CREATE_FORM_IDLE);
  const available = modes.filter((m) => m.available);
  const [picked, setPicked] = useState(available[0]?.slug ?? "");
  const mode = modes.find((m) => m.slug === picked);

  return (
    <form action={action}>
      <input type="hidden" name="modeSlug" value={picked} />

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {modes.map((m) => (
          <ModeCard
            key={m.slug}
            mode={m}
            picked={m.slug === picked}
            onPick={() => m.available && setPicked(m.slug)}
          />
        ))}
      </div>

      {mode ? (
        <div className="mt-3 rounded-2xl border border-fence bg-card p-4 sm:p-5">
          <div className="mb-2.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-haze">
            О чём пишем — режим «{mode.title}»
          </div>

          <textarea
            name="prompt"
            rows={3}
            required
            maxLength={MAX_PROMPT}
            placeholder="Например: как мы сократили сверку остатков на складе с трёх часов до двадцати минут"
            className="w-full resize-y rounded-xl border border-fence bg-ink px-3.5 py-3 text-[14px] leading-relaxed text-paper outline-none placeholder:text-haze focus-visible:border-gold"
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 max-w-[520px] text-[12px] leading-relaxed text-haze">
              <Knowledge slugs={mode.shelfSlugs} titles={shelfTitles} />
            </p>

            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-red px-5 py-2.5 text-[13.5px] font-bold text-white transition-opacity disabled:opacity-60"
            >
              {pending && <Loader2 size={14} className="animate-spin" />}
              {pending ? "Создаём" : "Создать"}
            </button>
          </div>

          {state.status !== "idle" && (
            <p
              className={`m-0 mt-3 text-[13px] ${state.status === "ok" ? "text-success" : "text-red"}`}
              role="status"
            >
              {state.message}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 rounded-2xl border border-fence bg-card p-5 text-[13.5px] text-mist">
          Ни один режим пока не готов к работе. Как только появится первый, поле темы откроется
          здесь.
        </p>
      )}
    </form>
  );
}

/**
 * Что уйдёт в работу из базы знаний.
 *
 * Это не украшение: клиент должен видеть, что прайс не попадает в публичный
 * пост. Иначе он либо не доверит системе цены вовсе, либо узнает об этом из
 * готового материала — то есть слишком поздно.
 */
function Knowledge({ slugs, titles }: { slugs: string[]; titles: Record<string, string> }) {
  if (slugs.length === 0) {
    return <>В работу пойдёт вся база знаний — режим не ограничивает полки.</>;
  }
  // Неизвестный слаг показываем как есть: полку могли переименовать, и молча
  // выбросить её из списка значит соврать о том, что уходит в работу.
  const names = slugs.map((s) => titles[s] ?? s);
  return (
    <>
      Система возьмёт из базы знаний: <span className="text-mist">{names.join(" · ")}</span>. Того,
      чего там нет, в материале не появится.
    </>
  );
}

function ModeCard({
  mode,
  picked,
  onPick,
}: {
  mode: CreationMode;
  picked: boolean;
  onPick: () => void;
}) {
  const Icon = ICONS[mode.slug] ?? FileText;

  /**
   * Недоступный режим ВИДЕН и честно помечен. Из шести обещанных сегодня
   * работает один: показать одну кнопку значило бы промолчать об остальных,
   * а сделать шесть одинаковых — обмануть.
   */
  if (!mode.available) {
    return (
      <div
        className="relative cursor-not-allowed rounded-2xl border border-fence bg-card p-4 opacity-55"
        aria-disabled="true"
      >
        <span className="absolute right-3 top-3 rounded-full border border-gold/40 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.05em] text-gold">
          готовится
        </span>
        <div className="mb-2.5 grid h-8 w-8 place-items-center rounded-lg bg-fence">
          <Icon size={16} strokeWidth={1.5} className="text-mist" />
        </div>
        <h3 className="m-0 mb-0.5 font-display text-[14.5px] font-extrabold">{mode.title}</h3>
        {mode.subtitle && <p className="m-0 mb-2 text-[11.5px] text-haze">{mode.subtitle}</p>}
        <p className="m-0 text-[11.5px] leading-relaxed text-mist">{mode.purpose}</p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={picked}
      className={`rounded-2xl border bg-card p-4 text-left transition-colors ${
        picked ? "border-red ring-1 ring-red" : "border-fence hover:border-mist/40"
      }`}
    >
      <div className="mb-2.5 grid h-8 w-8 place-items-center rounded-lg bg-red/15">
        <Icon size={16} strokeWidth={1.5} className="text-red" />
      </div>
      <h3 className="m-0 mb-0.5 font-display text-[14.5px] font-extrabold">{mode.title}</h3>
      {mode.subtitle && <p className="m-0 mb-2 text-[11.5px] text-haze">{mode.subtitle}</p>}
      <p className="m-0 text-[11.5px] leading-relaxed text-mist">{mode.purpose}</p>
    </button>
  );
}
