import {
  type AgentContext,
  type AgentResult,
  BrevityAgent,
  DraftAgent,
  FactCheckAgent,
  HookGenAgent,
  NumbersAgent,
  PreviewScoreAgent,
  SocialAmplifyAgent,
  ToVAgent,
  createMasker,
} from "@x10/agents";
import { channels, createDb } from "@x10/db";
import { NonRetriableError } from "inngest";
import type { PipelineBindings } from "../../bindings";
import { loadPipelineEnv } from "../../env";
import { modelsFromEnv } from "../../lib/agent-context";
import { DEFAULT_SECTION, DEFAULT_TEMPLATE, topicIngestedEvent } from "../../events";
import { getTodaySpendUsd, mskDayString, recordRun } from "../../lib/cost-ledger";
import { deliverOpsAlert } from "../../lib/ops-alert";
import { cleanPostText } from "../../lib/text";
import {
  MIN_RUSSIAN_RATIO,
  persistArticle,
  russianRatio,
  serializeDraftForNumbers,
} from "../../persist";
import type { PipelineInngest } from "../client";

/**
 * Pipeline DRAFT → (NUMBERS ∥ TOV) → BREVITY → [FACTCHECK if political] → (HOOKGEN ∥ SOCIAL ∥ SCORE ∥ PERSIST).
 * FactCheck шаг условный — запускается только если event.data.political === true.
 * Если FactCheck вернул status="halt" — функция бросает; статья не публикуется.
 */
