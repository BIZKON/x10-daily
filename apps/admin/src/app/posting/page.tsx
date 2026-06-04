import { type PostingControl, fetchPostingControl } from "@/lib/api";
import { CircleCheck, CirclePause, Power } from "lucide-react";
import { Suspense } from "react";
import { updatePostingControl } from "./actions";
import { PostingForm } from "./posting-form";

export const metadata = { title: "Постинг — X10 Admin" };

/**
 * Стоп-кран автопостинга (session 20): ручная пауза + тихие часы (МСК).
 * Гейтит ingest-rss (генерация) и post-to-tg (публикация) на лету.
 */
export default function PostingPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-card" />}>
      <PostingContent />
    </Suspense>
  );
}

async function PostingContent() {
  const ctrl = await fetchPostingControl();

  return (
    <>
      <header className="mb-6 border-b border-fence pb-5">
        <h1 className="m-0 flex items-center gap-2 font-display text-2xl font-extrabold">
          <Power size={22} strokeWidth={1.75} /> Постинг
        </h1>
        <p className="mt-1.5 text-[13px] text-mist">
          Стоп-кран автономного конвейера: ручная пауза и тихие часы (МСК). Эффект мгновенный —{" "}
          <code className="font-mono text-gold">ingest-rss</code> и{" "}
          <code className="font-mono text-gold">post-to-tg</code> читают это на каждом запуске.
        </p>
      </header>

      {!ctrl ? (
        <ApiUnavailable />
      ) : (
        <div className="space-y-5">
          <StatusBanner ctrl={ctrl} />
          <section className="rounded-2xl border border-fence bg-card p-5">
            <PostingForm action={updatePostingControl} defaults={ctrl} />
          </section>
        </div>
      )}
    </>
  );
}

function StatusBanner({ ctrl }: { ctrl: PostingControl }) {
  const reasonLabel =
    ctrl.pauseReason === "manual"
      ? "ручная пауза"
      : ctrl.pauseReason === "quiet-hours"
        ? "тихие часы"
        : null;
  const window = `${String(ctrl.quietStartHour).padStart(2, "0")}:00 → ${String(
    ctrl.quietEndHour,
  ).padStart(2, "0")}:00 МСК`;

  if (ctrl.currentlyPaused) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-red/40 bg-red/[0.06] p-5">
        <CirclePause size={22} strokeWidth={2} className="mt-0.5 shrink-0 text-red" />
        <div>
          <h2 className="m-0 font-display text-lg font-extrabold text-red">
            Постинг на паузе{reasonLabel ? ` — ${reasonLabel}` : ""}
          </h2>
          <p className="mt-1 text-[13px] text-mist">
            Сейчас {String(ctrl.mskHour).padStart(2, "0")}:00 МСК. Конвейер не генерирует и не
            постит. {ctrl.quietEnabled && <>Тихие часы: {window}.</>}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-success/40 bg-success/[0.06] p-5">
      <CircleCheck size={22} strokeWidth={2} className="mt-0.5 shrink-0 text-success" />
      <div>
        <h2 className="m-0 font-display text-lg font-extrabold text-success">Постинг активен</h2>
        <p className="mt-1 text-[13px] text-mist">
          Сейчас {String(ctrl.mskHour).padStart(2, "0")}:00 МСК. Конвейер работает.{" "}
          {ctrl.quietEnabled ? (
            <>Тихие часы: {window}.</>
          ) : (
            <>Тихие часы выключены — постинг круглосуточно.</>
          )}
        </p>
      </div>
    </div>
  );
}

function ApiUnavailable() {
  return (
    <div className="rounded-2xl border border-red/40 bg-red/5 p-6">
      <h2 className="m-0 font-display text-lg font-extrabold text-red">Данные недоступны</h2>
      <p className="mt-2 text-[14px] text-mist">
        Не задан <code className="font-mono text-paper">X10_API_BASE_URL</code>, api не отвечает,
        или сессия не установлена (войди через <code className="font-mono text-paper">/login</code>
        ).
      </p>
    </div>
  );
}
