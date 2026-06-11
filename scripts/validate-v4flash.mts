/**
 * Валидация deepseek/deepseek-v4-flash на РЕАЛЬНЫХ агентах перед сменой прод-модели
 * (session 24). Прогоняет ту же цепочку, что draft-article, с override всех tier'ов
 * на v4-flash. Точка исторического слома — ToV (вложенный changes[]) → гоняем ×5.
 * FactCheck (safety) ×3 на политике — проверяем валидные enum'ы + halt-логику.
 *
 *   docker cp scripts/validate-v4flash.mts x10-daily-pipeline-1:/app/apps/workers/pipeline/_val.mts
 *   docker exec -w /app/apps/workers/pipeline x10-daily-pipeline-1 node --import tsx _val.mts
 */
import {
  type AgentContext,
  BrevityAgent,
  DraftAgent,
  FactCheckAgent,
  HookGenAgent,
  NumbersAgent,
  PreviewScoreAgent,
  SocialAmplifyAgent,
  ToVAgent,
} from "@x10/agents";
import { serializeDraftForNumbers } from "./src/persist";

const MODEL = "deepseek/deepseek-v4-flash";
const ctx: AgentContext = {
  apiKey: process.env.AI_GATEWAY_API_KEY!,
  baseURL: process.env.AI_GATEWAY_BASE_URL || "https://api.timeweb.ai/v1",
  models: { OPUS: MODEL, SONNET: MODEL, HAIKU: MODEL },
};

const sourcesBiz = [
  {
    publishedAt: "2026-06-10T06:00:00.000Z",
    publisher: "РБК",
    title: "Сбер запустил ГигаЧат с генерацией изображений",
    url: "https://www.rbc.ru/technology_and_media/10/06/2026/example",
  },
];
const sourcesPol = [
  {
    publishedAt: "2026-06-10T06:30:00.000Z",
    publisher: "Интерфакс",
    title: "Минфин обсуждает новый бюджетный маневр на 2027 год",
    url: "https://www.interfax.ru/business/example",
  },
];

const evBiz = {
  topic: "Сбер обновил ГигаЧат: генерация и редактирование изображений на Kandinsky 6.0",
  context:
    "Сбер добавил в ГигаЧат генерацию изображений по нескольким фото, точечное редактирование и автоподбор формата на базе Kandinsky 6.0. Для контент-команд — меньше зависимости от Midjourney/зарубежных сервисов с санкционными рисками.",
  sources: sourcesBiz,
  section: "main" as const,
  template: "card-news" as const,
};
const evPol = {
  topic: "Минфин обсуждает бюджетный маневр на 2027 год",
  context:
    "Минфин РФ рассматривает перераспределение расходов бюджета на 2027 год с возможным ростом дефицита. Конкретные цифры и решения не утверждены; источник — один.",
  sources: sourcesPol,
  section: "main" as const,
  template: "card-news" as const,
};

type Tally = { ok: number; fail: number; errors: string[] };
const t = (): Tally => ({ ok: 0, fail: 0, errors: [] });
async function tryRun(name: string, tally: Tally, fn: () => Promise<unknown>) {
  const start = Date.now();
  try {
    const r = await fn();
    tally.ok++;
    return { r, ms: Date.now() - start };
  } catch (e) {
    tally.fail++;
    const msg = e instanceof Error ? e.message : String(e);
    tally.errors.push(msg.slice(0, 160));
    return { r: null, ms: Date.now() - start };
  }
}