export function createDraftArticleFunction(inngest: PipelineInngest, bindings: PipelineBindings) {
  return inngest.createFunction(
    {
      id: "draft-article",
      name: "Draft article from ingested topic",
      triggers: [{ event: topicIngestedEvent }],
      retries: 2,
      concurrency: { limit: 5 },
      // MEDIUM-4: cost-runaway protection. 50 запусков/час — потолок ~$22.50/час
      // даже если C2 (auth) обойдут или бот зальёт events напрямую в Inngest.
      // Дневной $-потолок (DAILY_BUDGET_USD) — budget-gate ниже (sum
      // pipeline_runs.cost_usd за календарный день МСК). Два независимых контура.
      rateLimit: { limit: 50, period: "1h" },
    },
    async ({ event, step }) => {
      const env = loadPipelineEnv(bindings);
      const apiKey = env.AI_GATEWAY_API_KEY ?? env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          "Ни AI_GATEWAY_API_KEY (Timeweb primary), ни ANTHROPIC_API_KEY (legacy direct) не задан — pipeline не запустится. " +
            "См. CLAUDE.md §7.",
        );
      }

      // Один мемоизированный timestamp на весь ран (audit L6): и budget-gate
      // (день расхода), и алерты (день claim) считают МСК-день от одного `now`,
      // иначе на границе полуночи МСК claim осядет не на тот день.
      const nowMs = await step.run("now", async () => Date.now());
      const now = new Date(nowMs);

      // $-budget hard cap (session 20 hardening). Суммируем расход за
      // календарный день МСК (pipeline_runs.cost_usd) ДО запуска агентов. При
      // достижении потолка — НЕ драфтим (агенты ~$0.45 не запускаются), шлём
      // exhausted-алерт (один раз в день) и выходим. Это «бурст не съест
      // бюджет». Лимит проверяется здесь, в самой дорогой точке → ловит и cron,
      // и ручные events, и обход auth — как и rateLimit ниже. Дешёвый
      // IngestAgent-гейт (process-source-item) продолжает работать.
      const budget = await step.run("budget-gate", async () => {
        const db = createDb(env.DATABASE_URL);
        const spentUsd = await getTodaySpendUsd(db, now);
        return { spentUsd };
      });
      if (budget.spentUsd >= env.DAILY_BUDGET_USD) {
        await step.run("budget-exhausted-alert", async () => {
          const db = createDb(env.DATABASE_URL);
          const message =
            `🛑 X10 pipeline: дневной бюджет исчерпан — $${budget.spentUsd.toFixed(2)} ≥ cap $${env.DAILY_BUDGET_USD}. ` +
            "Драфт статей остановлен до полуночи МСК. Гейт (Haiku) продолжает работать.";
          // M4: claim + быстрая попытка доставки. Провал send → строка остаётся
          // в очереди, cron retry-ops-alerts дослыает (алерт не теряется молча).
          return deliverOpsAlert(db, env, {
            day: mskDayString(now),
            kind: "exhausted",
            spendUsd: budget.spentUsd,
            message,
          });
        });
        return {
          skipped: true as const,
          reason: "daily-budget-exceeded" as const,
          spentUsd: budget.spentUsd,
          capUsd: env.DAILY_BUDGET_USD,
        };
      }

      const masker = createMasker(env);
      const ctx: AgentContext = {
        apiKey,
        baseURL: env.AI_GATEWAY_BASE_URL,
        masker,
        models: modelsFromEnv(env),
      };

      // $-ledger failed-учёт (audit M2): агенты биллятся по факту, но если ШАГ
      // упал финально (5xx / ZodError / таймаут / пустой-усечённый JSON reasoning-
      // модели) после ретраев Inngest — стоимость УЖЕ отработавших агентов была
      // невидима дневному потолку (его обход, как halt до M1). Копим результаты
      // успевших шагов в `billed`; в catch ниже пишем строку status='failed' с их
      // суммой ДО ре-throw (record-before-rethrow, как record-run-halted).
      //
      // КОНТРАКТ: push делаем на РЕЗОЛВЕ step.run (свежий вызов ИЛИ мемоизированный
      // реплей после исчерпания ретраев), а не внутри callback — на реплее callback
      // не исполняется, Inngest отдаёт сохранённый результат. Поэтому bill()
      // оборачивает РЕЗУЛЬТАТ, а параллельные шаги — через .then(bill), чтобы
      // выживший сосед попал в `billed` даже когда его пара в Promise.all упала.
      //
      // ИЗВЕСТНЫЙ недоучёт (ограничен ~стоимостью одного агента): usage САМОГО
      // упавшего шага теряется (define-agent бросает ДО возврата AgentResult, а
      // StepError через step-границу несёт только name/message/stack/cause — кастом-
      // поля стираются). Для reasoning-провала это может быть до ~$0.02 (wasted
      // retry + усечённый вывод). Доминанта расхода — успевшие агенты — учтена.
      const billed: AgentResult<unknown>[] = [];
      const bill = <T extends AgentResult<unknown>>(r: T): T => {
        billed.push(r);
        return r;
      };
      // halt/success пишут свою строку ledger сами → catch не должен дублировать.
      let outcomeRecorded = false;

      try {
        const draft = bill(
          await step.run("draft", () =>
            DraftAgent.run(
              {
                topic: event.data.topic,
                context: event.data.context,
                sources: event.data.sources,
                section: event.data.section ?? DEFAULT_SECTION,
                template: event.data.template ?? DEFAULT_TEMPLATE,
                subcategory: event.data.subcategory,
              },
              ctx,
            ),
          ),
        );

        // ⚠️ ЯЗЫКОВОЙ ГЕЙТ (жёсткое правило «только русский»). Англоязычные источники
        // иногда дают английский драфт (DraftAgent эхо-ит язык источника). Считаем
        // долю кириллицы по всему драфту; ниже порога → НЕ продолжаем дорогую цепочку
        // (numbers/tov/brevity/...) и НЕ публикуем. Дешёвый ранний halt: записываем
        // расход draft в ledger и ВЫХОДИМ (return, не throw → без ретраев, иначе
        // 3× draft на тот же английский источник).
        const ruRatio = russianRatio(draft.output);
        if (ruRatio < MIN_RUSSIAN_RATIO) {
          // Видимость (ревью s26): попадает в логи pipeline + Sentry. Сигнал, что
          // RSS-источник деградировал (много англ.) ИЛИ правило «только русский» в
          // промпте перестало работать (напр. после смены модели). Мониторить:
          // pipeline_runs WHERE output->>'haltReason'='non-russian-draft'.
          console.warn(
            `[language-gate] draft отклонён: не русский (кириллица ${(ruRatio * 100).toFixed(0)}% < ${MIN_RUSSIAN_RATIO * 100}%), tease="${draft.output.tease.slice(0, 80)}"`,
          );
          await step.run("record-run-nonrussian", async () => {
            const db = createDb(env.DATABASE_URL);
            await recordRun(db, {
              articleId: null,
              agent: "draft",
              status: "halted",
              costUsd: draft.costUsd,
              modelUsed: draft.modelUsed,
              inputTokens: draft.usage?.inputTokens ?? 0,
              outputTokens: draft.usage?.outputTokens ?? 0,
              cachedInputTokens: draft.usage?.cachedInputTokens ?? 0,
              output: {
                halted: true,
                haltReason: "non-russian-draft",
                russianRatio: ruRatio,
                tease: draft.output.tease.slice(0, 120),
              },
            });
          });
          // Строка расхода записана этим путём → внешний catch не должен писать
          // failed (как record-run-halted и success-путь). Возврат, не throw → без ретраев.
          outcomeRecorded = true;
          return {
            skipped: true as const,
            reason: "non-russian-draft" as const,
            russianRatio: ruRatio,
            tease: draft.output.tease,
          };
        }

        const [numbers, tov] = await Promise.all([
          step
            .run("numbers", () =>
              NumbersAgent.run(
                {
                  text: serializeDraftForNumbers(draft.output),
                  sources: event.data.sources,
                },
                ctx,
              ),
            )
            .then(bill),
          step
            .run("tov", () =>
              ToVAgent.run(
                {
                  draft: draft.output,
                  authorName: event.data.authorName ?? null,
                },
                ctx,
              ),
            )
            .then(bill),
        ]);

        const brevity = bill(
          await step.run("brevity", () =>
            BrevityAgent.run(
              {
                revised: tov.output.revised,
                template: event.data.template ?? DEFAULT_TEMPLATE,
              },
              ctx,
            ),
          ),
        );

        // Опциональный FactCheck для политических тем.
        // Inngest jsonify-ит результаты step.run, поэтому используем ReturnType вместо AgentResult.
        type FactCheckStep = Awaited<ReturnType<typeof FactCheckAgent.run>>;
        let factcheck: FactCheckStep | null = null;
        if (event.data.political === true) {
          const fc = bill(
            (await step.run("factcheck", () =>
              FactCheckAgent.run(
                {
                  draft: brevity.output.compressed,
                  sources: event.data.sources,
                  topicContext: event.data.context,
                },
                ctx,
              ),
            )) as FactCheckStep,
          );
          if (fc.output.status === "halt") {
            // audit M1: halt — штатный исход на политике, но draft+numbers+tov+
            // brevity+factcheck(Opus) УЖЕ потрачены. Пишем строку расхода ДО throw
            // (record-before-branch, как reject в process-source-item), иначе
            // halt-стоимость невидима для дневного потолка → его обход.
            const halted = [draft, numbers, tov, brevity, fc];
            const haltCost = halted.reduce((s, r) => s + r.costUsd, 0);
            const haltUsage = halted.reduce(
              (a, r) => ({
                inputTokens: a.inputTokens + (r.usage?.inputTokens ?? 0),
                outputTokens: a.outputTokens + (r.usage?.outputTokens ?? 0),
                cachedInputTokens: a.cachedInputTokens + (r.usage?.cachedInputTokens ?? 0),
              }),
              { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
            );
            await step.run("record-run-halted", async () => {
              const db = createDb(env.DATABASE_URL);
              await recordRun(db, {
                articleId: null,
                agent: "draft",
                status: "halted",
                costUsd: haltCost,
                modelUsed: draft.modelUsed,
                inputTokens: haltUsage.inputTokens,
                outputTokens: haltUsage.outputTokens,
                cachedInputTokens: haltUsage.cachedInputTokens,
                output: { halted: true, haltReason: fc.output.haltReason },
              });
            });
            // Строка расхода записана — catch ниже НЕ должен писать ещё и failed.
            outcomeRecorded = true;
            // NonRetriableError, а не обычный Error: halt — штатный детерминированный
            // исход (противоречия в источниках), ретраить его бессмысленно. Простой
            // Error Inngest считает retriable → при retries:2 он бы реплеил все
            // мемоизированные шаги и снова доходил до throw 2 раза впустую, а ран
            // висел бы в дашборде как несколько failed-попыток. NonRetriableError
            // (движок проверяет `instanceof NonRetriableError`) финализирует ран
            // сразу. Внешний catch его пропускает без изменений: outcomeRecorded уже
            // true → failed-строку не пишет, `throw err` ре-бросает тот же объект
            // (повторный throw non-retriable его retriable не делает).
            throw new NonRetriableError(
              `FactCheck halt: ${fc.output.haltReason ?? "противоречия в источниках"}`,
            );
          }
          factcheck = fc;
        }

        const [hookgen, social, score] = await Promise.all([
          step
            .run("hookgen", () =>
              HookGenAgent.run({ draft: brevity.output.compressed, channel: "tg-x10" }, ctx),
            )
            .then(bill),
          step
            .run("social", () =>
              SocialAmplifyAgent.run(
                {
                  draft: brevity.output.compressed,
                  channel: "tg-x10",
                  authorName: event.data.authorName ?? null,
                },
                ctx,
              ),
            )
            .then(bill),
          step
            .run("score", () => PreviewScoreAgent.run({ draft: brevity.output.compressed }, ctx))
            .then(bill),
        ]);

        // Чистим текст TG-поста: настоящие переносы строк + срез английских
        // структурных лейблов (Before/After/Bridge, Yes but, …). См. lib/text.ts.
        // Единый источник текста поста: channels + metadata + return.
        const socialPost = cleanPostText(social.output.post);

        // VK-вариант поста (session 21) — ТОЛЬКО если VK сконфигурирован (токен +
        // owner). Иначе не тратим лишний Sonnet-вызов. SocialAmplifyAgent знает
        // per-channel правила VK (PAS, 1-2 эмодзи, термины проще — аудитория шире).
        const vkEnabled = Boolean(env.VK_ACCESS_TOKEN && env.VK_OWNER_ID);
        const vkSocial = vkEnabled
          ? bill(
              await step.run("social-vk", () =>
                SocialAmplifyAgent.run(
                  {
                    draft: brevity.output.compressed,
                    channel: "vk",
                    authorName: event.data.authorName ?? null,
                  },
                  ctx,
                ),
              ),
            )
          : null;
        const vkPost = vkSocial ? cleanPostText(vkSocial.output.post) : null;

        const totalCost =
          draft.costUsd +
          numbers.costUsd +
          tov.costUsd +
          brevity.costUsd +
          (factcheck?.costUsd ?? 0) +
          hookgen.costUsd +
          social.costUsd +
          score.costUsd +
          (vkSocial?.costUsd ?? 0);

        // $-ledger (session 20): агрегируем токены и per-agent $ для одной строки
        // pipeline_runs (agent='draft'). Источник дневного расхода для budget-gate.
        const agentResults = [
          draft,
          numbers,
          tov,
          brevity,
          hookgen,
          social,
          score,
          ...(factcheck ? [factcheck] : []),
          ...(vkSocial ? [vkSocial] : []),
        ];
        const aggUsage = agentResults.reduce(
          (a, r) => ({
            inputTokens: a.inputTokens + (r.usage?.inputTokens ?? 0),
            outputTokens: a.outputTokens + (r.usage?.outputTokens ?? 0),
            cachedInputTokens: a.cachedInputTokens + (r.usage?.cachedInputTokens ?? 0),
          }),
          { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
        );
        const perAgentCostUsd: Record<string, number> = {
          draft: draft.costUsd,
          numbers: numbers.costUsd,
          tov: tov.costUsd,
          brevity: brevity.costUsd,
          hookgen: hookgen.costUsd,
          social: social.costUsd,
          score: score.costUsd,
          ...(factcheck ? { factcheck: factcheck.costUsd } : {}),
          ...(vkSocial ? { socialVk: vkSocial.costUsd } : {}),
        };

        const pipelineMetadata = {
          brevity: {
            beforeWords: brevity.output.beforeWords,
            afterWords: brevity.output.afterWords,
            cuts: brevity.output.cuts,
          },
          score: {
            total: score.output.total,
            verdict: score.output.verdict,
            breakdown: {
              hookStrength: score.output.hookStrength,
              voiceMatch: score.output.voiceMatch,
              valueDensity: score.output.valueDensity,
              structureFormat: score.output.structureFormat,
              publishReadiness: score.output.publishReadiness,
            },
            fixes: score.output.fixes,
          },
          hooks: hookgen.output.hooks,
          social: {
            channel: social.output.channel,
            framework: social.output.framework,
            post: socialPost,
            hookLine: social.output.hookLine,
            twistLine: social.output.twistLine,
            wordCount: social.output.wordCount,
            lineCount: social.output.lineCount,
          },
          socialVk:
            vkSocial && vkPost
              ? {
                  channel: vkSocial.output.channel,
                  framework: vkSocial.output.framework,
                  post: vkPost,
                  wordCount: vkSocial.output.wordCount,
                }
              : null,
          factcheck: factcheck
            ? {
                status: factcheck.output.status,
                haltReason: factcheck.output.haltReason,
                claims: factcheck.output.claims,
              }
            : null,
          totalCostUsd: totalCost,
        };

        const persisted = await step.run("persist", () =>
          persistArticle({
            revised: brevity.output.compressed,
            section: event.data.section ?? DEFAULT_SECTION,
            category: event.data.category,
            subcategory: event.data.subcategory,
            template: event.data.template,
            tags: event.data.tags,
            sources: event.data.sources,
            databaseUrl: env.DATABASE_URL,
            pipelineMetadata,
          }),
        );

        // $-ledger строка ДО warn-пересчёта, чтобы расход за день включал эту статью.
        await step.run("record-run", async () => {
          const db = createDb(env.DATABASE_URL);
          await recordRun(db, {
            articleId: persisted.id,
            agent: "draft",
            status: "succeeded",
            costUsd: totalCost,
            modelUsed: draft.modelUsed,
            inputTokens: aggUsage.inputTokens,
            outputTokens: aggUsage.outputTokens,
            cachedInputTokens: aggUsage.cachedInputTokens,
            output: { perAgentCostUsd, political: event.data.political === true },
          });
        });
        // Расход статьи записан (succeeded) — catch ниже НЕ должен писать failed,
        // даже если упадёт постинг-очередь/warn ниже (стоимость уже в ledger).
        outcomeRecorded = true;

        // Слот-постинг (session 23): сохраняем готовый TG-пост в channels (Content
        // Object per article per channel) как ОЧЕРЕДЬ (posted_at NULL). Немедленно
        // НЕ постим — cron drain-post-slots забирает строку по слотам (4/день МСК)
        // и делает реальный вызов api.telegram.org. Это вне B2-цепочки агентов.
        await step.run("save-tg-channel", async () => {
          const db = createDb(env.DATABASE_URL);
          await db
            .insert(channels)
            .values({
              articleId: persisted.id,
              channel: "tg",
              text: socialPost,
              visualRef: null,
            })
            .onConflictDoNothing();
        });

        // VK-ветка (session 21): сохраняем VK-вариант в channels(channel='vk') как
        // очередь. drain-post-slots постит его вместе с tg-вариантом в слот. Строка
        // создаётся ТОЛЬКО когда VK сконфигурирован (vkPost != null).
        if (vkPost) {
          await step.run("save-vk-channel", async () => {
            const db = createDb(env.DATABASE_URL);
            await db
              .insert(channels)
              .values({
                articleId: persisted.id,
                channel: "vk",
                text: vkPost,
                visualRef: null,
              })
              .onConflictDoNothing();
          });
        }

        // Warn-алерт (session 20): пересчитываем расход за день (уже с этой статьёй)
        // и при пересечении предупредительной планки шлём уведомление один раз/день.
        await step.run("budget-warn-alert", async () => {
          const db = createDb(env.DATABASE_URL);
          const spentUsd = await getTodaySpendUsd(db, now);
          if (spentUsd < env.DAILY_BUDGET_WARN_USD) return { warned: false, spentUsd };
          const message =
            `⚠️ X10 pipeline: расход за день $${spentUsd.toFixed(2)} ≥ warn $${env.DAILY_BUDGET_WARN_USD} ` +
            `(cap $${env.DAILY_BUDGET_USD}). До жёсткого стопа осталось ~$${(env.DAILY_BUDGET_USD - spentUsd).toFixed(2)}.`;
          // M4: claim + быстрая попытка; недоставленный warn дослыает sweeper.
          const r = await deliverOpsAlert(db, env, {
            day: mskDayString(now),
            kind: "warn",
            spendUsd: spentUsd,
            message,
          });
          return { warned: r.claimed, delivered: r.delivered, spentUsd };
        });

        return {
          articleId: persisted.id,
          slug: persisted.slug,
          totalCostUsd: totalCost,
          agents: {
            draft: { modelUsed: draft.modelUsed, usage: draft.usage, costUsd: draft.costUsd },
            numbers: {
              modelUsed: numbers.modelUsed,
              usage: numbers.usage,
              costUsd: numbers.costUsd,
            },
            tov: { modelUsed: tov.modelUsed, usage: tov.usage, costUsd: tov.costUsd },
            brevity: {
              modelUsed: brevity.modelUsed,
              usage: brevity.usage,
              costUsd: brevity.costUsd,
            },
            ...(factcheck
              ? {
                  factcheck: {
                    modelUsed: factcheck.modelUsed,
                    usage: factcheck.usage,
                    costUsd: factcheck.costUsd,
                  },
                }
              : {}),
            hookgen: {
              modelUsed: hookgen.modelUsed,
              usage: hookgen.usage,
              costUsd: hookgen.costUsd,
            },
            social: { modelUsed: social.modelUsed, usage: social.usage, costUsd: social.costUsd },
            score: { modelUsed: score.modelUsed, usage: score.usage, costUsd: score.costUsd },
          },
          unsourcedNumbers: numbers.output.hasUnsourcedNumbers,
          tovChanges: tov.output.changes,
          brevity: {
            beforeWords: brevity.output.beforeWords,
            afterWords: brevity.output.afterWords,
            cuts: brevity.output.cuts,
          },
          factcheck: factcheck
            ? {
                status: factcheck.output.status,
                haltReason: factcheck.output.haltReason,
                claims: factcheck.output.claims,
              }
            : null,
          hooks: hookgen.output.hooks,
          social: {
            channel: social.output.channel,
            framework: social.output.framework,
            post: socialPost,
            hookLine: social.output.hookLine,
            twistLine: social.output.twistLine,
            wordCount: social.output.wordCount,
            lineCount: social.output.lineCount,
          },
          score: {
            total: score.output.total,
            verdict: score.output.verdict,
            breakdown: {
              hookStrength: score.output.hookStrength,
              voiceMatch: score.output.voiceMatch,
              valueDensity: score.output.valueDensity,
              structureFormat: score.output.structureFormat,
              publishReadiness: score.output.publishReadiness,
            },
            fixes: score.output.fixes,
          },
        };
      } catch (err) {
        // audit M2: финальный сбой шага (после ретраев Inngest) ИЛИ любой throw в
        // цепочке. Если halt/success уже записали свою строку — не дублируем.
        // Иначе пишем status='failed' с суммой расхода успевших агентов (billed),
        // чтобы дневной потолок видел сожжённые перед падением деньги, и ре-throw
        // (Inngest помечает ран failed; ре-throw StepError не вызывает новых
        // ретраев — он уже recentlyRejectedStepError). record-run-failed — step.run
        // → идемпотентен на реплее (мемоизируется, одна строка на ран).
        if (!outcomeRecorded) {
          const failedCost = billed.reduce((s, r) => s + r.costUsd, 0);
          const failedUsage = billed.reduce(
            (a, r) => ({
              inputTokens: a.inputTokens + (r.usage?.inputTokens ?? 0),
              outputTokens: a.outputTokens + (r.usage?.outputTokens ?? 0),
              cachedInputTokens: a.cachedInputTokens + (r.usage?.cachedInputTokens ?? 0),
            }),
            { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
          );
          await step.run("record-run-failed", async () => {
            const db = createDb(env.DATABASE_URL);
            await recordRun(db, {
              articleId: null,
              agent: "draft",
              status: "failed",
              costUsd: failedCost,
              modelUsed: billed[0]?.modelUsed ?? null,
              inputTokens: failedUsage.inputTokens,
              outputTokens: failedUsage.outputTokens,
              cachedInputTokens: failedUsage.cachedInputTokens,
              error: err instanceof Error ? err.message : String(err),
              output: { failed: true, billedAgents: billed.length },
            });
          });
        }
        throw err;
      }
    },
  );
}
