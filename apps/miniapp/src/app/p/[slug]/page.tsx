import { type ApiPromoPartner, fetchPromoPartner } from "@/lib/api";
import { PACKAGE_PRICES_RUB } from "@x10/config";
import { ArrowRight, Check } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

/**
 * Презентация продукта по ссылке партнёра (16.08.2026).
 *
 * 🔴 Зачем она вообще: раньше партнёр отправлял клиенту адрес статического КП.
 * Человек читал документ и в продукт не попадал НИКОГДА — ни в ленту, ни в
 * кейсы, ни в бота. Эта страница открывается внутри мини-аппа, поэтому из неё
 * есть ход дальше: подробное КП, лента, разговор с партнёром.
 *
 * Дизайн — язык лендинга мобильной разработки (`landing/mobile-kp`): градиент
 * фиолетовый → розовый → янтарный на заголовках, скруглённые блоки, светлая
 * тема. Продуктовая тёмная палитра здесь не годится: человек приходит извне,
 * из переписки, и первым экраном должно быть «понятно и дорого», а не «наше
 * приложение».
 *
 * ⚠️ Текст сокращён из КП и НЕ обещает больше него. Голосовое управление,
 * которое КП продаёт с 14.08, сюда не попало: оно не построено (§3.15 реестра).
 */

export const metadata: Metadata = {
  title: "ИИ работает на вас — контент-завод под ваш бизнес",
  description:
    "Система сама находит темы, пишет вашим голосом и публикует по расписанию. Ваше участие — одно нажатие в день.",
};

export async function generateStaticParams() {
  // Cache Components требует ≥1 результат для динамического сегмента.
  return [{ slug: "__prerender_placeholder__" }];
}

const rub = (v: number) => `${v.toLocaleString("ru-RU")} ₽`;

const STEPS = [
  {
    title: "Утром система читает вашу отрасль",
    text: "Ленты, новости, конкуренты. Из десяти тем отсеивает девять — остаётся то, что касается вашего клиента.",
  },
  {
    title: "Пишет вашим голосом",
    text: "Тон, любимые слова и чёрный список формулировок заданы один раз при настройке. Дальше она их держит сама.",
  },
  {
    title: "Спрашивает вас в Telegram",
    text: "Карточка приходит в рабочую группу: посмотрели, нажали. Без вашего решения наружу ничего не уходит.",
  },
  {
    title: "Выпускает во все площадки",
    text: "Пост, карусель, ролик и ролик с ведущим — из одной темы, по расписанию, до четырёх выходов в день.",
  },
] as const;

export default function PromoPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <main className="min-h-dvh bg-[#EFEDF7] text-[#16162E]">
      <div className="mx-auto w-full max-w-[560px] px-3 py-4">
        <Suspense fallback={<Skeleton />}>
          <PromoContent params={params} />
        </Suspense>
      </div>
    </main>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      <div className="h-64 animate-pulse rounded-3xl bg-[#E3DCF7]" />
      <div className="h-80 animate-pulse rounded-3xl bg-white/70" />
    </div>
  );
}

async function PromoContent({ params }: { params: Promise<{ slug: string }> }) {
  // 🔴 PPR-грабля (CLAUDE.md §8): connection() внутри дыры, иначе «партнёр не
  // найден» запечётся в статику навсегда.
  await connection();
  const { slug } = await params;
  const partner = await fetchPromoPartner(slug);

  // Партнёра может не быть — ссылка старая, участие приостановлено, слаг
  // ошибочный. Презентацию всё равно показываем: продукт от этого не исчез,
  // просто подписи снизу не будет, а разговор пойдёт с нами.
  return <Promo partner={partner} slug={slug} />;
}

