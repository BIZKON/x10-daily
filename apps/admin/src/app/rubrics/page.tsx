import type { AdminCategory } from "@/lib/api";
import { Filter } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Рубрики — ProAgent AI Admin" };

/**
 * Рубрикатор ProAgent AI — фиксированная таксономия первого уровня.
 * Эта страница — обзор для редакции: что в каждой рубрике, частота, бенчмарки.
 *
 * Подкатегории (news.models, cases.sales и т.д.) — второй уровень.
 * Они не хранятся в БД как отдельная таблица — это open string в articles.subcategory.
 * IngestAgent классифицирует автоматически (см. packages/agents/src/agents/ingest.ts).
 *
 * Здесь — read-only справочник. CRUD над рубриками возможен только через миграцию
 * Postgres enum (article_category) — это редкое событие, не админская операция.
 */

type Rubric = {
  id: AdminCategory;
  label: string;
  short: string;
  why: string;
  cadence: string;
  benchmarks: string[];
  subcategories: Array<{ slug: string; label: string }>;
  toneClass: string;
};

const RUBRICS: Rubric[] = [
  {
    id: "news",
    label: "Новости ИИ",
    short: "Дефолтная рубрика авто-конвейера",
    why: "Новости ИИ и автоматизации, отобранные под один угол: практическая выгода для малого и среднего бизнеса. Без хайпа, с цифрами.",
    cadence: "4 материала в день · авто-конвейер + HumanGate",
    benchmarks: ["Ben's Bites", "The Rundown AI", "vc.ru (ИИ)"],
    subcategories: [
      { slug: "news.models", label: "Модели, релизы, цены API" },
      { slug: "news.adoption", label: "Внедрения и рынок ИИ в МСБ" },
      { slug: "news.regulation", label: "Регулирование ИИ, ПДн" },
      { slug: "news.tools-updates", label: "Обновления инструментов" },
    ],
    toneClass: "border-red/40 bg-red/[0.04]",
  },
  {
    id: "cases",
    label: "Кейсы",
    short: "Внедрения с цифрами до/после",
    why: "Разборы реальных внедрений ИИ-агентов: часы, деньги, конверсия. Формат deep-dive — что сделали, что получили, где споткнулись.",
    cadence: "1-2 материала в неделю · вручную через админку",
    benchmarks: ["Lenny's Newsletter", "The Generalist"],
    subcategories: [
      { slug: "cases.sales", label: "Продажи и обработка заявок" },
      { slug: "cases.support", label: "Поддержка и клиентский сервис" },
      { slug: "cases.docs", label: "Документооборот и бэк-офис" },
      { slug: "cases.failures", label: "Разборы неудачных внедрений" },
    ],
    toneClass: "border-gold/40 bg-gold/[0.04]",
  },
  {
    id: "howto",
    label: "Обучение",
    short: "Пошаговые методики внедрения",
    why: "Как внедрить ИИ-агента своими силами: с чего начать, как подготовить процесс и данные, как посчитать результат.",
    cadence: "1-2 материала в неделю",
    benchmarks: ["Тинькофф-Журнал Бизнес", "Habr (ИИ-хабы)"],
    subcategories: [
      { slug: "howto.start", label: "С чего начать: аудит процессов" },
      { slug: "howto.prompting", label: "Промпты и настройка агентов" },
      { slug: "howto.integration", label: "Интеграции: CRM, мессенджеры, 1С" },
      { slug: "howto.checklists", label: "Чек-листы и шаблоны" },
    ],
    toneClass: "border-steel/60 bg-steel/[0.06]",
  },
  {
    id: "tools",
    label: "Инструменты",
    short: "Обзоры и сравнения решений",
    why: "Что выбрать под задачу и бюджет МСБ: агентные платформы, no-code, российские аналоги. Честные сравнения с ценами.",
    cadence: "1-2 материала в неделю",
    benchmarks: ["Ben's Bites", "The Pragmatic Engineer"],
    subcategories: [
      { slug: "tools.agents", label: "Агентные платформы и боты" },
      { slug: "tools.nocode", label: "No-code и конструкторы" },
      { slug: "tools.local", label: "Российские и self-hosted решения" },
      { slug: "tools.compare", label: "Сравнения и цены" },
    ],
    toneClass: "border-fence bg-card",
  },
  {
    id: "business",
    label: "Практика",
    short: "Бизнес-сторона внедрений",
    why: "Деньги, право и процессы вокруг ИИ: расчёт окупаемости, 152-ФЗ и ПДн, договоры с подрядчиками, изменения в команде.",
    cadence: "1-2 материала в неделю",
    benchmarks: ["The Bell", "Frank Media"],
    subcategories: [
      { slug: "business.roi", label: "Расчёт выгоды и окупаемости" },
      { slug: "business.law", label: "152-ФЗ, ПДн, договоры" },
      { slug: "business.processes", label: "Процессы и данные до ИИ" },
      { slug: "business.team", label: "Команда и роли" },
    ],
    toneClass: "border-success/40 bg-success/[0.04]",
  },
  {
    id: "founder",
    label: "От основателя",
    short: "Главный авторский голос",
    why: "Флагман-рубрика: «Разбор от основателя» — ежедневная реакция на новости внедрения ИИ от первого лица + ручные кейсы из практики.",
    cadence: "3-5 в неделю · вручную",
    benchmarks: ["Stratechery Daily Update"],
    subcategories: [
      { slug: "founder.take", label: "Разбор от основателя (daily-take)" },
      { slug: "founder.cases", label: "Кейсы из собственной практики" },
      { slug: "founder.qa", label: "Ответы на вопросы подписчиков" },
    ],
    toneClass:
      "border-gold/50 [background:linear-gradient(135deg,rgba(212,162,76,0.06),rgba(230,57,70,0.04))]",
  },
];

