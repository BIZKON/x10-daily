import { PACKAGE_PRICES_RUB, partnerEarningRub } from "@x10/config";
import { Factory, HandCoins } from "lucide-react";
import Link from "next/link";

/**
 * Полоса кружков вверху ленты — как сторис (решение владельца 16.08).
 *
 * 🔴 Показываем ДЕНЬГИ, а не проценты. «20% с оплаты» человек не переводит в
 * рубли на ходу и листает дальше; «до 70 000 ₽ с клиента» — цифра, на которой
 * останавливаются. Считается от прайса функцией, поэтому правка цены
 * пересчитает витрину сама.
 *
 * Пульсирует ТОЛЬКО кружок партнёрства и только пока человек не вступил. Как
 * только он партнёр, кружок меняется на вход в кабинет и успокаивается:
 * мерцание в ленте, которую открывают каждый день, иначе за неделю становится
 * фоном, а потом раздражает.
 *
 * Серверный компонент: ссылки обычные, анимация на CSS. Полоса наверху ленты
 * не должна стоить ни килобайта клиентского кода.
 */

const rub = (v: number) => `${v.toLocaleString("ru-RU")} ₽`;

type Story = {
  id: string;
  href: string;
  /** Крупная строка внутри кружка: цифра сильнее слова. */
  value?: string;
  icon?: "coins" | "factory";
  label: string;
  /** Обводка кружка. */
  ring: string;
  pulse?: boolean;
};

export function StoriesBar({ isPartner }: { isPartner: boolean }) {
  const stories: Story[] = [
    // Партнёру предлагать «стать партнёром» бессмысленно — ведём в кабинет.
    isPartner
      ? {
          id: "cabinet",
          href: "/partner",
          icon: "coins",
          label: "Мой кабинет",
          ring: "from-success via-gold to-success",
        }
      : {
          id: "partner",
          href: "/partner",
          value: `до ${(partnerEarningRub() / 1000).toFixed(0)}К`,
          label: "Стать партнёром",
          ring: "from-gold via-red to-gold",
          pulse: true,
        },
    {
      id: "kp",
      href: "/kp/",
      icon: "factory",
      label: "Что за завод",
      ring: "from-red via-gold to-red",
    },
    {
      id: "price",
      href: "/kp/#price",
      value: `от ${(PACKAGE_PRICES_RUB.manual / 1000).toFixed(0)}К`,
      label: "Тарифы",
      ring: "from-white/40 via-white/15 to-white/40",
    },
  ];

  return (
    <nav
      aria-label="Быстрые ссылки"
      className="flex gap-3.5 overflow-x-auto px-4 pt-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {stories.map((s) => (
        <Link
          key={s.id}
          href={s.href}
          data-story={s.id}
          className="flex w-[76px] shrink-0 flex-col items-center gap-1.5"
        >
          <span
            className={`relative grid h-[68px] w-[68px] place-items-center rounded-full bg-gradient-to-br p-[2.5px] ${s.ring}`}
          >
            {/* Пульсирующее кольцо — отдельным слоем, чтобы не дёргать сам
                кружок: дрожащий контент читается как поломка, а не как акцент. */}
            {s.pulse && (
              <span className="animate-story-pulse pointer-events-none absolute inset-0 rounded-full border-2 border-gold" />
            )}
            <span className="grid h-full w-full place-items-center rounded-full bg-night">
              {s.value ? (
                <span className="font-mono text-[15px] font-extrabold leading-none text-paper">
                  {s.value}
                </span>
              ) : s.icon === "factory" ? (
                <Factory size={24} strokeWidth={1.75} className="text-paper" />
              ) : (
                <HandCoins size={24} strokeWidth={1.75} className="text-success" />
              )}
            </span>
          </span>
          <span className="text-center text-[11px] leading-tight text-mist">{s.label}</span>
        </Link>
      ))}
    </nav>
  );
}

/** Подпись под полосой: обещание словами, раз в кружок влезла только цифра. */
export function StoriesCaption({ isPartner }: { isPartner: boolean }) {
  if (isPartner) return null;
  return (
    <p className="m-0 px-4 pb-1 text-[11.5px] leading-snug text-haze">
      Рекомендуете систему — получаете {rub(partnerEarningRub())} с клиента на полном пакете.
      Участие бесплатное.
    </p>
  );
}
