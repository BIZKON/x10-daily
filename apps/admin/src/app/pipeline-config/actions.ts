"use server";

import {
  type AdminPipelineConfig,
  PIPELINE_AGENTS,
  type PipelineAgent,
  adminMutate,
} from "@/lib/api";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function isAgent(v: string): v is PipelineAgent {
  return (PIPELINE_AGENTS as readonly string[]).includes(v);
}

function parseForm(form: FormData) {
  const enabled = form.get("enabled") === "on";
  const rawOverride = String(form.get("modelOverride") ?? "").trim();
  const modelOverride = rawOverride === "" ? null : rawOverride;
  const thresholdRaw = String(form.get("confidenceThreshold") ?? "").trim();
  const confidenceThreshold = Number(thresholdRaw);
  if (!Number.isFinite(confidenceThreshold)) {
    throw new Error("confidenceThreshold должен быть числом");
  }
  if (confidenceThreshold < 0 || confidenceThreshold > 1) {
    throw new Error("confidenceThreshold вне диапазона 0..1");
  }
  return { enabled, modelOverride, confidenceThreshold };
}

export async function updatePipelineConfig(agent: string, form: FormData) {
  if (!isAgent(agent)) throw new Error(`Неизвестный agent: ${agent}`);
  const body = parseForm(form);
  const res = await adminMutate<AdminPipelineConfig>(
    "PUT",
    `/v1/admin/pipeline-config/${encodeURIComponent(agent)}`,
    body,
  );
  if (!res.ok) throw new Error(`Не удалось сохранить: ${res.error}`);
  revalidatePath("/pipeline-config");
  revalidatePath(`/pipeline-config/${agent}`);
  redirect("/pipeline-config");
}
