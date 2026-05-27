/**
 * Статическая метадата 13 пунктов pipeline (CLAUDE.md §4).
 *
 * Эта таблица — источник правды для UI labels/descriptions/triggers.
 * Effective конфиг (enabled/override/threshold) приходит из БД pipeline_config.
 *
 * id совпадает с PipelineAgent enum для 12 редактируемых пунктов.
 * humangate — особый: manual-step редактора, не агент, не редактируется.
 */
import { PIPELINE_AGENTS, type PipelineAgent } from "@/lib/api";

export type AgentTier = "OPUS" | "SONNET" | "HAIKU" | "EXTERNAL";
export type AgentStatus = "shipped" | "scaffolded" | "planned";

export type AgentMeta = {
  num: string;
  id: string;
  label: string;
  tier: AgentTier;
  model: string;
  trigger: string;
  status: AgentStatus;
  description: string;
};

export const TIER_COLOR: Record<AgentTier, string> = {
  OPUS: "text-red bg-red/[0.06] border-red/30",
  SONNET: "text-gold bg-gold/[0.06] border-gold/30",
  HAIKU: "text-success bg-success/[0.06] border-success/30",
  EXTERNAL: "text-mist bg-fence/30 border-fence",
};

export const STATUS_COLOR: Record<AgentStatus, string> = {
  shipped: "text-success bg-success/[0.06] border-success/40",
  scaffolded: "text-gold bg-gold/[0.06] border-gold/40",
  planned: "text-haze bg-fence/30 border-fence",
};

export const STATUS_LABEL: Record<AgentStatus, string> = {
  shipped: "✓ работает",
  scaffolded: "⊙ scaffold",
  planned: "○ план",
};

export const AGENTS: AgentMeta[] = [
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

export function isPipelineAgent(id: string): id is PipelineAgent {
  return (PIPELINE_AGENTS as readonly string[]).includes(id);
}

export function findAgentMeta(id: PipelineAgent): AgentMeta | undefined {
  return AGENTS.find((a) => a.id === id);
}
