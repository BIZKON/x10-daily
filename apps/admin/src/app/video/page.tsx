import { CheckCircle2, Circle, ExternalLink, PlaySquare, Video } from "lucide-react";

export const metadata = { title: "Видео — X10 Admin" };

/**
 * Видео в Х10 (brief §2 + §12 «не делаем встроенную видеоплатформу — embed YouTube/RuTube»).
 *
 * На M0 — видео живёт в miniapp /video табе на статичных моках.
 * Planned: M4-M5 — IngestAgent подключится к YouTube API канала Рыбакова,
 * Whisper-транскрипция, потом DraftAgent делает rybakov.podcast выжимку.
 *
 * Эта страница — roadmap-обзор. Когда появится `media_items` table в schema —
 * здесь будет CRUD.
 */

type Milestone = {
  done: boolean;
  label: string;
  hint: string;
};

const ROADMAP: Milestone[] = [
  {
    done: true,
    label: "miniapp /video табе с моками",
    hint: "Карточки видео + Podcast of week (статичные)",
  },
  {
    done: false,
    label: "Schema: media_items table",
    hint: "type=video|podcast|live, source=youtube|rutube, embedId, duration, transcript",
  },
  {
    done: false,
    label: "YouTube API integration",
    hint: "Парсер канала Рыбакова, добавление новых видео в media_items за 4 часа",
  },
  {
    done: false,
    label: "Whisper-транскрипция",
    hint: "Self-hosted Whisper или Yandex SpeechKit для русского",
  },
  {
    done: false,
    label: "Pipeline: video → rybakov.podcast",
    hint: "DraftAgent делает выжимку 800-2000 слов из транскрипции",
  },
  {
    done: false,
    label: "Admin CRUD: списки + порядок в /video табе",
    hint: "Pinned видео, скрытие, переупорядочивание",
  },
];

export default function VideoPage() {
  return (
    <>
      <header className="mb-6 border-b border-fence pb-5">
        <h1 className="m-0 flex items-center gap-2 font-display text-2xl font-extrabold">
          <Video size={22} strokeWidth={1.75} /> Видео
        </h1>
        <p className="mt-1.5 text-[13px] text-mist">
          Brief §12: «не делаем встроенную видеоплатформу — embed YouTube/RuTube». На M0 видео —
          статичные карточки в miniapp /video. CRUD появится в M4-M5 вместе с IngestAgent для
          YouTube.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <article className="lg:col-span-2 rounded-2xl border border-fence bg-card p-5">
          <h2 className="m-0 mb-3 font-display text-lg font-extrabold">Roadmap до полного CRUD</h2>
          <ol className="m-0 list-none space-y-3 p-0">
            {ROADMAP.map((m) => (
              <li key={m.label} className="flex items-start gap-3">
                {m.done ? (
                  <CheckCircle2
                    size={18}
                    strokeWidth={2}
                    className="mt-0.5 shrink-0 text-success"
                  />
                ) : (
                  <Circle size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-haze" />
                )}
                <div>
                  <div
                    className={`font-display text-[14px] font-bold ${m.done ? "text-paper" : "text-mist"}`}
                  >
                    {m.label}
                  </div>
                  <div className="mt-0.5 text-[12px] text-haze">{m.hint}</div>
                </div>
              </li>
            ))}
          </ol>
        </article>

        <aside className="rounded-2xl border border-red/40 bg-red/[0.04] p-5">
          <h3 className="m-0 mb-2 flex items-center gap-2 font-display text-[13px] font-extrabold uppercase tracking-[0.15em] text-red">
            <PlaySquare size={14} strokeWidth={2} /> Канал Рыбакова
          </h3>
          <p className="m-0 text-[13px] text-mist">
            Источник №1 для rybakov.podcast и rybakov.essay. ~6M подписчиков на YouTube. Эфиры
            еженедельно.
          </p>
          <a
            href="https://www.youtube.com/@rybakovigor"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-red hover:text-paper"
          >
            youtube.com/@rybakovigor <ExternalLink size={11} strokeWidth={2} />
          </a>
        </aside>
      </div>

      <div className="mt-6 rounded-xl border border-fence bg-card p-4 text-[12.5px] text-mist">
        <p className="m-0">
          Текущее: видео-карточки на моках в{" "}
          <code className="font-mono text-paper">apps/miniapp/src/lib/feed.ts</code> (VIDEOS,
          PODCAST_OF_WEEK). M2-M5 roadmap — см.{" "}
          <code className="font-mono text-paper">docs/strategy/X10ContentArchitectureBrief.md</code>{" "}
          §10.
        </p>
      </div>
    </>
  );
}
