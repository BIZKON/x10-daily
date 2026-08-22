"use client";

import { type Permission, type TeamRole, can } from "@x10/config";
import {
  BookOpen,
  Calendar,
  CalendarDays,
  Cpu,
  FileCheck2,
  HandCoins,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Menu,
  Mic,
  Power,
  Rss,
  Share2,
  ShoppingBag,
  Sparkles,
  Users,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Admin sidebar — boсковая навигация с активной подсветкой.
 * Client component, потому что usePathname нужен для active state.
 */
/**
 * Меню описано данными: у каждого пункта своё право. Разметка вразнобой
 * («если роль editor…») неизбежно разъедется с картой прав — а разъехавшееся
 * меню показывает клиенту раздел, который тут же отдаст ему отказ.
 *
 * ⚠️ Скрытый пункт — НЕ защита. Право проверяет api на каждом запросе; здесь
 * мы лишь не предлагаем то, что заведомо не сработает.
 */
const SECTIONS: Array<{
  label: string | null;
  items: Array<{
    href: string;
    label: string;
    icon: LucideIcon;
    permission: Permission;
  }>;
}> = [
  {
    label: null,
    items: [{ href: "/", label: "Очередь", icon: FileCheck2, permission: "content.view" }],
  },
  {
    label: "Контент",
    items: [
      // Ручной режим — ядро тарифа за 120 тысяч. Право на правку, а не на
      // просмотр: создание тратит деньги клиента, и наблюдателю это не по роли.
      { href: "/create", label: "Создать", icon: Sparkles, permission: "content.edit" },
      // Разделы-заготовки: обещаны клиенту в коммерческом предложении, поэтому
      // видны в меню и объясняют себя сами. Права те же, что у соседей по
      // смыслу, — когда появится содержимое, менять их не придётся.
      { href: "/plan", label: "Контент-план", icon: CalendarDays, permission: "content.view" },
      { href: "/formats", label: "Форматы", icon: LayoutGrid, permission: "settings.manage" },
      { href: "/authors", label: "Авторы", icon: Users, permission: "catalog.manage" },
      { href: "/events", label: "События", icon: Calendar, permission: "catalog.manage" },
      { href: "/digests", label: "Дайджесты", icon: Mic, permission: "catalog.manage" },
      // Обложки — часть выпуска наружу, поэтому право на публикацию.
      { href: "/visuals", label: "Обложки", icon: ImageIcon, permission: "content.publish" },
    ],
  },
  {
    label: "Настройки",
    items: [
      // База знаний — то, с чего начинается настройка копии: пока полки пусты,
      // система пишет общими словами. Право как у источников и рубрик: это
      // справочник клиента, а не выпуск наружу.
      { href: "/knowledge", label: "База знаний", icon: BookOpen, permission: "catalog.manage" },
      { href: "/team", label: "Команда", icon: UsersRound, permission: "team.manage" },
      // Заказы выше партнёров: продажа первична, партнёр — способ её сделать.
      { href: "/orders", label: "Заказы", icon: ShoppingBag, permission: "partners.manage" },
      { href: "/partners", label: "Партнёры", icon: HandCoins, permission: "partners.manage" },
      { href: "/channels", label: "Каналы", icon: Share2, permission: "settings.manage" },
      { href: "/sources", label: "Источники", icon: Rss, permission: "catalog.manage" },
      { href: "/rubrics", label: "Рубрики", icon: Layers, permission: "catalog.manage" },
      {
        href: "/pipeline-config",
        label: "Конвейер",
        icon: Cpu,
        permission: "settings.manage",
      },
      { href: "/cost", label: "Расходы", icon: Wallet, permission: "content.view" },
      { href: "/posting", label: "Постинг", icon: Power, permission: "settings.manage" },
    ],
  },
];

/**
 * Экраны ДО входа: там меню не нужно и вредно. На телефоне колонка в 240 px
 * съедала две трети ширины, карточка входа сжималась до ~135 px, и кнопка
 * Telegram уезжала за край — нажать её было физически нельзя.
 */
const PRE_AUTH = new Set(["/login", "/join"]);

export function Sidebar({ role }: { role: TeamRole | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  // Навигация закрывает выдвижную панель: без этого после перехода она остаётся
  // висеть поверх новой страницы.
  // biome-ignore lint/correctness/useExhaustiveDependencies: закрываем именно на смену маршрута
  useEffect(() => setOpen(false), [pathname]);

  if (PRE_AUTH.has(pathname)) return null;

  const nav = (
    <nav className="flex-1 px-3 py-4">
      {SECTIONS.map((section) => {
        const visible = section.items.filter((i) => can(role, i.permission));
        if (visible.length === 0) return null;
        return (
          <div key={section.label ?? "root"}>
            {section.label && <NavSection label={section.label} />}
            {visible.map((i) => (
              <NavItem
                key={i.href}
                href={i.href}
                label={i.label}
                icon={i.icon}
                active={isActive(i.href)}
              />
            ))}
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Телефон: шапка с кнопкой меню. Колонка на такой ширине не помещается. */}
      <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-fence bg-card px-4 py-3 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Открыть меню"
          className="grid h-9 w-9 place-items-center rounded-lg border border-fence text-mist"
        >
          <Menu size={18} strokeWidth={2} />
        </button>
        <Logo />
      </div>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Закрыть меню"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-night/70"
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col overflow-y-auto border-r border-fence bg-card">
            <div className="flex items-center justify-between border-b border-fence px-5 py-4">
              <Logo />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Закрыть меню"
                className="grid h-8 w-8 place-items-center rounded-lg border border-fence text-mist"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      {/* Десктоп: постоянная колонка, как было. */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-fence bg-card md:flex">
        <div className="border-b border-fence px-5 py-5">
          <Logo />
        </div>
        {nav}
      </aside>
    </>
  );
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-red font-display text-[13px] font-extrabold text-white">
        PA
      </span>
      <span className="font-display text-[15px] font-extrabold">Кабинет ProAgent AI</span>
    </Link>
  );
}

function NavSection({ label }: { label: string }) {
  return (
    <div className="mb-2 mt-5 px-2 text-[10px] font-extrabold uppercase tracking-[0.15em] text-haze">
      {label}
    </div>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  disabled,
}: {
  href: string;
  label: string;
  icon?: typeof FileCheck2;
  active?: boolean;
  disabled?: boolean;
}) {
  const base = "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium";
  if (disabled) {
    return (
      <span className={`${base} cursor-not-allowed text-haze opacity-60`}>
        {Icon && <Icon size={14} strokeWidth={1.75} />} {label}
      </span>
    );
  }
  if (active) {
    return (
      <Link href={href} className={`${base} bg-red/15 text-paper`}>
        {Icon && <Icon size={14} strokeWidth={1.75} className="text-red" />} {label}
      </Link>
    );
  }
  return (
    <Link href={href} className={`${base} text-mist hover:bg-fence/40 hover:text-paper`}>
      {Icon && <Icon size={14} strokeWidth={1.75} />} {label}
    </Link>
  );
}
