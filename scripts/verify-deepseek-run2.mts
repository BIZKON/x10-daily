/**
 * Лёгкая валидация v4-flash: safety-путь FactCheck (не дошёл в полном прогоне) +
 * ToV на политическом черновике (2-й diverse-вход). Кэш gateway обходим уникальным
 * маркером в topicContext каждую итерацию. session 24.
 */
import {
  BrevityAgent,
  DraftAgent,
  FactCheckAgent,
  ToVAgent,
  type AgentContext,
} from "@x10/agents";

const MODEL = "deepseek/deepseek-v4-flash";
const ctx: AgentContext = {
  apiKey: process.env.AI_GATEWAY_API_KEY!,
  baseURL: process.env.AI_GATEWAY_BASE_URL || "https://api.timeweb.ai/v1",
  models: { OPUS: MODEL, SONNET: MODEL, HAIKU: MODEL },
};

const sourcesPol = [
  {
    publishedAt: "2026-06-10T06:30:00.000Z",
    publisher: "Интерфакс",
    title: "Минфин обсуждает бюджетный маневр на 2027 год",
    url: "https://www.interfax.ru/business/example",
  },
];

async function main() {
  console.log(`FactCheck-валидация ${MODEL} (safety-путь)\n`);

  // Черновик с НАМЕРЕННО неподтверждённым high-stake утверждением (источник один,
  // цифры не из него) — FactCheck должен это поймать (halt или unsupported).
  const draftPol = {
    topic: "Минфин готовит бюджетный маневр на 2027 год",
    context:
      "Минфин РФ рассматривает перераспределение расходов бюджета на 2027 год. Дефицит может вырасти до 3,2 трлн руб, а расходы на оборону — на 18%. Источник — один, конкретные цифры официально не подтверждены.",
    sources: sourcesPol,
    section: "main" as const,
    template: "card-news" as const,
  };

  const t0 = Date.now();
  const d = await DraftAgent.run(draftPol as never, ctx);
  console.log(`draft(pol): OK ${Date.now() - t0}ms`);

  const t1 = Date.now();
  const tv = await ToVAgent.run({ draft: d.output as never, authorName: null } as never, ctx);
  const revised = (tv.output as { revised: string; changes: unknown[] }).revised;
  console.log(`tov(pol diverse): OK ${Date.now() - t1}ms changes=${(tv.output as { changes: unknown[] }).changes.length}`);

  const t2 = Date.now();
  const br = await BrevityAgent.run({ revised, template: "card-news" } as never, ctx);
  const compressed = (br.output as { compressed: string }).compressed;
  console.log(`brevity(pol): OK ${Date.now() - t2}ms ${compressed.length}ch\n`);

  // FactCheck ×3 — уникальный маркер обходит кэш → 3 независимых генерации.
  for (let i = 0; i < 3; i++) {
    const start = Date.now();
    try {
      const fc = await FactCheckAgent.run(
        {
          draft: compressed,
          sources: sourcesPol,
          topicContext: draftPol.context + ` [проверка #${i + 1}-${Date.now()}]`,
        } as never,
        ctx,
      );
      const o = fc.output as { status: string; verdict: string; confidence: string; haltReason?: string };
      console.log(
        `factcheck[${i + 1}/3]: OK ${Date.now() - start}ms status=${o.status} verdict=${o.verdict} conf=${o.confidence}` +
          (o.haltReason ? ` halt="${o.haltReason.slice(0, 90)}"` : ""),
      );
    } catch (e) {
      console.log(`factcheck[${i + 1}/3]: FAIL ${Date.now() - start}ms ${(e instanceof Error ? e.message : String(e)).slice(0, 140)}`);
    }
  }

  console.log("\nВЫВОД: если все factcheck вернули валидные enum-значения (status/verdict/confidence) и halt по делу — safety-путь на v4-flash рабочий.");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
