import { Cpu, Power } from "lucide-react";

export const metadata = { title: "Pipeline config — X10 Admin" };

/**
 * Pipeline config — обзор 12 агентов из CLAUDE.md §4.
 *
 * Соответствует таблице `pipeline_config` в schema (см. packages/db/src/schema/pipeline.ts).
 * Сейчас read-only — показывает что сделано, тиром модели, триггер.
 *
 * CRUD (enabled toggle, model override, confidence threshold) — следующий заход,
 * когда подключим apps/api endpoint /v1/admin/pipeline-config к этой странице.
 */

type AgentTier = "OPUS" | "SONNET" | "HAIKU" | "EXTERNAL";
type AgentStatus = "shipped" | "scaffolded" | "planned";

type Agent = {
  num: string;
  id: string;
  label: string;
  tier: AgentTier;
  model: string;
  trigger: string;
  status: AgentStatus;
  description: string;
};

const TIER_COLOR: Record<AgentTier, string> = {
  OPUS: "text-red bg-red/[0.06] border-red/30",
  SONNET: "text-gold bg-gold/[0.06] border-gold/30",
  HAIKU: "text-success bg-success/[0.06] border-success/30",
  EXTERNAL: "text-mist bg-fence/30 border-fence",
};

const STATUS_COLOR: Record<AgentStatus, string> = {
  shipped: "text-success bg-success/[0.06] border-success/40",
  scaffolded: "text-gold bg-gold/[0.06] border-gold/40",
  planned: "text-haze bg-fence/30 border-fence",
};

const STATUS_LABEL: Record<AgentStatus, string> = {
  shipped: "✓ работает",
  scaffolded: "⊙ scaffold",
  planned: "○ план",
};

const AGENTS: Agent[] = [
  {
    num: "01",
    id: "ingest",
    label: "IngestAgent",
    tier: "HAIKU",
    model: "claude-haiku-4-5",
    trigger: "06:00 МСК cron / source.item.received event",
    status: "shipped",
    description:
      "Парсит RSS/API item, классифицирует в category/template/tags, фильтр инфобиза/спама, флаг political.",
  },
  {
    num: "02",
    id: "draft",
    label: "DraftAgent",
    tier: "SONNET",
    model: "claude-sonnet-4-6",
    trigger: "after ingest",
    status: "shipped",
    description:
      "Smart Brevity 6-block draft. Template-aware: card-news / deep-dive / daily-take / guide.",
  },
  {
    num: "03",
    id: "numbers",
    label: "NumbersAgent",
    tier: "HAIKU",
    model: "claude-haiku-4-5",
    trigger: "parallel to Draft",
    status: "shipped",
    description: "Извлекает все цифры, проверяет источник, форматирует JetBrains Mono.",
  },
  {
    num: "04",
    id: "factcheck",
    label: "FactCheckAgent",
    tier: "OPUS",
    model: "claude-opus-4-7",
    trigger: "political topics only",
    status: "shipped",
    description:
      "Cross-source verification, halt-on-disagreement. Запускается если event.political=true.",
  },
  {
    num: "05",
    id: "tov",
    label: "ToVAgent",
    tier: "SONNET",
    model: "claude-sonnet-4-6",
    trigger: "after Draft+Numbers",
    status: "shipped",
    description:
      "Применяет voice.md + about-author-{name}.md + blacklist ~30 слов (инфобиз-лексика).",
  },
  {
    num: "06",
    id: "brevity",
    label: "BrevityAgent",
    tier: "SONNET",
    model: "claude-sonnet-4-6",
    trigger: "after ToV",
    status: "shipped",
    description: "Per-template лимиты: card-news ≤300 слов, deep-dive ≤2000, daily-take ≤200.",
  },
  {
    num: "07",
    id: "audio",
    label: "AudioAgent",
    tier: "EXTERNAL",
    model: "ElevenLabs via WS-proxy",
    trigger: "optional · after HumanGate publish",
    status: "planned",
    description: "5-8 мин аудио-версия для подкаста. Требует deployment WS-proxy на Render.",
  },
  {
    num: "08",
    id: "humangate",
    label: "HumanGate",
    tier: "EXTERNAL",
    model: "—",
    trigger: "после всех 1-6 + factcheck (если)",
    status: "shipped",
    description:
      "UI в apps/admin (Очередь к публикации). Редактор смотрит scorecard, нажимает Publish.",
  },
  {
    num: "09",
    id: "hookgen",
    label: "HookGenAgent",
    tier: "HAIKU",
    model: "claude-haiku-4-5",
    trigger: "after Brevity (parallel с Social/Score)",
    status: "shipped",
    description:
      "6 паттернов хуков: number-led, contrarian, transformation, authority, admission, future-shock.",
  },
  {
    num: "10",
    id: "social",
    label: "SocialAmplifyAgent",
    tier: "SONNET",
    model: "claude-sonnet-4-6",
    trigger: "after Brevity",
    status: "shipped",
    description:
      "Конвертирует в TG-Рыбакова / TG-X10 / VK / Дзен / LinkedIn. Frameworks: PAS/AIDA/BAB/STAR/SLAY.",
  },
  {
    num: "11",
    id: "visual",
    label: "VisualAgent",
    tier: "EXTERNAL",
    model: "Gemini 2.5 Flash via proxy",
    trigger: "feature flag · viral-friendly",
    status: "planned",
    description: "Инфографика для топ-статей. Требует Gemini API ключ + промпт-шаблоны.",
  },
  {
    num: "12",
    id: "score",
    label: "ScoreAgent (weekly)",
    tier: "SONNET",
    model: "claude-sonnet-4-6",
    trigger: "weekly cron Mon 09:00 МСК",
    status: "shipped",
    description:
      "Парсит engagement из PostHog, hook pattern ranking, до 5 config-рекомендаций с rationale.",
  },
  {
    num: "13",
    id: "newsletter",
    label: "NewsletterAssembleAgent",
    tier: "SONNET",
    model: "claude-sonnet-4-6",
    trigger: "06:00 МСК daily",
    status: "shipped",
    description:
      "Собирает выпуск из 7 секций (Главное/Цифры/Кто и что/...). A/B subject через HookGen.",
  },
];

