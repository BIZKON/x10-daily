import { ChevronRight, MapPin, MessageSquare, Users } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import {
  COMMUNITY_PATHS,
  COMMUNITY_STATS,
  EVENTS,
  MY_CLUMP,
} from "@/lib/feed";

const TONE_BG: Record<"red" | "gold" | "steel", string> = {
  red: "[background:linear-gradient(135deg,var(--color-red),var(--color-red-deep))]",
  gold: "[background:linear-gradient(135deg,var(--color-gold),#8E5E1B)]",
  steel: "[background:linear-gradient(135deg,var(--color-steel),var(--color-night))]",
};

const AVATAR_COLORS = ["#E63946", "#D4A24C", "#3FB950", "#1F2937", "#8E1B26"];

export default function CommunityPage() {
  const fmt = new Intl.NumberFormat("ru-RU");
  return (
    <>
      <TopBar title="Сообщество Х10" />

      <section className="px-5 py-3 pb-4">
        <div className="flex items-end justify-between">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-gold">
              ✦ Движение
            </span>
            <h1 className="m-0 mt-1 font-display text-[32px] font-extrabold leading-none">Х10</h1>
          </div>
          <div className="text-right">
            <div className="x10-num text-2xl font-extrabold">
              {fmt.format(COMMUNITY_STATS.members)}
            </div>
            <div className="text-[11px] text-haze">
              в {COMMUNITY_STATS.cities} городах · {COMMUNITY_STATS.countries} стран
            </div>
          </div>
        </div>
      </section>

      <section className="relative mx-5 mb-5 overflow-hidden rounded-[20px] border border-red/40 bg-card p-5">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-red/[0.06]" />
        <span className="relative text-[10px] font-extrabold uppercase tracking-[0.15em] text-red">
          Мой кламп
        </span>
        <h2 className="relative m-0 mt-2 font-display text-xl font-extrabold">{MY_CLUMP.name}</h2>
        <p className="relative m-0 mt-1.5 text-[12.5px] text-mist">🎯 {MY_CLUMP.goal}</p>

        <div className="relative mt-4 flex items-center gap-3">
          <div className="flex">
            {MY_CLUMP.avatars.map((l, i) => (
              <div
                key={l + i}
                className="-ml-2 grid h-8 w-8 place-items-center rounded-full border-2 border-card font-display text-[10px] font-bold text-white first:ml-0"
                style={{
                  background: `linear-gradient(135deg, ${AVATAR_COLORS[i % AVATAR_COLORS.length]}, var(--color-red))`,
                }}
              >
                {l}
              </div>
            ))}
          </div>
          <span className="text-[12px] text-mist">+{MY_CLUMP.extraCount} участника</span>
        </div>

        <div className="relative mt-4">
          <div className="mb-1.5 flex justify-between text-[11px] text-mist">
            <span>Прогресс цели</span>
            <span className="x10-num font-bold text-gold">{Math.round(MY_CLUMP.progress * 100)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-pill bg-fence">
            <div
              className="h-full rounded-pill [background:linear-gradient(to_right,var(--color-red),var(--color-gold))]"
              style={{ width: `${MY_CLUMP.progress * 100}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          className="relative mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-red py-3 font-display text-[13.5px] font-semibold text-white"
        >
          <MessageSquare size={16} strokeWidth={1.75} /> Открыть чат · {MY_CLUMP.nextMeet}
        </button>
      </section>

      <section className="mb-5 px-5">
        <div className="mb-3.5 flex items-center justify-between">
          <h3 className="m-0 font-display text-[19px] font-extrabold">События рядом</h3>
          <span className="flex items-center gap-1 text-[11px] text-mist">
            <MapPin size={12} strokeWidth={1.75} /> Краснодар
          </span>
        </div>
        <div className="flex flex-col gap-2.5">
          {EVENTS.map((e) => (
            <div
              key={e.title}
              className="flex items-center gap-3.5 rounded-xl border border-fence bg-card p-3.5 active:scale-[0.99]"
            >
              <div
                className={`flex h-14 w-14 flex-col items-center justify-center rounded-xl text-white ${TONE_BG[e.tone]}`}
              >
                <span className="text-[10px] uppercase opacity-70">{e.month}</span>
                <span className="font-display text-xl font-extrabold leading-tight">{e.date}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-gold">
                  {e.city}
                </div>
                <h4 className="m-0 mt-0.5 truncate font-display text-[14px] font-bold leading-[1.2]">
                  {e.title}
                </h4>
                <span className="mt-1 flex items-center gap-1 text-[11px] text-haze">
                  <Users size={12} strokeWidth={1.75} /> {e.attendees} участников
                </span>
              </div>
              <ChevronRight size={16} strokeWidth={1.75} className="text-haze" />
            </div>
          ))}
        </div>
      </section>

      <section className="px-5 pb-6">
        <h3 className="m-0 mb-3.5 font-display text-[19px] font-extrabold">Войти глубже</h3>
        <div className="grid grid-cols-2 gap-2.5">
          {COMMUNITY_PATHS.map((c) => (
            <button
              key={c.title}
              type="button"
              className="rounded-xl border border-fence bg-card p-4 text-left active:scale-[0.99]"
            >
              <div className="mb-2 text-xl">{c.icon}</div>
              <div className="font-display text-[13px] font-extrabold leading-[1.2]">{c.title}</div>
              <div className="mt-1 text-[11px] leading-[1.2] text-haze">{c.description}</div>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
