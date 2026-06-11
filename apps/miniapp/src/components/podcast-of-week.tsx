import { PODCAST_OF_WEEK } from "@/lib/feed";
import { Play } from "lucide-react";

const BARS = 40;
const ACTIVE = Math.round(BARS * PODCAST_OF_WEEK.progress);

export function PodcastOfWeek() {
  return (
    <section className="mx-4 mb-5 rounded-[20px] border border-fence p-5 [background:linear-gradient(135deg,var(--color-steel),var(--color-night))]">
      <span className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-gold">
        ✦ Подкаст недели
      </span>
      <h3 className="m-0 mt-2 font-display text-xl font-extrabold leading-[1.2]">
        {PODCAST_OF_WEEK.title}
      </h3>
      <p className="m-0 mt-2 text-[12.5px] text-mist">
        {PODCAST_OF_WEEK.hosts} · {PODCAST_OF_WEEK.durationLabel}
      </p>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          aria-label="Слушать"
          className="grid h-12 w-12 place-items-center rounded-full bg-red"
        >
          <Play size={22} strokeWidth={2.5} fill="currentColor" className="ml-0.5 text-white" />
        </button>
        <div className="flex-1">
          <div className="flex h-7 items-end gap-0.5">
            {Array.from({ length: BARS }).map((_, i) => {
              const h = Math.round(20 + Math.abs(Math.sin(i * 0.5)) * 60 + ((i * 17) % 30));
              return (
                <div
                  key={i}
                  className={`flex-1 rounded-pill ${i < ACTIVE ? "bg-gold" : "bg-fence"}`}
                  style={{ height: `${h}%` }}
                />
              );
            })}
          </div>
          <div className="x10-num mt-1.5 flex justify-between text-[10px] text-haze">
            <span>{PODCAST_OF_WEEK.currentTime}</span>
            <span>{PODCAST_OF_WEEK.totalTime}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
