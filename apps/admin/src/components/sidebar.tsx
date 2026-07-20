"use client";

import { Calendar, Cpu, FileCheck2, Layers, Mic, Power, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Admin sidebar — boсковая навигация с активной подсветкой.
 * Client component, потому что usePathname нужен для active state.
 */
export function Sidebar() {
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
        <NavItem href="/" label="Очередь" icon={FileCheck2} active={isActive("/")} />

        <NavSection label="Контент" />
        <NavItem href="/authors" label="Авторы" icon={Users} active={isActive("/authors")} />
        <NavItem href="/events" label="События" icon={Calendar} active={isActive("/events")} />
        <NavItem href="/digests" label="Дайджесты" icon={Mic} active={isActive("/digests")} />

        <NavSection label="Настройки" />
        <NavItem href="/rubrics" label="Рубрики" icon={Layers} active={isActive("/rubrics")} />
        <NavItem
          href="/pipeline-config"
          label="Pipeline config"
          icon={Cpu}
          active={isActive("/pipeline-config")}
        />
        <NavItem href="/cost" label="Расходы" icon={Wallet} active={isActive("/cost")} />
        <NavItem href="/posting" label="Постинг" icon={Power} active={isActive("/posting")} />
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