function Promo({ partner, slug }: { partner: ApiPromoPartner | null; slug: string }) {
  const contact = partner?.contact?.replace(/^@/, "") ?? "Sekretar_Syrov_IP_bot";
  const talkUrl = `https://t.me/${contact}`;
  const kpUrl = partner?.kpUrl ?? `https://app.pro-agent-ai.ru/kp/${slug}/`;

  return (
    <>
      {/* ── Первый экран ─────────────────────────────────────────────── */}
      <section className="rounded-[26px] bg-[linear-gradient(155deg,#F4EEFF_0%,#FFEDF1_55%,#FFF4E0_100%)] px-5 pt-6 pb-7">
        <span className="inline-flex rounded-full bg-white/70 px-3 py-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[#7C3AED]">
          ИИ работает на вас
        </span>
        <h1 className="mt-3 mb-0 font-display text-[27px] font-extrabold leading-[1.12] tracking-[-0.02em]">
          Пока вы работаете,{" "}
          <span className="bg-[linear-gradient(96deg,#7C3AED_0%,#EC4899_52%,#F59E0B_100%)] bg-clip-text text-transparent">
            выходит контент
          </span>
        </h1>
        <p className="mt-2.5 mb-0 text-[14px] leading-relaxed text-[#585878]">
          До четырёх публикаций в день. Ваши темы, ваш голос, ваше решение перед выходом.
        </p>
      </section>

      {/* ── Механика: четыре шага ────────────────────────────────────── */}
      <section className="mt-3 rounded-[22px] border border-[#E9E6F5] bg-white p-5">
        {STEPS.map((step, i) => (
          <div key={step.title} className={i === 0 ? "flex gap-3" : "mt-4 flex gap-3"}>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[10px] bg-[linear-gradient(150deg,#7C3AED,#EC4899)] font-mono text-[12px] font-extrabold text-white">
              {i + 1}
            </span>
            <div>
              <b className="block text-[14.5px] leading-snug">{step.title}</b>
              <span className="mt-0.5 block text-[13px] leading-relaxed text-[#585878]">
                {step.text}
              </span>
            </div>
          </div>
        ))}

        <p className="mt-5 mb-0 rounded-[16px] bg-[linear-gradient(150deg,#F4EEFF,#E2F7FB)] p-4 text-[13.5px] leading-relaxed">
          <b>Что остаётся вам:</b> одно нажатие в день. Всё остальное — механика, и её больше не
          нужно делать руками.
        </p>
      </section>

      {/* ── Чем это отличается от подписки на чат ────────────────────── */}
      <section className="mt-3 rounded-[22px] border border-[#E9E6F5] bg-white p-5">
        <h2 className="m-0 font-display text-[16px] font-extrabold">Это не подписка на чат</h2>
        <ul className="mt-3 mb-0 list-none space-y-2 p-0 text-[13.5px] leading-snug">
          {[
            "Своё приложение на вашем сервере в России: свой домен, свой бот, своя база",
            "База знаний о вашем бизнесе: продукты, прайсы, кейсы, регламенты",
            "Фирменный стиль в оформлении — без промптов на десять строк",
            "Команда и роли: четыре уровня доступа, приглашение по ссылке",
            "Учёт до копейки: расход на каждый материал виден в панели",
          ].map((line) => (
            <li key={line} className="flex gap-2.5">
              <Check size={15} className="mt-0.5 shrink-0 text-[#059669]" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Цена ─────────────────────────────────────────────────────── */}
      <section className="mt-3 rounded-[22px] bg-[linear-gradient(150deg,#16162E,#2B2350)] p-5 text-white">
        <div className="text-[12px] text-[#B4AFD0]">Разработка и настройка, один раз</div>
        <div className="mt-1 font-mono text-[29px] font-extrabold tracking-[-0.02em]">
          от {rub(PACKAGE_PRICES_RUB.manual)}
        </div>
        <div className="mt-1.5 text-[12.5px] leading-relaxed text-[#B4AFD0]">
          Линия «под ключ» — {rub(PACKAGE_PRICES_RUB.line)}. Можно двумя платежами. Абонентской
          платы за доступ нет: вы платите за разработку своей системы.
        </div>
      </section>

      {/* ── Дальше ───────────────────────────────────────────────────── */}
      <div className="mt-3 space-y-2.5">
        <a
          href={talkUrl}
          className="flex items-center justify-center gap-2 rounded-[16px] bg-[linear-gradient(96deg,#7C3AED,#EC4899)] px-5 py-4 font-display text-[15.5px] font-extrabold text-white"
        >
          Обсудить внедрение <ArrowRight size={16} />
        </a>
        {/* Полное КП: тот же домен и тот же webview — человек остаётся внутри
            приложения, а не улетает в браузер. */}
        <a
          href={kpUrl}
          className="flex items-center justify-center gap-2 rounded-[16px] border-[1.5px] border-[#E9E6F5] bg-white px-5 py-3.5 font-display text-[14px] font-bold text-[#7C3AED]"
        >
          Подробнее: как это устроено
        </a>
        <a
          href="/"
          className="flex items-center justify-center gap-2 rounded-[16px] border-[1.5px] border-[#E9E6F5] bg-white px-5 py-3.5 text-[13.5px] text-[#585878]"
        >
          Посмотреть, что система пишет каждый день
        </a>
      </div>

      {partner && (
        <div className="mt-3 flex items-center gap-3 rounded-[16px] border border-[#E9E6F5] bg-white p-3.5">
          <div className="h-9 w-9 shrink-0 rounded-full bg-[linear-gradient(140deg,#7C3AED,#EC4899)]" />
          <div className="min-w-0">
            <b className="block text-[13.5px]">{partner.name}</b>
            <span className="block text-[12px] text-[#8C8CAB]">
              рекомендует{partner.contact ? ` · ${partner.contact}` : ""}
            </span>
          </div>
        </div>
      )}

      <p className="mt-4 mb-0 px-1 pb-8 text-center text-[11.5px] leading-relaxed text-[#8C8CAB]">
        ProAgent AI · ИП Сыров К.А. · данные и модели остаются в России
      </p>
    </>
  );
}
