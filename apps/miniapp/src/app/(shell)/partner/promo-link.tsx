"use client";

import { Check, Copy, Send } from "lucide-react";
import { useState } from "react";

/**
 * Ссылка партнёра на презентацию продукта.
 *
 * Копируется не голый адрес, а готовое сообщение: партнёр отправляет его в
 * переписку целиком, не сочиняя подводку. Подводка — то место, где чаще всего
 * ломается продажа через знакомых.
 */
export function PromoLink({ url, webUrl }: { url: string; webUrl: string | null }) {
  const [copied, setCopied] = useState<"link" | "text" | null>(null);

  const message =
    "Показываю, чем мы автоматизировали контент. Система сама находит темы, пишет и публикует — " +
    `решение остаётся за человеком: ${url}`;

  const copy = (value: string, what: "link" | "text") => {
    navigator.clipboard?.writeText(value);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <section className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[12px] font-semibold uppercase tracking-wider text-white/45">
        Ваша ссылка для клиента
      </div>

      <code className="mt-1.5 block truncate rounded-lg bg-black/25 px-3 py-2 font-mono text-[12.5px] text-gold">
        {url}
      </code>

      <p className="mt-2 text-[12.5px] leading-relaxed text-white/55">
        Открывается прямо в приложении: человек читает презентацию, оттуда может открыть подробное
        предложение и написать вам. Подписана вашим именем.
      </p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => copy(message, "text")}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-[13px] font-bold text-ink"
        >
          {copied === "text" ? <Check size={14} /> : <Send size={14} />}
          {copied === "text" ? "Скопировано" : "Скопировать с текстом"}
        </button>
        <button
          type="button"
          onClick={() => copy(url, "link")}
          className="flex items-center justify-center gap-2 rounded-xl border border-white/15 px-3.5 py-2.5 text-[13px] text-white/75"
        >
          {copied === "link" ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>

      {webUrl && (
        <p className="mt-2.5 mb-0 text-[11.5px] leading-relaxed text-white/40">
          Если клиент не в Telegram — вот тот же экран обычной ссылкой:{" "}
          <span className="font-mono text-white/55">{webUrl}</span>
        </p>
      )}
    </section>
  );
}
