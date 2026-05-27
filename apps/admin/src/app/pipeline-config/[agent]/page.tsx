import { ChevronLeft, Cpu, Power } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchAdminPipelineConfigByAgent, type PipelineAgent } from "@/lib/api";
import {
  findAgentMeta,
  isPipelineAgent,
  STATUS_COLOR,
  STATUS_LABEL,
  TIER_COLOR,
} from "../agent-meta";
import { updatePipelineConfig } from "../actions";
import { PipelineConfigForm } from "./pipeline-config-form";

export const metadata = { title: "Edit agent config — X10 Admin" };

export default async function EditPipelineConfigPage({
  params,
}: {
  params: Promise<{ agent: string }>;
}) {
  const { agent } = await params;
  if (!isPipelineAgent(agent)) notFound();

  const meta = findAgentMeta(agent);
  if (!meta) notFound();

  const config = await fetchAdminPipelineConfigByAgent(agent);
  if (!config) notFound();

  const updateAction = updatePipelineConfig.bind(null, agent as PipelineAgent);

  return (
    <>
      <header className="mb-6 border-b border-fence pb-5">
        <Link
          href="/pipeline-config"
          className="mb-3 inline-flex items-center gap-1 text-[12px] text-mist hover:text-paper"
        >
          <ChevronLeft size={14} strokeWidth={2} /> Все агенты
        </Link>
        <h1 className="m-0 flex items-center gap-2 font-display text-2xl font-extrabold">
          <Cpu size={22} strokeWidth={1.75} /> {meta.label}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="rounded-pill border border-fence bg-night px-2 py-0.5 font-mono text-[10px] text-haze">
            {meta.id}
          </code>
          <span
            className={`inline-block rounded-pill border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TIER_COLOR[meta.tier]}`}
          >
            {meta.tier}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-[10px] font-bold ${STATUS_COLOR[meta.status]}`}
          >
            <Power size={9} strokeWidth={2.5} />
            {STATUS_LABEL[meta.status]}
          </span>
        </div>
        <p className="mt-2.5 text-[13px] text-mist">{meta.description}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-haze">
          <span>
            <span className="font-bold text-mist">Default model:</span>{" "}
            <code className="font-mono">{meta.model}</code>
          </span>
          <span>
            <span className="font-bold text-mist">Trigger:</span> {meta.trigger}
          </span>
        </div>
      </header>

      <div className="rounded-xl border border-fence bg-card p-5">
        <PipelineConfigForm action={updateAction} defaults={config} />
      </div>
    </>
  );
}