export default function PipelineConfigPage() {
  const shipped = AGENTS.filter((a) => a.status === "shipped").length;
  const planned = AGENTS.filter((a) => a.status === "planned").length;
  const scaffolded = AGENTS.filter((a) => a.status === "scaffolded").length;

  return (
    <>
      <header className="mb-6 border-b border-fence pb-5">
        <h1 className="m-0 flex items-center gap-2 font-display text-2xl font-extrabold">
          <Cpu size={22} strokeWidth={1.75} /> Pipeline config
        </h1>
        <p className="mt-1.5 text-[13px] text-mist">
          13 агентов из CLAUDE.md §4. {shipped} работают · {scaffolded} scaffold ·{" "}
          {planned} запланированы.
        </p>
        <p className="mt-1 text-[12px] text-haze">
          Read-only обзор. Edit (toggle enabled, model override, confidence threshold) подключим
          к таблице{" "}
          <code className="font-mono text-mist">pipeline_config</code> следующим заходом.
        </p>
      </header>

      <div className="grid gap-3">
        {AGENTS.map((a) => (
          <article
            key={a.id}
            className="flex items-start gap-4 rounded-xl border border-fence bg-card p-4"
          >
            <span className="x10-num shrink-0 font-display text-2xl font-extrabold text-haze">
              {a.num}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="m-0 font-display text-[15px] font-extrabold">{a.label}</h3>
                <code className="rounded-pill border border-fence bg-night px-2 py-0.5 font-mono text-[10px] text-haze">
                  {a.id}
                </code>
                <span
                  className={`inline-block rounded-pill border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TIER_COLOR[a.tier]}`}
                >
                  {a.tier}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-[10px] font-bold ${STATUS_COLOR[a.status]}`}
                >
                  <Power size={9} strokeWidth={2.5} />
                  {STATUS_LABEL[a.status]}
                </span>
              </div>
              <p className="m-0 mt-1.5 text-[12.5px] text-mist">{a.description}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-haze">
                <span>
                  <span className="font-bold text-mist">Model:</span>{" "}
                  <code className="font-mono">{a.model}</code>
                </span>
                <span>
                  <span className="font-bold text-mist">Trigger:</span> {a.trigger}
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-fence bg-card p-4 text-[12.5px] text-mist">
        <p className="m-0">
          Источник правды:{" "}
          <code className="font-mono text-paper">packages/agents/src/agents/</code> ·{" "}
          <code className="font-mono text-paper">apps/workers/pipeline/src/inngest/functions/</code>{" "}
          · CLAUDE.md §4.
        </p>
      </div>
    </>
  );
}