export default function RubricsPage() {
  return (
    <>
      <header className="mb-6 border-b border-fence pb-5">
        <h1 className="m-0 font-display text-2xl font-extrabold">Рубрики</h1>
        <p className="mt-1.5 text-[13px] text-mist">
          Рубрикатор ProAgent AI — таксономия первого уровня. 6 рубрик, фиксированный набор.
          Подкатегории второго уровня — открытые, IngestAgent классифицирует автоматически. CRUD над
          рубриками — только через миграцию Postgres enum, не через UI.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {RUBRICS.map((r) => (
          <article key={r.id} className={`rounded-2xl border p-5 ${r.toneClass}`}>
            <div className="mb-1 flex items-center gap-2">
              <h2 className="m-0 font-display text-lg font-extrabold">{r.label}</h2>
              <code className="rounded-pill border border-fence bg-night px-2 py-0.5 font-mono text-[10px] text-haze">
                {r.id}
              </code>
              <Link
                href={`/?category=${r.id}`}
                className="ml-auto inline-flex items-center gap-1 rounded-pill border border-fence bg-night px-2 py-0.5 font-display text-[10px] font-semibold uppercase tracking-[0.1em] text-mist transition-colors hover:border-gold/60 hover:text-gold"
                title={`Очередь · фильтр по ${r.label}`}
              >
                <Filter size={9} strokeWidth={2.5} /> Очередь
              </Link>
            </div>
            <p className="m-0 mb-3 text-[12px] font-semibold uppercase tracking-[0.15em] text-mist">
              {r.short}
            </p>
            <p className="m-0 text-[13px] leading-[1.5] text-paper">{r.why}</p>

            <div className="mt-4 border-t border-fence pt-3">
              <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.15em] text-gold">
                Подкатегории
              </div>
              <ul className="m-0 list-none space-y-1 p-0">
                {r.subcategories.map((s) => (
                  <li key={s.slug} className="text-[12.5px]">
                    <Link
                      href={`/?category=${r.id}&subcategory=${encodeURIComponent(s.slug)}`}
                      className="flex items-start gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-night/40"
                      title={`Очередь · ${s.slug}`}
                    >
                      <code className="font-mono text-[11px] text-haze transition-colors group-hover:text-gold">
                        {s.slug}
                      </code>
                      <span className="text-mist">— {s.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-3 grid gap-2 text-[11px] text-haze sm:grid-cols-2">
              <div>
                <span className="font-bold text-mist">Частота:</span> {r.cadence}
              </div>
              <div>
                <span className="font-bold text-mist">Бенчмарки:</span> {r.benchmarks.join(", ")}
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
