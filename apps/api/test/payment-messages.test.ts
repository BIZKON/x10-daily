import { describe, expect, it } from "vitest";
import {
  type PaidNotice,
  mentorPaidMessage,
  ownerPaidMessage,
  ownerRefundMessage,
  partnerRefundMessage,
  sellerPaidMessage,
} from "../src/lib/payment-messages";

/**
 * Неразрывный пробел из toLocaleString → обычный.
 *
 * В сообщении он правильный: «175 000 ₽» не должно переноситься посреди суммы.
 * Проверяем содержание текста, а не байт пробела.
 */
const plain = (s: string) => s.replace(/\u00a0/g, " ");

const NOTICE: PaidNotice = {
  dealNo: 1042,
  clientName: "ООО «Ромашка»",
  paymentRub: 175000,
  paidTotalRub: 175000,
  amountRub: 350000,
  fullyPaid: false,
};

describe("сообщение продавцу", () => {
  it("называет клиента, платёж и его долю", () => {
    const m = plain(sellerPaidMessage(NOTICE, 35000));
    expect(m).toContain("№ 1042");
    expect(m).toContain("ООО «Ромашка»");
    expect(m).toContain("175 000 ₽");
    expect(m).toContain("35 000 ₽");
  });

  it("при неполной оплате говорит остаток и что напомнить — партнёру", () => {
    // Клиент общается с ним, а не с нами: напоминание — его работа.
    const m = plain(sellerPaidMessage(NOTICE, 35000));
    expect(m).toContain("Осталось 175 000 ₽");
    expect(m).toContain("напомните");
  });

  it("при полной оплате остатка не обещает", () => {
    const m = plain(sellerPaidMessage({ ...NOTICE, paidTotalRub: 350000, fullyPaid: true }, 35000));
    expect(m).toContain("оплачен полностью");
    expect(m).not.toContain("Осталось");
  });

  it("без начисления не выдумывает сумму", () => {
    // Заказ владельца без партнёра — начислять некому.
    const m = plain(sellerPaidMessage(NOTICE, 0));
    expect(m).not.toContain("начислено");
  });
});

describe("сообщение наставнику", () => {
  it("🔴 не раскрывает клиента приведённого партнёра", () => {
    // Наставник получает процент за то, что привёл и обучил продавца, а не за
    // доступ к его клиентской базе. То же правило действует в кабинете.
    const m = plain(mentorPaidMessage("Игорь Иванов", 8750));
    expect(m).toContain("Игорь Иванов");
    expect(m).toContain("8 750 ₽");
    expect(m).not.toContain("Ромашка");
    expect(m).not.toContain("1042");
  });
});

describe("сообщение владельцу", () => {
  it("показывает разбивку целиком", () => {
    const m = plain(
      ownerPaidMessage(NOTICE, {
        sellerName: "Игорь Иванов",
        sellerRub: 35000,
        mentorRub: 8750,
      }),
    );
    expect(m).toContain("№ 1042");
    expect(m).toContain("ООО «Ромашка»");
    expect(m).toContain("Игорь Иванов");
    expect(m).toContain("35 000 ₽");
    expect(m).toContain("8 750 ₽");
  });

  it("без партнёра строку о нём не печатает", () => {
    const m = plain(ownerPaidMessage(NOTICE, { sellerName: null, sellerRub: 0, mentorRub: 0 }));
    expect(m).not.toContain("Партнёр");
    expect(m).not.toContain("Наставник");
  });

  it("нулевую долю наставника не показывает", () => {
    // Строка «наставнику — 0 ₽» заставляет думать, что кому-то не доплатили.
    const m = plain(
      ownerPaidMessage(NOTICE, {
        sellerName: "Игорь Иванов",
        sellerRub: 35000,
        mentorRub: 0,
      }),
    );
    expect(m).not.toContain("Наставнику");
  });
});

describe("сообщение о возврате", () => {
  /**
   * 🔴 Партнёр обязан узнать ПРИЧИНУ, а не только новую цифру. Молча
   * уменьшившийся баланс читается как «нас обманули», и следующий разговор
   * начинается с этого.
   */
  it("партнёру называем заказ, сумму сторно и причину", () => {
    const msg = plain(
      partnerRefundMessage(
        { dealNo: 1042, clientName: "ООО «Ромашка»" },
        35000,
        "клиент отказался",
      ),
    );
    expect(msg).toContain("1042");
    expect(msg).toContain("35 000 ₽");
    expect(msg).toContain("клиент отказался");
  });

  it("без причины сообщение всё равно осмысленное", () => {
    const msg = plain(partnerRefundMessage({ dealNo: 7, clientName: "ИП Петров" }, 1000, null));
    expect(msg).toContain("1 000 ₽");
    expect(msg).not.toContain("null");
  });

  it("🔴 имя клиента наставнику не раскрывается", () => {
    // То же правило, что в кабинете и в оплате: процент — не повод открывать
    // чужую клиентскую базу.
    const msg = plain(
      partnerRefundMessage({ dealNo: 7, clientName: "ИП Петров" }, 1000, null, true),
    );
    expect(msg).not.toContain("Петров");
  });

  it("владельцу — заказ, возврат и сколько сняли с партнёров", () => {
    const msg = plain(
      ownerRefundMessage({ dealNo: 1042, clientName: "ООО «Ромашка»" }, 175000, 43750),
    );
    expect(msg).toContain("1042");
    expect(msg).toContain("175 000 ₽");
    expect(msg).toContain("43 750 ₽");
  });
});
