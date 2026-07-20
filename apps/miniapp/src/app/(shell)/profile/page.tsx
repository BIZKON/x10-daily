import { PreferenceToggles } from "@/components/profile/preference-toggles";
import { TopBar } from "@/components/top-bar";
import { PROFILE_MENU } from "@/lib/feed";
import {
  type ProfileStatIcon,
  type ProfileStatTone,
  loadPreferences,
  loadProfileIdentity,
  loadProfileSnapshot,
} from "@/lib/profile";
import { cn } from "@x10/ui";
import { Book, Bookmark, ChevronRight, Crown, Flame, Headphones, Settings } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

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

export default function ProfilePage() {
  return (
    <>
      <TopBar title="Профиль" />

      <Suspense fallback={<HeaderSkeleton />}>
        <ProfileHeader />
      </Suspense>

      <Suspense fallback={<StatsSkeleton />}>
        <StatsAndStreak />
      </Suspense>

      <Suspense fallback={<PrefsSkeleton />}>
        <PreferencesSection />
      </Suspense>

      <section className="flex flex-col gap-2 p-4 pt-6">
        {PROFILE_MENU.map((m) => {
          const Icon = menuIconMap[m.icon];
          const cls =
            "flex w-full items-center justify-between rounded-xl border border-fence bg-card px-4 py-3 text-left text-[13.5px]";
          const inner = (
            <>
              <span className="flex items-center gap-3">
                <Icon size={16} strokeWidth={1.75} className="text-mist" />
                {m.title}
              </span>
              <ChevronRight size={16} strokeWidth={1.75} className="text-haze" />
            </>
          );
          // Пункт с href ведёт на готовый экран (внешний https:// — обычный <a>,
          // в TG webview откроется наружу); остальные — пока заглушки.
          if (m.href?.startsWith("https://")) {
            return (
              <a
                key={m.title}
                href={m.href}
                target="_blank"
                rel="noopener noreferrer"
                className={cls}
              >
                {inner}
              </a>
            );
          }
          return m.href ? (
            <Link key={m.title} href={m.href} className={cls}>
              {inner}
            </Link>
          ) : (
            <button key={m.title} type="button" className={cls}>
              {inner}
            </button>
          );
        })}
      </section>
    </>
  );
}

/**
 * Шапка профиля — реальная identity авторизованного юзера (PPR-дыра:
 * connection() в Suspense, как StatsAndStreak). Гость (вне TG / до auth) →
 * честный «Гость», НЕ выдуманный «Алексей Петров».
 */
async function ProfileHeader() {
  await connection();
  const id = await loadProfileIdentity();

  return (
    <section className="relative mx-4 mt-3 overflow-hidden rounded-[20px] border border-fence p-5 [background:linear-gradient(135deg,var(--color-steel),var(--color-night))]">
      <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-red/[0.05]" />
      <div className="relative flex items-center gap-4">
        {id.avatarUrl ? (
          <Image
            src={id.avatarUrl}
            alt=""
            width={64}
            height={64}
            className="h-16 w-16 rounded-full object-cover"
            unoptimized
          />
        ) : (
          <div className="grid h-16 w-16 place-items-center rounded-full font-display text-[26px] font-extrabold text-white [background:linear-gradient(135deg,var(--color-red),var(--color-gold))]">
            {id.initial}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="m-0 truncate font-display text-xl font-extrabold">{id.name}</h2>
          <p className="m-0 mt-0.5 truncate text-[12.5px] text-mist">
            {id.handle ?? (id.authed ? "Клиент ProAgent AI" : "Войдите через Telegram")}
          </p>
        </div>
      </div>
      {/* Лид-CTA (Р9): вместо paywall — прямой диалог о внедрении ИИ-агентов. */}
      <a
        href="https://t.me/Sekretar_Syrov_IP_bot"
        target="_blank"
        rel="noopener noreferrer"
        className="relative mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-gold/50 bg-gold/[0.08] py-3 font-display text-[13.5px] font-semibold text-gold"
      >
        <Crown size={16} strokeWidth={1.75} /> Обсудить внедрение
      </a>
    </section>
  );
}

function HeaderSkeleton() {
  return (
    <section
      aria-busy="true"
      className="mx-4 mt-3 rounded-[20px] border border-fence p-5 [background:linear-gradient(135deg,var(--color-steel),var(--color-night))]"
    >
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 animate-pulse rounded-full bg-white/10" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-40 animate-pulse rounded bg-white/10" />
          <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
        </div>
      </div>
      <div className="mt-4 h-11 w-full animate-pulse rounded-xl bg-white/10" />
    </section>
  );
}

/**
 * Реальные настройки (подписки+расписание) из API в PPR-дыре. key по серверному
 * состоянию → после авто-логина (router.refresh) PreferenceToggles подхватит
 * настройки юзера (иначе useState(initial) застрял бы на дефолте гостя).
 */
async function PreferencesSection() {
  await connection();
  const prefs = await loadPreferences();
  const key = `${prefs.subscribedCategories.join(",")}|${JSON.stringify(prefs.digestSchedule)}`;
  return <PreferenceToggles key={key} initial={prefs} />;
}

function PrefsSkeleton() {
  return (
    <section className="px-4 pt-6" aria-busy="true">
      <div className="mb-2.5 h-4 w-28 animate-pulse rounded bg-fence" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl border border-fence bg-card" />
        ))}
      </div>
    </section>
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
