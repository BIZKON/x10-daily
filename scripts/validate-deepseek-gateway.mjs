#!/usr/bin/env node
/**
 * Валид-гейт DeepSeek V4 Flash (session 23) — ПЕРЕД прод-включением модели.
 *
 * Зачем: V4 Flash — reasoning-модель (в пробе вернула reasoning_content). Наши
 * агенты (packages/agents/src/define-agent.ts) ходят через forced tool_choice +
 * JSON-schema с enum'ами. Риск: reasoning «съест» max_tokens до tool_call →
 * tool_calls пустой → агент бросит «модель не вернула function tool_call». Этот
 * скрипт воспроизводит наш формат запроса и проверяет, что:
 *   (1) HTTP 200 (DeepSeek оплачен на gateway — иначе 402);
 *   (2) tool_calls[0].function.arguments непустой (reasoning не задушил вывод);
 *   (3) arguments — валидный JSON;
 *   (4) enum (decision) соблюдён;
 *   (5) укладывается в таймаут агентов (60с).
 *
 * Запуск НА VM (там DeepSeek будет оплачен), из /opt/x10-daily:
 *   set -a && . ./.env.production && set +a && \
 *     node scripts/validate-deepseek-gateway.mjs deepseek/deepseek-v4-flash
 *
 * Без аргументов гоняет deepseek/deepseek-v4-flash + контроль
 * anthropic/claude-sonnet-4-6. Подкрутить лимит: VALIDATE_MAX_TOKENS=4096 node ...
 * Exit 0 = все PASS; 1 = есть FAIL; 2 = нет ключа.
 */

const BASE = (process.env.AI_GATEWAY_BASE_URL || "https://api.timeweb.ai/v1").replace(/\/$/, "");
const KEY = process.env.AI_GATEWAY_API_KEY;
const MAX_TOKENS = Number(process.env.VALIDATE_MAX_TOKENS || 2048);
const TIMEOUT_MS = 60_000;

if (!KEY) {
  console.error("AI_GATEWAY_API_KEY не задан в окружении. Запусти после `. ./.env.production`.");
  process.exit(2);
}

// Зеркало реального агента: forced tool_choice на одну функцию + JSON-schema с
// enum'ом (decision) — самое хрупкое место (session 18: gateway не энфорсит enum).
const TOOL = {
  type: "function",
  function: {
    name: "x10_emit_ingest",
    description: "Emit the ingest gate decision for a news item.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        decision: { type: "string", enum: ["accept", "reject", "duplicate"] },
        relevanceScore: { type: "number" },
        topic: { type: "string" },
      },
      required: ["decision", "relevanceScore", "topic"],
    },
  },
};

const SYSTEM =
  "Ты — гейт-агент делового новостного конвейера. Реши, брать ли новость в работу. " +
  "Ответь СТРОГО вызовом функции x10_emit_ingest, без свободного текста.";
const USER =
  "Новость: ЦБ РФ сохранил ключевую ставку 21%, бизнес ждёт смягчения во втором полугодии. " +
  "Релевантно ли это деловой аудитории предпринимателей?";

async function probe(model) {
  const t0 = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let res;
  let json;
  try {
    res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      signal: ctl.signal,
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: USER },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "x10_emit_ingest" } },
      }),
    });
    json = await res.json();
  } catch (e) {
    return { model, ok: false, reason: `сеть/таймаут: ${e.message}`, ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
  const ms = Date.now() - t0;
  if (!res.ok) {
    return { model, ok: false, reason: `HTTP ${res.status}: ${JSON.stringify(json).slice(0, 220)}`, ms };
  }
  const choice = json.choices?.[0];
  const toolCall = choice?.message?.tool_calls?.[0];
  const hasReasoning = Boolean(choice?.message?.reasoning_content);
  if (!toolCall?.function?.arguments) {
    return {
      model,
      ok: false,
      reason:
        `пустой tool_call (finish=${choice?.finish_reason}, reasoning_content=${hasReasoning}). ` +
        "Reasoning мог съесть max_tokens — попробуй VALIDATE_MAX_TOKENS=4096 или non-thinking-вариант.",
      ms,
      usage: json.usage,
    };
  }
  let args;
  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch {
    return { model, ok: false, reason: `arguments не JSON: ${toolCall.function.arguments.slice(0, 160)}`, ms };
  }
  if (!["accept", "reject", "duplicate"].includes(args.decision)) {
    return { model, ok: false, reason: `decision вне enum: ${JSON.stringify(args.decision)}`, ms };
  }
  return { model, ok: true, ms, args, usage: json.usage, hasReasoning };
}

const models = process.argv.slice(2);
if (models.length === 0) models.push("deepseek/deepseek-v4-flash", "anthropic/claude-sonnet-4-6");

console.log(`Gateway: ${BASE} · max_tokens=${MAX_TOKENS} · модели: ${models.join(", ")}\n`);

let allOk = true;
for (const m of models) {
  const r = await probe(m);
  if (r.ok) {
    console.log(
      `✅ ${m}: tool_call OK за ${r.ms}мс — decision=${r.args.decision}, score=${r.args.relevanceScore}` +
        `, reasoning_content=${r.hasReasoning}, usage=${JSON.stringify(r.usage)}`,
    );
  } else {
    allOk = false;
    console.error(`❌ ${m}: ${r.reason} (${r.ms}мс)`);
  }
}
console.log(allOk ? "\nИТОГ: PASS — можно включать модель в проде." : "\nИТОГ: FAIL — не включать до фикса.");
process.exit(allOk ? 0 : 1);
