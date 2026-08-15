import { RECEIPT } from "@x10/config";

/**
 * Клиент ЮKassa (спека 7) — единственное место, где мы разговариваем со шлюзом.
 *
 * Создание платежа и его перепроверка живут вместе, потому что вебхуку нельзя
 * верить на слово: уведомление приходит по открытому адресу, а решение о деньгах
 * принимается только по ответу `GET /v3/payments/{id}`.
 *
 * 🔴 Назначение платежа (пополнение баланса или вход в продукт) сюда НЕ
 * протекает: шлюзу всё равно, за что платят, а нам важно, чтобы труба была
 * одна. Различает назначение слой выше — `payment-settle.ts`.
 */

const API = "https://api.yookassa.ru/v3";

export type YooKassaCreds = {
  shopId: string;
  secretKey: string;
};

export type CreatePaymentArgs = {
  /**
   * id НАШЕЙ строки `payments`. Уходит в `Idempotence-Key`: при ретрае шлюз
   * вернёт тот же платёж, а не создаст второй на ту же сумму.
   */
  paymentId: string;
  amountRub: number;
  /** Видит клиент в банке и в чеке. Одна строка на оба места. */
  description: string;
  returnUrl: string;
  /**
   * 🔴 Обязателен: без него облачная касса не выбьет чек (54-ФЗ). Поле
   * необязательным не делаем намеренно — иначе платёж без чека можно создать
   * случайно, а обнаружится это при проверке налоговой.
   */
  payerEmail: string;
};

export type CreatedPayment = {
  providerPaymentId: string;
  confirmationUrl: string;
  status: string;
};

export type FetchedPayment = {
  providerPaymentId: string;
  status: string;
  paid: boolean;
  amountRub: number;
};

/** Ошибка шлюза с кодом провайдера: по нему отличается «неверные ключи» от прочего. */
export class YooKassaError extends Error {
  readonly name = "YooKassaError";
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
  }
}

/** Рубли → строка с двумя знаками: шлюз принимает только такой формат. */
const money = (rub: number): string => rub.toFixed(2);

const authHeader = (creds: YooKassaCreds): string =>
  `Basic ${Buffer.from(`${creds.shopId}:${creds.secretKey}`).toString("base64")}`;

type ProviderPayment = {
  id?: string;
  status?: string;
  paid?: boolean;
  amount?: { value?: string };
  confirmation?: { confirmation_url?: string };
  code?: string;
  description?: string;
};

async function request(
  creds: YooKassaCreds,
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<ProviderPayment> {
  const res = await fetchImpl(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(creds),
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  const json = (await res.json().catch(() => null)) as ProviderPayment | null;

  if (!res.ok) {
    // Код провайдера ведёт к причине быстрее любого нашего текста:
    // `invalid_credentials` — это почти всегда shopId другого магазина.
    throw new YooKassaError(
      `ЮKassa ответила ${res.status}: ${json?.description ?? "без описания"}`,
      res.status,
      json?.code ?? null,
    );
  }
  if (!json) {
    throw new YooKassaError("ЮKassa вернула нечитаемый ответ", res.status, null);
  }
  return json;
}

/**
 * Создаёт платёж и возвращает ссылку на страницу оплаты.
 *
 * `capture: true` — одностадийный платёж: деньги списываются сразу, без
 * отдельного подтверждения. Двухстадийность нужна там, где товар может не
 * найтись на складе; у нас найдётся.
 */
export async function createPayment(
  creds: YooKassaCreds,
  args: CreatePaymentArgs,
  fetchImpl: typeof fetch = fetch,
): Promise<CreatedPayment> {
  const value = money(args.amountRub);

  const json = await request(
    creds,
    "/payments",
    {
      method: "POST",
      headers: { "Idempotence-Key": args.paymentId },
      body: JSON.stringify({
        amount: { value, currency: "RUB" },
        capture: true,
        confirmation: { type: "redirect", return_url: args.returnUrl },
        description: args.description,
        receipt: {
          customer: { email: args.payerEmail },
          items: [
            {
              description: args.description,
              quantity: 1,
              amount: { value, currency: "RUB" },
              vat_code: RECEIPT.vatCode,
              payment_subject: RECEIPT.paymentSubject,
              payment_mode: RECEIPT.paymentMode,
            },
          ],
        },
      }),
    },
    fetchImpl,
  );

  const confirmationUrl = json.confirmation?.confirmation_url;
  const providerPaymentId = json.id;
  if (!providerPaymentId || !confirmationUrl) {
    // Пустая ссылка увела бы клиента в никуда, а платёж завис бы в `pending`.
    throw new YooKassaError("ЮKassa не вернула ссылку на оплату", 200, null);
  }

  return { providerPaymentId, confirmationUrl, status: json.status ?? "pending" };
}

/**
 * Перепроверка платежа — источник истины для зачисления.
 *
 * 🔴 Вебхук телу уведомления не верит: адрес публичный, подписи у ЮKassa нет.
 * Решение о деньгах принимается только по этому ответу.
 */
export async function getPayment(
  creds: YooKassaCreds,
  providerPaymentId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchedPayment> {
  const json = await request(
    creds,
    `/payments/${encodeURIComponent(providerPaymentId)}`,
    { method: "GET" },
    fetchImpl,
  );

  return {
    providerPaymentId: json.id ?? providerPaymentId,
    status: json.status ?? "unknown",
    paid: Boolean(json.paid),
    amountRub: Number(json.amount?.value ?? 0),
  };
}
