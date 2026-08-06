import type { Metadata } from "next";
import "./globals.css";
import { DemoBanner } from "@/components/demo-banner";
import { Sidebar } from "@/components/sidebar";
import { fetchMyRole } from "@/lib/api";
import { fontDisplay, fontMono, fontSans } from "@/lib/fonts";
import { connection } from "next/server";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "ProAgent AI Admin — HumanGate",
  description: "Очередь к публикации, scorecard, утверждение редколлегии.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className={`${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable}`}>
      <body className="min-h-dvh">
        {/* На телефоне меню становится шапкой сверху, поэтому колонка → строка
            только с md. Без этого колонка в 240 px съедала две трети экрана. */}
        <div className="flex min-h-dvh flex-col md:flex-row">
          {/* Cache Components (Next 16): Sidebar — 'use client' + usePathname()
              → dynamic URL-access → ДОЛЖЕН быть в <Suspense>, иначе prerender
              падает «Uncached data outside of Suspense». Placeholder того же
              размера (w-60), чтобы не было layout shift. Покрывает все страницы. */}
          <Suspense
            fallback={
              <aside className="hidden w-60 shrink-0 border-r border-fence bg-card md:block" />
            }
          >
            <SidebarWithRole />
          </Suspense>
          <main className="flex-1 overflow-x-hidden">
            <DemoBanner />
            <div className="mx-auto max-w-[1280px] px-4 py-4 md:px-8 md:py-6">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}

/**
 * Меню знает роль вошедшего и показывает только доступные разделы (Спека 5).
 *
 * Роль тянется здесь, внутри Suspense: это обращение к api по сессии, то есть
 * динамика. Вынести её на уровень раскладки нельзя — Next запечёт результат в
 * статику, и все увидят меню того, кто собрал билд.
 *
 * Нет сессии → роль null → показываем только «Очередь»… а точнее ничего, что
 * требует прав. Страница входа рисуется поверх, так что пустое меню видно
 * доли секунды.
 */
async function SidebarWithRole() {
  // 🔴 PPR-грабля (CLAUDE.md §8) в новой форме. `fetchMyRole` на билде вернёт
  // null, НЕ трогая cookies: X10_API_BASE_URL не задан, getJson выходит раньше.
  // Динамической дыры не возникает, и страницы без собственной динамики
  // (/rubrics, /authors/new, /events/new, /digests/new) запекаются целиком —
  // вместе с меню, посчитанным для роли null, то есть ПУСТЫМ. Навсегда.
  // Проверено: без этой строки они собираются как `○ Static` и в .meta нет
  // ключа `postponed`.
  await connection();
  const role = await fetchMyRole();
  return <Sidebar role={role} />;
}
