import { describe, expect, it } from "vitest";
import { YooKassaError, createPayment, getPayment } from "../src/lib/yookassa";

/**
 * Клиент ЮKassa (спека 7).
 *
 * Проверяем ровно то, что ломается молча и стоит денег: заголовок авторизации,
 * ключ идемпотентности, формат суммы и состав чека. Ошибка в любом из них не
 * падает у нас — она возвращается 401 или пустым чеком уже на живом платеже.
 */

const CREDS = { shopId: "123456", secretKey: "live_secret" };

/** Подменённый fetch: запоминает запрос и отдаёт заготовленный ответ. */
function stubFetch(response: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: unknown, init: unknown) => {
    calls.push({ url: String(url), init: (init ?? {}) as RequestInit });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => response,
      text: async () => JSON.stringify(response),
    };
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const ARGS = {
  paymentId: "11111111-2222-3333-4444-555555555555",
  amountRub: 350000,
  description: "Вход в продукт: линия",
  returnUrl: "https://app.pro-agent-ai.ru/pay/abc?paid=1",
  payerEmail: "client@example.com",
};

const OK_RESPONSE = {
  id: "2f8e1a00-000f-5000-9000-1a2b3c4d5e6f",
  status: "pending",
  paid: false,
  confirmation: { type: "redirect", confirmation_url: "https://yoomoney.ru/checkout/payments/x" },
};

describe("createPayment", () => {
  it("авторизуется как Basic base64(shopId:secretKey)", async () => {
    const { impl, calls } = stubFetch(OK_RESPONSE);
    await createPayment(CREDS, ARGS, impl);

    const headers = calls[0]?.init.headers as Record<string, string>;
    const expected = `Basic ${Buffer.from("123456:live_secret").toString("base64")}`;
    expect(headers.Authorization).toBe(expected);
  });

  it("шлёт Idempotence-Key = id нашей строки платежа", async () => {
    // 🔴 Свой id, а не случайный: при ретрае создастся ТОТ ЖЕ платёж, а не
    // второй на ту же сумму.
    const { impl, calls } = stubFetch(OK_RESPONSE);
    await createPayment(CREDS, ARGS, impl);

    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["Idempotence-Key"]).toBe(ARGS.paymentId);
  });

  it("передаёт сумму строкой с двумя знаками", async () => {
    const { impl, calls } = stubFetch(OK_RESPONSE);
    await createPayment(CREDS, { ...ARGS, amountRub: 10 }, impl);

    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body.amount).toEqual({ value: "10.00", currency: "RUB" });
  });

  it("просит редирект и возвращает confirmation_url", async () => {
    const { impl, calls } = stubFetch(OK_RESPONSE);
    const created = await createPayment(CREDS, ARGS, impl);

    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body.confirmation).toEqual({ type: "redirect", return_url: ARGS.returnUrl });
    expect(body.capture).toBe(true);
    expect(created.confirmationUrl).toBe("https://yoomoney.ru/checkout/payments/x");
    expect(created.providerPaymentId).toBe(OK_RESPONSE.id);
  });

  it("кладёт в чек email плательщика и параметры 54-ФЗ", async () => {
    const { impl, calls } = stubFetch(OK_RESPONSE);
    await createPayment(CREDS, ARGS, impl);

    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body.receipt.customer.email).toBe("client@example.com");
    expect(body.receipt.items).toHaveLength(1);
    expect(body.receipt.items[0]).toMatchObject({
      quantity: 1,
      vat_code: 1,
      payment_subject: "service",
      payment_mode: "full_payment",
      amount: { value: "350000.00", currency: "RUB" },
    });
    // ⚠️ tax_system_code НЕ передаём: у магазина одна система налогообложения.
    expect(body.receipt.tax_system_code).toBeUndefined();
  });

  it("описание платежа уезжает и в платёж, и в позицию чека", async () => {
    // Клиент видит одну и ту же строку в банке и в чеке — иначе он не свяжет
    // списание с покупкой и придёт спрашивать.
    const { impl, calls } = stubFetch(OK_RESPONSE);
    await createPayment(CREDS, ARGS, impl);

    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body.description).toBe(ARGS.description);
    expect(body.receipt.items[0].description).toBe(ARGS.description);
  });

  it("на 401 бросает ошибку с кодом провайдера", async () => {
    // Грабля скилла: 401 invalid_credentials — это чаще всего shopId ЧУЖОГО
    // магазина, а не «сломался код». Код провайдера обязан доехать до логов.
    const { impl } = stubFetch(
      { type: "error", code: "invalid_credentials", description: "Error in shopId or secret key" },
      401,
    );

    await expect(createPayment(CREDS, ARGS, impl)).rejects.toMatchObject({
      name: "YooKassaError",
      status: 401,
      code: "invalid_credentials",
    });
  });

  it("на ответ без confirmation_url бросает ошибку, а не отдаёт пустую ссылку", async () => {
    // Пустая ссылка увела бы клиента в никуда, а платёж остался бы pending.
    const { impl } = stubFetch({ id: "x", status: "pending", paid: false });
    await expect(createPayment(CREDS, ARGS, impl)).rejects.toBeInstanceOf(YooKassaError);
  });
});

describe("getPayment", () => {
  it("спрашивает платёж по id тем же Basic-auth", async () => {
    const { impl, calls } = stubFetch({
      id: "pay_1",
      status: "succeeded",
      paid: true,
      amount: { value: "350000.00", currency: "RUB" },
    });
    const p = await getPayment(CREDS, "pay_1", impl);

    expect(calls[0]?.url).toBe("https://api.yookassa.ru/v3/payments/pay_1");
    expect(calls[0]?.init.method).toBe("GET");
    expect(p).toEqual({
      providerPaymentId: "pay_1",
      status: "succeeded",
      paid: true,
      amountRub: 350000,
    });
  });

  it("отменённый платёж возвращается как есть, без исключения", async () => {
    const { impl } = stubFetch({
      id: "pay_2",
      status: "canceled",
      paid: false,
      amount: { value: "180000.00", currency: "RUB" },
    });
    const p = await getPayment(CREDS, "pay_2", impl);
    expect(p.status).toBe("canceled");
    expect(p.paid).toBe(false);
  });
});
