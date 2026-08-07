import { AlertTriangle, OctagonAlert } from "lucide-react";

export type BillingBannerState = {
  state: "off" | "ok" | "low" | "empty";
  balanceRub: number | null;
  lowThresholdRub: number | null;
};

/**
 * Плашка про деньги на всех страницах кабинета (Спека 6, шаг 2).
 *
 * Отвечает на вопрос «почему ничего не готовится». Без неё остановка выглядит
 * поломкой: очередь пустеет, канал молчит, а причины на экране нет.
 *
 * Молчит в трёх случаях: денежный контур в этой копии выключен, денег достаточно
 * или ответа от сервера нет. Плашка, появляющаяся из-за сетевого сбоя, пугала бы
 * зря.
 *
 * Суммы приходят `null` тем, кому не дано смотреть деньги, — тогда говорим факт
 * без цифр. Отдельного «секретного» текста не пишем: причина одна и та же.
 */
export function BillingBanner({ data }: { data: BillingBannerState | null }) {
  if (!data || data.state === "off" || data.state === "ok") return null;

  const amount =
    data.balanceRub === null ? null : `${Math.round(data.balanceRub).toLocaleString("ru-RU")} ₽`;

  if (data.state === "empty") {
    return (
      <div className="flex items-start gap-2 border-b border-red/30 bg-red/[0.08] px-4 py-2.5 text-[12px] text-red md:px-8">
        <OctagonAlert size={14} strokeWidth={2} className="mt-px shrink-0" />
        <span>
          <strong>Баланс исчерпан{amount ? `: ${amount}` : ""}.</strong> Подготовка новых материалов
          остановлена. Уже одобренное выйдет по расписанию — оно оплачено. Пополнить можно в разделе
          «Расходы».
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 border-b border-gold/30 bg-gold/[0.08] px-4 py-2.5 text-[12px] text-gold md:px-8">
      <AlertTriangle size={14} strokeWidth={2} className="mt-px shrink-0" />
      <span>
        <strong>Баланс заканчивается{amount ? `: осталось ${amount}` : ""}.</strong> Когда остаток
        дойдёт до нуля, подготовка новых материалов остановится. Пополнить можно в разделе
        «Расходы».
      </span>
    </div>
  );
}
