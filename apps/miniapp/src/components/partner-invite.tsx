import { fetchPartnerProgram } from "@/lib/api";
import { ChevronRight, HandCoins } from "lucide-react";
import Link from "next/link";

/**
 * Приглашение в партнёрскую программу (спека 14.08).
 *
 * Один компонент на две точки входа: полосой в ленте и карточкой в профиле.
 * Текст один, потому что обещание должно быть одинаковым — разойдись они,
 * человек увидит два разных процента и не поверит ни одному.
 *
 * 🔴 Показывается только когда программа включена в этом экземпляре. Завод
 * продаётся клиентам копиями: у них нашей программы быть не должно, и
 * `fetchPartnerProgram` вернёт `null`.
 *
 * 🔴 Участнику показывается ВХОД В КАБИНЕТ, а не приглашение. Иначе человек,
 * вступив в программу, терял единственную ссылку на неё: приглашение исчезало,
 * а в меню профиля партнёрского пункта нет — кабинет открывался только по
 * прямому адресу, который никто не помнит. Поймано владельцем 16.08.
 *
 * ⚠️ Ошибка сети тоже даёт `null` — блок просто не появится. Это правильный
 * порядок: лучше не показать приглашение, чем показать его тому, кто уже
 * участвует.
 */
export async function PartnerInvite({ variant }: { variant: "feed" | "profile" }) {
  const info = await fetchPartnerProgram();
  if (!info) return null;

  const percent = info.program.partnerRatePercent;

  // Участник программы: вход в кабинет. В ленте не показываем — он туда ходит
  // читать, а не работать; полоса каждый день превращалась бы в шум.
  if (info.isPartner) {
    if (variant === "feed") return null;
    return (
      <Link
        href="/partner"
        className="flex items-center gap-3 rounded-2xl border border-success/25 bg-gradient-to-br from-success/12 to-gold/8 p-4"
      >
        <HandCoins size={20} strokeWidth={1.75} className="shrink-0 text-success" />
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[15px] font-extrabold text-paper">
            Партнёрский кабинет
          </span>
          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-haze">
            Ваша ссылка для клиентов, заказы и начисления
          </span>
        </span>
        <ChevronRight size={18} strokeWidth={1.75} className="shrink-0 text-white/30" />
      </Link>
    );
  }

  if (variant === "feed") {
    return (
      <Link
        href="/partner"
        className="flex items-center gap-3 rounded-[20px] border border-gold/30 bg-gradient-to-r from-gold/12 to-red/8 px-4 py-3.5"
      >
        <HandCoins size={20} strokeWidth={1.75} className="shrink-0 text-gold" />
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[14.5px] font-bold text-paper">
            Стать партнёром и зарабатывать на рекомендациях
          </span>
          <span className="mt-0.5 block text-[12.5px] text-haze">
            От {percent}% с каждой оплаты клиента, которого вы привели
          </span>
        </span>
      </Link>
    );
  }

  return (
    <Link
      href="/partner"
      className="block rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/12 to-red/8 p-4"
    >
      <span className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-gold">
        <HandCoins size={14} strokeWidth={2} /> Партнёрская программа
      </span>
      <span className="mt-1.5 block font-display text-[17px] font-extrabold leading-tight text-paper">
        Зарабатывайте от {percent}% на рекомендациях
      </span>
      <span className="mt-1 block text-[13px] leading-relaxed text-haze">
        Рекомендуете систему — получаете долю с каждой оплаты клиента. Участие бесплатное.
      </span>
    </Link>
  );
}
