import { cn } from "@x10/ui";
import {
  Bell,
  Book,
  Bookmark,
  ChevronRight,
  Crown,
  Flame,
  Headphones,
  MapPin,
  Settings,
} from "lucide-react";
import { Suspense } from "react";
import { TopBar } from "@/components/top-bar";
import { PROFILE, PROFILE_MENU, SCHEDULE, SUBSCRIPTIONS } from "@/lib/feed";
import { loadProfileSnapshot, type ProfileStatIcon, type ProfileStatTone } from "@/lib/profile";

const statIconMap: Record<ProfileStatIcon, typeof Flame> = {
  flame: Flame,
  book: Book,
  bookmark: Bookmark,
  crown: Crown,
};

const statToneClass: Record<ProfileStatTone, string> = {
  red: "text-red",
  gold: "text-gold",
  success: "text-success",
};

const menuIconMap = {
  bookmark: Bookmark,
  book: Book,
  headphones: Headphones,
  crown: Crown,
  settings: Settings,
} as const;

function Toggle({ on }: { on: boolean }) {
  return (
    <div
      className={cn("relative h-6 w-10 rounded-pill transition-colors", on ? "bg-red" : "bg-fence")}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
          on ? "right-0.5" : "left-0.5",
        )}
      />
    </div>
  );
}

export default function ProfilePage() {
  return (
    <>
      <TopBar title="Профиль" />

      <section className="relative mx-4 mt-3 overflow-hidden rounded-[20px] border border-fence p-5 [background:linear-gradient(135deg,var(--color-steel),var(--color-night))]">
        <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-red/[0.05]" />
        <div className="relative flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-full font-display text-[26px] font-extrabold text-white [background:linear-gradient(135deg,var(--color-red),var(--color-gold))]">
            {PROFILE.avatarInitial}
          </div>
          <div>
            <h2 className="m-0 font-display text-xl font-extrabold">{PROFILE.name}</h2>
            <p className="m-0 mt-0.5 flex items-center gap-1.5 text-[12.5px] text-mist">
              <span className="rounded bg-red/20 px-2 py-0.5 text-[10px] font-bold text-red">
                {PROFILE.role}
              </span>
              <MapPin size={12} strokeWidth={1.75} /> {PROFILE.city}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="relative mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-gold/50 bg-gold/[0.08] py-3 font-display text-[13.5px] font-semibold text-gold"
        >
          <Crown size={16} strokeWidth={1.75} /> Активировать Х10 Premium · 1 500 ₽/мес
        </button>
      </section>

      <Suspense fallback={<StatsSkeleton />}>
        <StatsAndStreak />
      </Suspense>

      <section className="px-4 pt-6">
        <h3 className="m-0 mb-2.5 font-display text-[15px] font-extrabold">Мои подписки</h3>
        <div className="flex flex-col gap-2">
          {SUBSCRIPTIONS.map((s) => (
            <div
              key={s}
              className="flex items-center justify-between rounded-xl border border-fence bg-card px-4 py-3"
            >
              <span className="text-[13.5px]">{s}</span>
              <Toggle on />
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 pt-6">
        <h3 className="m-0 mb-2.5 flex items-center gap-2 font-display text-[15px] font-extrabold">
          <Bell size={16} strokeWidth={1.75} /> Дайджест-расписание
        </h3>
        <div className="overflow-hidden rounded-xl border border-fence bg-card">
          {SCHEDULE.map((r, i) => (
            <div
              key={r.time}
              className={cn(
                "flex items-center justify-between px-4 py-3",
                i > 0 && "border-t border-fence",
              )}
            >
              <div>
                <span className="x10-num text-[13px] font-bold text-gold">{r.time}</span>
                <span className="ml-3 text-[13px]">{r.name}</span>
              </div>
              <Toggle on={r.on} />
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2 p-4 pt-6">
        {PROFILE_MENU.map((m) => {
          const Icon = menuIconMap[m.icon];
          return (
            <button
              key={m.title}
              type="button"
              className="flex w-full items-center justify-between rounded-xl border border-fence bg-card px-4 py-3 text-left text-[13.5px]"
            >
              <span className="flex items-center gap-3">
                <Icon size={16} strokeWidth={1.75} className="text-mist" />
                {m.title}
              </span>
              <ChevronRight size={16} strokeWidth={1.75} className="text-haze" />
            </button>
          );
        })}
      </section>
    </>
  );
}

async function StatsAndStreak() {
  "use cache";
  const snapshot = await loadProfileSnapshot();
  const streakValue = snapshot.stats.find((s) => s.icon === "flame")?.k ?? "0";

  return (
    <>
      <section className="grid grid-cols-4 gap-2 p-4">
        {snapshot.stats.map((s) => {
          const Icon = statIconMap[s.icon];
          return (
            <div key={s.v} className="rounded-xl border border-fence bg-card p-3 text-center">
              <Icon
                size={16}
                strokeWidth={1.75}
                className={cn("mx-auto mb-1.5 block", statToneClass[s.tone])}
              />
              <div className="x10-num text-[15px] font-extrabold">{s.k}</div>
              <div className="mt-0.5 text-[9px] text-haze">{s.v}</div>
            </div>
          );
        })}
      </section>

      <section className="mx-4 rounded-2xl border border-fence bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame size={16} strokeWidth={1.75} className="text-red" />
            <span className="text-[13px] font-bold">Стрик чтения · {streakValue} дней</span>
          </div>
          <span className="text-[11px] text-mist">До ачивки: {snapshot.daysToAchievement}</span>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {snapshot.weekStreak.map((d, i) => (
            <div
              key={i}
              className={cn(
                "aspect-square place-items-center rounded-md text-[10px] font-bold grid",
                d.on ? "bg-red text-white" : "bg-fence text-haze",
              )}
            >
              {d.d}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function StatsSkeleton() {
  return (
    <>
      <section className="grid grid-cols-4 gap-2 p-4" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-fence bg-card p-3 text-center">
            <div className="mx-auto mb-1.5 h-4 w-4 animate-pulse rounded bg-fence" />
            <div className="mx-auto h-4 w-8 animate-pulse rounded bg-fence" />
            <div className="mx-auto mt-1 h-2 w-12 animate-pulse rounded bg-fence" />
          </div>
        ))}
      </section>
      <section className="mx-4 rounded-2xl border border-fence bg-card p-4" aria-busy="true">
        <div className="mb-3 h-4 w-40 animate-pulse rounded bg-fence" />
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-md bg-fence" />
          ))}
        </div>
      </section>
    </>
  );
}
