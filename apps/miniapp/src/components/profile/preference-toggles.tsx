"use client";

import type { ApiPreferences } from "@/lib/api";
import { updatePreferencesAction } from "@/lib/preferences-actions";
import { cn } from "@x10/ui";
import { Bell } from "lucide-react";
import { useState, useTransition } from "react";

/** Рубрикатор ProAgent AI (Р4) — синхронно с HOME_CATEGORIES (lib/feed.ts). */
const CATEGORIES: { key: string; label: string }[] = [
  { key: "news", label: "Новости ИИ" },
  { key: "cases", label: "Кейсы" },
  { key: "howto", label: "Обучение" },
  { key: "tools", label: "Инструменты" },
  { key: "business", label: "Практика" },
  { key: "founder", label: "От основателя" },
];

const SLOTS: { key: keyof ApiPreferences["digestSchedule"]; time: string; name: string }[] = [
  { key: "morning", time: "07:00", name: "Утренний разбор" },
  { key: "lunch", time: "13:00", name: "Smart-карусель за обедом" },
  { key: "evening", time: "19:00", name: "Вечерний разбор ИИ" },
];

function Toggle({ on, disabled }: { on: boolean; disabled?: boolean }) {
  return (
    <div
      className={cn(
        "relative h-6 w-10 rounded-pill transition-colors",
        on ? "bg-red" : "bg-fence",
        disabled && "opacity-60",
      )}
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

/**
 * Интерактивные тумблеры подписок + расписания (Tier-2). Оптимистично через
 * useState (persist между транзакциями) + server action; откат при ok=false.
 * initial — серверное состояние; компонент key-ится по нему в page.tsx, чтобы
 * после авто-логина (router.refresh) подхватить реальные настройки юзера.
 */
export function PreferenceToggles({ initial }: { initial: ApiPreferences }) {
  const [prefs, setPrefs] = useState<ApiPreferences>(initial);
  const [isPending, startTransition] = useTransition();

  function save(next: ApiPreferences) {
    // Сериализуем: пока сохраняется — тапы заблокированы (кнопки disabled).
    // Это убирает out-of-order гонку PATCH и потерю промежуточного изменения
    // при откате (каждый раз шлём полный набор). Save быстрый (~200мс).
    if (isPending) return;
    const prev = prefs;
    setPrefs(next); // оптимистично
    startTransition(async () => {
      const res = await updatePreferencesAction(next);
      if (!res.ok) setPrefs(prev); // откат (нет auth / api error)
    });
  }

  function toggleCategory(key: string) {
    const has = prefs.subscribedCategories.includes(key);
    const subscribedCategories = has
      ? prefs.subscribedCategories.filter((c) => c !== key)
      : [...prefs.subscribedCategories, key];
    save({ ...prefs, subscribedCategories });
  }

  function toggleSlot(key: keyof ApiPreferences["digestSchedule"]) {
    save({
      ...prefs,
      digestSchedule: { ...prefs.digestSchedule, [key]: !prefs.digestSchedule[key] },
    });
  }

  return (
    <>
      <section className="px-4 pt-6">
        <h3 className="m-0 mb-2.5 font-display text-[15px] font-extrabold">Мои подписки</h3>
        <div className="flex flex-col gap-2">
          {CATEGORIES.map((c) => {
            const on = prefs.subscribedCategories.includes(c.key);
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => toggleCategory(c.key)}
                disabled={isPending}
                className="flex items-center justify-between rounded-xl border border-fence bg-card px-4 py-3 text-left"
              >
                <span className="text-[13.5px]">{c.label}</span>
                <Toggle on={on} disabled={isPending} />
              </button>
            );
          })}
        </div>
      </section>

      <section className="px-4 pt-6">
        <h3 className="m-0 mb-2.5 flex items-center gap-2 font-display text-[15px] font-extrabold">
          <Bell size={16} strokeWidth={1.75} /> Дайджест-расписание
        </h3>
        <div className="overflow-hidden rounded-xl border border-fence bg-card">
          {SLOTS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onClick={() => toggleSlot(s.key)}
              disabled={isPending}
              className={cn(
                "flex w-full items-center justify-between px-4 py-3 text-left",
                i > 0 && "border-t border-fence",
              )}
            >
              <div>
                <span className="x10-num text-[13px] font-bold text-gold">{s.time}</span>
                <span className="ml-3 text-[13px]">{s.name}</span>
              </div>
              <Toggle on={prefs.digestSchedule[s.key]} disabled={isPending} />
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
