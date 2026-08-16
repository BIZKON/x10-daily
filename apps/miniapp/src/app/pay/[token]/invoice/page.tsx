import { type ApiInvoice, fetchInvoice } from "@/lib/api";
import { formatDealNo } from "@x10/config";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PrintButton } from "./print-button";

/**
 * Счёт на оплату (спека 7, этап 3).
 *
 * Печатный документ, а не экран приложения: формат счёта в России сложился, и
 * бухгалтерия ждёт привычного вида. Печать — средствами браузера: PDF-пакет
 * ради одной страницы тянуть незачем, а «Сохранить как PDF» есть в каждом.
 *
 * 🔴 Номер счёта — номер заказа. Второго номера у одного заказа не бывает:
 * иначе бухгалтерия клиента спросит, какой из них верный, и будет права.
 */

export const metadata: Metadata = {
  title: "Счёт на оплату",
  robots: { index: false, follow: false },
};

export async function generateStaticParams() {
  // Cache Components требует ≥1 результат для динамического сегмента.
  return [{ token: "__prerender_placeholder__" }];
}

const rub = (v: number) =>
  `${v.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function InvoicePage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main className="min-h-dvh bg-[#F3F0F8] px-3 py-5 text-[#1A1626] print:bg-white print:p-0">
      <div className="mx-auto w-full max-w-[820px]">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white/70" />}>
          <InvoiceContent params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function InvoiceContent({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const invoice = await fetchInvoice(token);

  if (!invoice) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center">
        <h1 className="m-0 font-display text-[18px] font-extrabold">Счёт не открылся</h1>
        <p className="mt-2 text-[14px] text-[#6B6478]">
          Ссылка неполная или заказ отменён. Напишите тому, кто прислал ссылку.
        </p>
      </div>
    );
  }

  if (!invoice.bankConfigured || !invoice.seller.bank) {
    // Пустой счёт хуже отсутствующего: по нему нельзя заплатить, но выглядит
    // он как настоящий, и клиент потеряет день, прежде чем это выяснится.
    return (
      <div className="rounded-2xl bg-white p-6">
        <h1 className="m-0 font-display text-[18px] font-extrabold">Счёт пока не выставляется</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[#6B6478]">
          Банковские реквизиты не настроены. Оплатите картой на{" "}
          <a href={`/pay/${token}`} className="text-[#7C3AED] underline">
            странице заказа
          </a>{" "}
          — или напишите тому, кто прислал ссылку, и мы выставим счёт вручную.
        </p>
      </div>
    );
  }

  return <Invoice invoice={invoice} token={token} />;
}

function Invoice({ invoice, token }: { invoice: ApiInvoice; token: string }) {
  const bank = invoice.seller.bank;
  if (!bank) return null;

  const issued = new Date(invoice.issuedAt).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <div className="mb-3 flex justify-end gap-2 print:hidden">
        <a
          href={`/pay/${token}`}
          className="rounded-xl border-[1.5px] border-[#E8E3F0] bg-white px-4 py-2 text-[13px]"
        >
          К заказу
        </a>
        <PrintButton />
      </div>

      <article className="rounded-2xl bg-white p-7 text-[13px] leading-normal print:rounded-none print:p-0">
        {/* Банковские реквизиты сверху — как в привычной форме счёта. */}
        <table className="w-full border-collapse text-[12.5px]">
          <tbody>
            <tr>
              <td className="w-[62%] border border-[#1A1626] p-2 align-top">
                {bank.name}
                <div className="mt-1 text-[11px] text-[#6B6478]">Банк получателя</div>
              </td>
              <td className="border border-[#1A1626] p-2 align-top">
                <span className="text-[11px] text-[#6B6478]">БИК</span>
                <div className="font-mono">{bank.bik}</div>
                <span className="text-[11px] text-[#6B6478]">Сч. №</span>
                <div className="font-mono">{bank.corrAccount}</div>
              </td>
            </tr>
            <tr>
              <td className="border border-[#1A1626] p-2 align-top">
                <div>
                  ИНН <span className="font-mono">{invoice.seller.inn}</span>
                </div>
                <div className="mt-1">{invoice.seller.legalName}</div>
                <div className="mt-1 text-[11px] text-[#6B6478]">Получатель</div>
              </td>
              <td className="border border-[#1A1626] p-2 align-top">
                <span className="text-[11px] text-[#6B6478]">Сч. №</span>
                <div className="font-mono">{bank.account}</div>
              </td>
            </tr>
          </tbody>
        </table>

        <h1 className="mt-6 mb-0 font-display text-[20px] font-extrabold">
          Счёт на оплату № {formatDealNo(invoice.dealNo)} от {issued}
        </h1>
        <div className="mt-1 h-[3px] w-full bg-[#1A1626]" />

        <dl className="mt-4 grid grid-cols-[110px_1fr] gap-y-1.5">
          <dt className="text-[#6B6478]">Поставщик</dt>
          <dd className="m-0">
            {invoice.seller.legalName}, ИНН {invoice.seller.inn}, ОГРНИП {invoice.seller.ogrnip},{" "}
            {invoice.seller.address}, {invoice.seller.phone}
          </dd>
          <dt className="text-[#6B6478]">Покупатель</dt>
          <dd className="m-0">
            {invoice.buyer.name}
            {invoice.buyer.inn ? `, ИНН ${invoice.buyer.inn}` : ""}
            {invoice.buyer.kpp ? `, КПП ${invoice.buyer.kpp}` : ""}
            {invoice.buyer.address ? `, ${invoice.buyer.address}` : ""}
          </dd>
        </dl>

        <table className="mt-5 w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-[#F3F0F8]">
              <th className="border border-[#1A1626] p-2 text-left font-semibold">№</th>
              <th className="border border-[#1A1626] p-2 text-left font-semibold">
                Наименование работ, услуг
              </th>
              <th className="border border-[#1A1626] p-2 text-right font-semibold">Кол-во</th>
              <th className="border border-[#1A1626] p-2 text-right font-semibold">Цена</th>
              <th className="border border-[#1A1626] p-2 text-right font-semibold">Сумма</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-[#1A1626] p-2">1</td>
              <td className="border border-[#1A1626] p-2">{invoice.item.description}</td>
              <td className="border border-[#1A1626] p-2 text-right font-mono">1</td>
              <td className="border border-[#1A1626] p-2 text-right font-mono">
                {rub(invoice.item.amountRub)}
              </td>
              <td className="border border-[#1A1626] p-2 text-right font-mono">
                {rub(invoice.item.amountRub)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mt-3 text-right">
          <div>
            Итого: <span className="font-mono font-bold">{rub(invoice.amountRub)} ₽</span>
          </div>
          {invoice.paidRub > 0 && (
            <div className="mt-0.5 text-[#6B6478]">
              Оплачено ранее: <span className="font-mono">{rub(invoice.paidRub)} ₽</span>
            </div>
          )}
          <div className="mt-1 text-[15px]">
            <b>
              К оплате по счёту: <span className="font-mono">{rub(invoice.dueNowRub)} ₽</span>
            </b>
          </div>
        </div>

        <p className="mt-2 mb-0 text-[12.5px]">{invoice.vatNote}</p>

        <p className="mt-3 mb-0 border-t border-[#1A1626] pt-2 text-[12.5px]">
          Всего к оплате: <b>{invoice.dueInWords}</b>
        </p>

        {invoice.installments > 1 && (
          <p className="mt-3 mb-0 text-[12.5px] leading-relaxed">
            Оплата в {invoice.installments} части. Настоящий счёт выставлен на{" "}
            {invoice.paidRub > 0 ? "вторую" : "первую"} часть
            {invoice.nextDueAt
              ? `; следующая — до ${new Date(invoice.nextDueAt).toLocaleDateString("ru-RU")}`
              : ""}
            . Работа по договору начинается после первого платежа.
          </p>
        )}

        <div className="mt-10 flex items-end justify-between">
          <div>
            <div className="w-[240px] border-b border-[#1A1626]" />
            <div className="mt-1 text-[11.5px] text-[#6B6478]">
              Индивидуальный предприниматель / {invoice.seller.shortName}
            </div>
          </div>
        </div>

        <p className="mt-6 mb-0 text-[11px] leading-relaxed text-[#6B6478]">
          Оплата настоящего счёта означает согласие с условиями оферты. Счёт действителен к оплате в
          течение 5 банковских дней. В назначении платежа укажите: «Оплата по счёту №{" "}
          {formatDealNo(invoice.dealNo)}, НДС не облагается».
        </p>
      </article>
    </>
  );
}
