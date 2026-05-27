import type { AdminCategory } from "@/lib/api";

export const metadata = { title: "Рубрики — X10 Admin" };

/**
 * Brief §1 — фиксированная таксономия первого уровня.
 * Эта страница — обзор для редколлегии: что в каждой рубрике, частота, бенчмарки.
 *
 * Подкатегории (taxes.news, taxes.guides и т.д.) — это второй уровень из brief §1.
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
    id: "taxes",
    label: "Налоги и право",
    short: "Главная боль ЦА в 2026",
    why: "УСН 350 млн, НДС 22%, новые требования ФНС, ПСН, реформы. У РБК и Тинькофф-Журнала это работает лучше всего — у нас будет конкретнее и быстрее.",
    cadence: "5-10 материалов в неделю · 1 разбор в неделю · ежемесячный календарь",
    benchmarks: ["Sifted Funding tracker", "Тинькофф-Журнал Бизнес", "Axios Pro"],
    subcategories: [
      { slug: "taxes.news", label: "Новости законодательства" },
      { slug: "taxes.guides", label: "Пошаговые разборы" },
      { slug: "taxes.calendar", label: "Налоговый календарь" },
      { slug: "taxes.cases", label: "Судебная практика" },
      { slug: "taxes.qa", label: "Q&A" },
    ],
    toneClass: "border-red/40 bg-red/[0.04]",
  },
  {
    id: "money",
    label: "Деньги и финансы",
    short: "Ставка 17%, банки МСП, ВЭД",
    why: "Банки закрылись для МСП, валютный контроль ужесточили. Предприниматели ищут способы оборачивать капитал.",
    cadence: "4-7 материалов в неделю",
    benchmarks: ["Frank Media", "The Bell", "Stratechery"],
    subcategories: [
      { slug: "money.cbr", label: "Решения ЦБ, ставка" },
      { slug: "money.banks", label: "Банки МСП-сегмента" },
      { slug: "money.currency", label: "Валютный контроль, ОАЭ/KZ" },
      { slug: "money.invest", label: "Оборотка малого бизнеса" },
      { slug: "money.credit", label: "Кредиты, лизинг, факторинг" },
    ],
    toneClass: "border-gold/40 bg-gold/[0.04]",
  },
  {
    id: "practice",
    label: "Бизнес-практика",
    short: "Истории основателей, разборы кейсов",
    why: "Ядро контента — наследие газеты, герои Х10 (Васляев, Воронов, Дахужев, Романчук) в формате Smart Brevity и Lenny's deep-dive.",
    cadence: "2-4 материала в неделю · 1 лонгрид",
    benchmarks: ["Lenny's Newsletter", "The Generalist", "Stratechery"],
    subcategories: [
      { slug: "practice.stories", label: "Истории основателей" },
      { slug: "practice.teardowns", label: "Разборы компаний и кейсов" },
      { slug: "practice.lessons", label: "Практические уроки" },
      { slug: "practice.failures", label: "Разборы провалов" },
      { slug: "practice.playbooks", label: "Пошаговые методички" },
    ],
    toneClass: "border-steel/60 bg-steel/[0.06]",
  },
  {
    id: "power",
    label: "Власть и регуляторика",
    short: "Законы для бизнеса, без идеологии",
    why: "Регулирование меняется ежемесячно. Маркировка, ОФД, санкции, AI-регулирование. Предпринимателю нужен дайджест без идеологии.",
    cadence: "3-5 материалов в неделю",
    benchmarks: ["Axios политическая аналитика", "Politico Pro", "The Bell"],
    subcategories: [
      { slug: "power.laws", label: "Новые законы для бизнеса" },
      { slug: "power.sanctions", label: "Санкции, обход (только public)" },
      { slug: "power.regions", label: "Региональные программы" },
      { slug: "power.foreign", label: "ОАЭ, Казахстан, Турция, Сербия" },
    ],
    toneClass: "border-fence bg-card",
  },
  {
    id: "tech",
    label: "Технологии и AI",
    short: "AI-агенты, no-code, импортозамещение",
    why: "Горизонт ближайших 3 лет. Большинство ЦА не понимает что с этим делать.",
    cadence: "3-5 материалов в неделю",
    benchmarks: ["Stratechery", "The Pragmatic Engineer", "Ben's Bites"],
    subcategories: [
      { slug: "tech.ai", label: "AI-новости + применение в МСП" },
      { slug: "tech.tools", label: "CRM, no-code, аналитика" },
      { slug: "tech.import", label: "Российские аналоги западного софта" },
      { slug: "tech.security", label: "Киберугрозы, утечки" },
      { slug: "tech.future", label: "Что меняется на горизонте 1-3 лет" },
    ],
    toneClass: "border-success/40 bg-success/[0.04]",
  },
  {
    id: "rybakov",
    label: "Рыбаков говорит",
    short: "Главный авторский голос",
    why: "Флагман-рубрика: ежедневная реакция + авторские эссе + расшифровки YouTube. Stratechery Daily Update в русском контексте.",
    cadence: "5+ в неделю · ежедневно",
    benchmarks: ["Stratechery Daily Update", "Pivot (Кара Свишер)", "Lex Fridman"],
    subcategories: [
      { slug: "rybakov.daily", label: "Короткая реакция (daily-take)" },
      { slug: "rybakov.essay", label: "Авторские эссе" },
      { slug: "rybakov.podcast", label: "Выжимки из YouTube" },
      { slug: "rybakov.qa", label: "Ответы на вопросы подписчиков" },
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
          Brief §1 — таксономия первого уровня. 6 рубрик, фиксированный набор.
          Подкатегории второго уровня — открытые, IngestAgent классифицирует автоматически.
          CRUD над рубриками — только через миграцию Postgres enum, не через UI.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {RUBRICS.map((r) => (
          <article
            key={r.id}
            className={`rounded-2xl border p-5 ${r.toneClass}`}
          >
            <div className="mb-1 flex items-center gap-2">
              <h2 className="m-0 font-display text-lg font-extrabold">{r.label}</h2>
              <code className="rounded-pill border border-fence bg-night px-2 py-0.5 font-mono text-[10px] text-haze">
                {r.id}
              </code>
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
                  <li key={s.slug} className="flex items-start gap-2 text-[12.5px]">
                    <code className="font-mono text-[11px] text-haze">{s.slug}</code>
                    <span className="text-mist">— {s.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-3 grid gap-2 text-[11px] text-haze sm:grid-cols-2">
              <div>
                <span className="font-bold text-mist">Частота:</span> {r.cadence}
              </div>
              <div>
                <span className="font-bold text-mist">Бенчмарки:</span>{" "}
                {r.benchmarks.join(", ")}
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-fence bg-card p-4 text-[12.5px] text-mist">
        <p className="m-0">
          Полный документ:{" "}
          <code className="font-mono text-paper">docs/strategy/X10ContentArchitectureBrief.md</code>{" "}
          §1, §5.
        </p>
      </div>
    </>
  );
}
