import { Cpu, Pencil, Power } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import {
  fetchAdminPipelineConfigs,
  type AdminPipelineConfig,
  type PipelineAgent,
} from "@/lib/api";
import {
  AGENTS,
  isPipelineAgent,
  STATUS_COLOR,
  STATUS_LABEL,
  TIER_COLOR,
} from "./agent-meta";

export const metadata = { title: "Pipeline config — X10 Admin" };

/**
 * Pipeline config — обзор 13 пунктов (12 агентов из CLAUDE.md §4 + HumanGate как
 * manual-step). Каждый агент enum-DB подгружает effective config из
 * /v1/admin/pipeline-config и показывает enabled / override / threshold + Edit
 * ссылку на /pipeline-config/[agent].
 *
 * HumanGate — без edit-ссылки (не агент, а UI-шаг редактора в admin queue).
 */
// Cache Components (Next 16): async fetch ДОЛЖЕН быть внутри <Suspense>.
export default function PipelineConfigPage() {
  return (
    <Suspense fallback={<PipelineConfigSkeleton />}>
      <PipelineConfigContent />
    </Suspense>
  );
}

function PipelineConfigSkeleton() {
  return <div className="h-96 animate-pulse rounded-2xl bg-card" />;
}

async function PipelineConfigContent() {
  const data = await fetchAdminPipelineConfigs();
  const byAgent = new Map<PipelineAgent, AdminPipelineConfig>();
  for (const c of data?.items ?? []) byAgent.set(c.agent, c);

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
          13 пунктов из CLAUDE.md §4. {shipped} работают · {scaffolded} scaffold ·{" "}
          {planned} запланированы.
        </p>
        <p className="mt-1 text-[12px] text-haze">
          Click «Изменить» — переопределить{" "}
          <code className="font-mono text-mist">enabled</code> /{" "}
          <code className="font-mono text-mist">model_override</code> /{" "}
          <code className="font-mono text-mist">confidence_threshold</code>. HumanGate — manual-step,
          не редактируется.
        </p>
      </header>

      <div className="grid gap-3">
        {AGENTS.map((a) => {
          const editableId = isPipelineAgent(a.id) ? a.id : null;
          const config = editableId ? byAgent.get(editableId) : undefined;
          return (
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
                {editableId && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-fence pt-2.5">
                    <ConfigChip config={config} />
                    <Link
                      href={`/pipeline-config/${editableId}`}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-pill border border-fence bg-night px-2.5 py-1 font-display text-[11px] font-semibold text-paper transition-colors hover:border-gold/60 hover:text-gold"
                    >
                      <Pencil size={11} strokeWidth={2} /> Изменить
                    </Link>
                  </div>
                )}
              </div>
            </article>
          );
        })}
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

/**
 * Чип effective-конфига: enabled state + override + threshold.
 * При отсутствии row (config=undefined) показывает schema-defaults inline.
 */
function ConfigChip({ config }: { config: AdminPipelineConfig | undefined }) {
  const enabled = config?.enabled ?? true;
  const override = config?.modelOverride ?? null;
  const threshold = config?.confidenceThreshold ?? "0.700";
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <span
        className={
          enabled
            ? "inline-flex items-center gap-1 rounded-pill border border-success/40 bg-success/[0.08] px-2 py-0.5 font-bold text-success"
            : "inline-flex items-center gap-1 rounded-pill border border-red/40 bg-red/[0.08] px-2 py-0.5 font-bold text-red"
        }
      >
        <Power size={9} strokeWidth={2.5} />
        {enabled ? "enabled" : "disabled"}
      </span>
      {override && (
        <span className="rounded-pill border border-gold/40 bg-gold/[0.06] px-2 py-0.5 font-mono text-gold">
          override: {override}
        </span>
      )}
      <span className="rounded-pill border border-fence bg-night px-2 py-0.5 font-mono text-haze">
        threshold {parseFloat(threshold).toFixed(2)}
      </span>
    </div>
  );
}