async function main() {
  console.log(`Валидация ${MODEL} на реальных агентах\n`);
  const tallies: Record<string, Tally> = {
    draft: t(),
    numbers: t(),
    tov: t(),
    brevity: t(),
    factcheck: t(),
    hookgen: t(),
    social: t(),
    score: t(),
  };

  // --- A. Non-political цепочка ---
  console.log("=== A. Non-political (Сбер ГигаЧат) ===");
  const d = await tryRun("draft", tallies.draft, () => DraftAgent.run(evBiz as never, ctx));
  const draft = (d.r as { output: unknown } | null)?.output;
  console.log(
    `draft: ${d.r ? "OK" : "FAIL"} ${d.ms}ms ${draft ? "tease=" + JSON.stringify((draft as { tease?: string }).tease)?.slice(0, 80) : tallies.draft.errors.at(-1)}`,
  );

  if (draft) {
    const nb = await tryRun("numbers", tallies.numbers, () =>
      NumbersAgent.run(
        { text: serializeDraftForNumbers(draft as never), sources: sourcesBiz } as never,
        ctx,
      ),
    );
    console.log(
      `numbers: ${nb.r ? "OK" : "FAIL"} ${nb.ms}ms ${nb.r ? "" : tallies.numbers.errors.at(-1)}`,
    );

    // ToV ×5 — историческая точка слома (вложенный changes[])
    let lastRevised: string | null = null;
    for (let i = 0; i < 5; i++) {
      const tv = await tryRun("tov", tallies.tov, () =>
        ToVAgent.run({ draft: draft as never, authorName: null } as never, ctx),
      );
      const out = (tv.r as { output?: { revised?: string; changes?: unknown[] } } | null)?.output;
      if (out?.revised) lastRevised = out.revised;
      console.log(
        `tov[${i + 1}/5]: ${tv.r ? "OK" : "FAIL"} ${tv.ms}ms ${out ? `changes=${out.changes?.length}` : tallies.tov.errors.at(-1)}`,
      );
    }

    if (lastRevised) {
      const br = await tryRun("brevity", tallies.brevity, () =>
        BrevityAgent.run({ revised: lastRevised, template: "card-news" } as never, ctx),
      );
      const compressed = (br.r as { output?: { compressed?: string } } | null)?.output?.compressed;
      console.log(
        `brevity: ${br.r ? "OK" : "FAIL"} ${br.ms}ms ${compressed ? `${compressed.length}ch` : tallies.brevity.errors.at(-1)}`,
      );

      if (compressed) {
        const hg = await tryRun("hookgen", tallies.hookgen, () =>
          HookGenAgent.run({ draft: compressed, channel: "tg-x10" } as never, ctx),
        );
        console.log(
          `hookgen: ${hg.r ? "OK" : "FAIL"} ${hg.ms}ms ${hg.r ? "" : tallies.hookgen.errors.at(-1)}`,
        );
        const so = await tryRun("social", tallies.social, () =>
          SocialAmplifyAgent.run(
            { draft: compressed, channel: "tg-x10", authorName: null } as never,
            ctx,
          ),
        );
        const post = (so.r as { output?: { post?: string } } | null)?.output?.post;
        console.log(
          `social: ${so.r ? "OK" : "FAIL"} ${so.ms}ms post[0:90]=${JSON.stringify(post?.slice(0, 90))}`,
        );
        const sc = await tryRun("score", tallies.score, () =>
          PreviewScoreAgent.run({ draft: compressed } as never, ctx),
        );
        console.log(
          `score: ${sc.r ? "OK" : "FAIL"} ${sc.ms}ms ${sc.r ? "" : tallies.score.errors.at(-1)}`,
        );
      }
    }
  }

  // --- B. Political + FactCheck ×3 ---
  console.log("\n=== B. Political (Минфин) → FactCheck ×3 ===");
  const dp = await tryRun("draft", tallies.draft, () => DraftAgent.run(evPol as never, ctx));
  const draftP = (dp.r as { output?: unknown } | null)?.output;
  console.log(`draft(pol): ${dp.r ? "OK" : "FAIL"} ${dp.ms}ms`);
  if (draftP) {
    const tvP = await tryRun("tov", tallies.tov, () =>
      ToVAgent.run({ draft: draftP as never, authorName: null } as never, ctx),
    );
    const revisedP = (tvP.r as { output?: { revised?: string } } | null)?.output?.revised;
    const brP = revisedP
      ? await tryRun("brevity", tallies.brevity, () =>
          BrevityAgent.run({ revised: revisedP, template: "card-news" } as never, ctx),
        )
      : null;
    const compressedP =
      (brP?.r as { output?: { compressed?: string } } | null)?.output?.compressed ??
      revisedP ??
      evPol.context;
    for (let i = 0; i < 3; i++) {
      const fc = await tryRun("factcheck", tallies.factcheck, () =>
        FactCheckAgent.run(
          { draft: compressedP, sources: sourcesPol, topicContext: evPol.context } as never,
          ctx,
        ),
      );
      const out = (
        fc.r as {
          output?: { status?: string; verdict?: string; confidence?: string; haltReason?: string };
        } | null
      )?.output;
      console.log(
        `factcheck[${i + 1}/3]: ${fc.r ? "OK" : "FAIL"} ${fc.ms}ms ${out ? `status=${out.status} verdict=${out.verdict} conf=${out.confidence}` : tallies.factcheck.errors.at(-1)}`,
      );
    }
  }

  console.log("\n=== ИТОГ (ok/всего) ===");
  for (const [k, v] of Object.entries(tallies)) {
    console.log(
      `${k.padEnd(10)} ${v.ok}/${v.ok + v.fail}${v.errors.length ? "  ⚠ " + v.errors[0] : ""}`,
    );
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
