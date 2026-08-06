"use client";

import { type Permission, type TeamRole, can } from "@x10/config";
import {
  Calendar,
  Cpu,
  FileCheck2,
  Image as ImageIcon,
  Layers,
  Mic,
  Power,
  Rss,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
      { href: "/team", label: "Команда", icon: UsersRound, permission: "team.manage" },
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

export function Sidebar({ role }: { role: TeamRole | null }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-fence bg-card">
      <div className="border-b border-fence px-5 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-red font-display text-[13px] font-extrabold text-white">
            PA
          </span>
          <span className="font-display text-[15px] font-extrabold">ProAgent AI Admin</span>
        </Link>
      </div>

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

      <div className="border-t border-fence px-5 py-4 text-[11px] text-haze">
        MVP. Auth не подключён.
      </div>
    </aside>
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
