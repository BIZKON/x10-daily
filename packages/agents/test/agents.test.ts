import { describe, expect, it, vi } from "vitest";
import {
  BrevityAgent,
  DraftAgent,
  FactCheckAgent,
  HOOK_PATTERNS,
  HookGenAgent,
  IngestAgent,
  NewsletterAssembleAgent,
  NumbersAgent,
  PreviewScoreAgent,
  ScoreWeeklyAgent,
  SocialAmplifyAgent,
  ToVAgent,
  createMasker,
} from "../src";
import { mockAnthropic } from "./mock-anthropic";

const SOURCES = [
  {
    url: "https://www.cbr.ru/press/keypr/",
    title: "Решение ЦБ по ключевой ставке",
    publisher: "ЦБ РФ",
    publishedAt: "2026-05-26",
  },
];

describe("DraftAgent", () => {
  it("использует Sonnet, шлёт system с cache_control, парсит tool_use в DraftShape", async () => {
    const { client, spy } = mockAnthropic({
      toolName: "x10_emit_draft",
      toolInput: {
        tease: "ЦБ держит ставку 17% — четвёртое заседание",
        lede: "Банк России подтвердил курс на сжатие.",
        whyItMatters: "Кредитное окно для МСП закрыто минимум до сентября.",
        body: [
          {
            type: "callout",
            kind: "why",
            text: "При ставке 17% IRR проектов МСП в среднем ниже стоимости долга.",
          },
          {
            type: "numbers",
            items: [
              {
                label: "Ключевая ставка",
                value: "17%",
                source: "https://www.cbr.ru/press/keypr/",
              },
            ],
          },
        ],
      },
      inputTokens: 2000,
      outputTokens: 600,
    });

    const result = await DraftAgent.run(
      {
        topic: "ЦБ ставка",
        context: "Заседание ЦБ 26 мая 2026",
        sources: SOURCES,
        section: "main",
      },
      { apiKey: "test", client },
    );

    expect(spy).toHaveBeenCalledOnce();
    const call = spy.mock.calls[0]![0];
    expect(call.model).toBe("claude-sonnet-4-6");
    expect(call.system[0].cache_control).toEqual({ type: "ephemeral" });
    // Default template = card-news → system содержит card-news гайдлайн.
    expect(call.system[0].text).toMatch(/card-news/);
    expect(call.tool_choice).toEqual({ type: "tool", name: "x10_emit_draft" });
    expect(call.tools[0].name).toBe("x10_emit_draft");

    expect(result.modelUsed).toBe("claude-sonnet-4-6");
    expect(result.output.tease).toContain("17%");
    expect(result.usage.inputTokens).toBe(2000);
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it("template=deep-dive — система содержит deep-dive гайдлайн и Lenny's подход", async () => {
    const { client, spy } = mockAnthropic({
      toolName: "x10_emit_draft",
      toolInput: {
        tease: "Wildberries собирает логистическую империю",
        lede: "Маркетплейс купил три такси-сервиса.",
        whyItMatters: "Что это значит для МСП-продавцов.",
        body: [{ type: "paragraph", text: "Контекст сделки и три урока." }],
      },
    });
    await DraftAgent.run(
      {
        topic: "Wildberries купил такси",
        context: "Сделка апреля 2026",
        sources: SOURCES,
        section: "main",
        template: "deep-dive",
      },
      { apiKey: "test", client },
    );
    const systemText = spy.mock.calls[0]![0].system[0].text;
    expect(systemText).toMatch(/deep-dive/);
    expect(systemText).toMatch(/Lenny|3-5 ключевых уроков|разбор/i);
  });

  it("template=daily-take — система требует первого лица и Cite→Opinion→Implication", async () => {
    const { client, spy } = mockAnthropic({
      toolName: "x10_emit_draft",
      toolInput: {
        tease: "ЦБ снова держит",
        lede: "Совет директоров: ставка 17%.",
        whyItMatters: "Я говорю прямо: кредитное окно закрыто.",
        body: [{ type: "paragraph", text: "Что делать: свои деньги, без иллюзий." }],
      },
    });
    await DraftAgent.run(
      {
        topic: "ЦБ держит",
        context: "Заседание 26 мая",
        sources: SOURCES,
        section: "main",
        template: "daily-take",
      },
      { apiKey: "test", client },
    );
    const systemText = spy.mock.calls[0]![0].system[0].text;
    expect(systemText).toMatch(/daily-take/);
    expect(systemText).toMatch(/Cite|Opinion|Implication/i);
    expect(systemText).toMatch(/первого лица|авторский голос/i);
  });
});

describe("NumbersAgent", () => {
  it("использует Haiku (дешёвый тир)", async () => {
    const { client, spy } = mockAnthropic({
      toolName: "x10_emit_numbers",
      toolInput: {
        items: [
          {
            label: "Ключевая ставка",
            value: "17%",
            source: "https://www.cbr.ru/press/keypr/",
            contextQuote: "Совет директоров принял решение сохранить ставку 17%.",
          },
        ],
        hasUnsourcedNumbers: false,
      },
    });

    const result = await NumbersAgent.run(
      { text: "ЦБ оставил ставку 17%.", sources: SOURCES },
      { apiKey: "test", client },
    );

    expect(spy.mock.calls[0]![0].model).toBe("claude-haiku-4-5-20251001");
    expect(result.output.items).toHaveLength(1);
    expect(result.output.items[0]?.value).toBe("17%");
    expect(result.output.hasUnsourcedNumbers).toBe(false);
  });
});

describe("ToVAgent", () => {
  it("инжектит voice.md в system и возвращает changes", async () => {
    const { client, spy } = mockAnthropic({
      toolName: "x10_emit_tov",
      toolInput: {
        revised: {
          tease: "ЦБ держит ставку 17%",
          lede: "Банк России подтвердил курс на сжатие.",
          whyItMatters: "Кредитное окно для МСП закрыто до сентября.",
          body: [
            { type: "paragraph", text: "Совет директоров сохранил ставку четвёртый раз подряд." },
          ],
        },
        changes: [
          {
            kind: "blacklist",
            before: "беспрецедентное решение",
            after: "решение сохранить ставку",
            reason: "blacklist: «беспрецедентный»",
          },
        ],
      },
    });

    const result = await ToVAgent.run(
      {
        draft: {
          tease: "Беспрецедентное решение ЦБ",
          lede: "Банк России подтвердил курс.",
          whyItMatters: "Кредитное окно для МСП закрыто.",
          body: [{ type: "paragraph", text: "Совет директоров принял беспрецедентное решение." }],
        },
        authorName: null,
      },
      { apiKey: "test", client },
    );

    const systemText = spy.mock.calls[0]![0].system[0].text;
    expect(systemText).toContain("VOICE RULES");
    expect(systemText).toContain("беспрецедентный");
    expect(result.output.changes).toHaveLength(1);
    expect(result.output.changes[0]?.kind).toBe("blacklist");
  });
});

describe("BrevityAgent", () => {
  it("использует Sonnet, сохраняет numbers-блок 1:1, возвращает cuts и word counts", async () => {
    const compressed = {
      tease: "ЦБ держит ставку 17%",
      lede: "Совет сохранил ставку четвёртый раз.",
      whyItMatters: "Кредитное окно для МСП закрыто до сентября.",
      body: [
        {
          type: "numbers" as const,
          items: [
            {
              label: "Ключевая ставка",
              value: "17%",
              source: "https://www.cbr.ru/press/keypr/",
            },
          ],
        },
        {
          type: "callout" as const,
          kind: "yes-but" as const,
          text: "Регулятор оставляет окно для снижения в сентябре.",
        },
      ],
    };

    const { client, spy } = mockAnthropic({
      toolName: "x10_emit_brevity",
      toolInput: {
        compressed,
        beforeWords: 420,
        afterWords: 270,
        cuts: ["удалил преамбулу про историю ставок", "слил два абзаца про IRR"],
      },
    });

    const result = await BrevityAgent.run(
      {
        revised: {
          tease: "ЦБ держит ставку 17%",
          lede: "Совет сохранил ставку четвёртый раз.",
          whyItMatters: "Кредитное окно для МСП закрыто до сентября.",
          body: [
            {
              type: "paragraph",
              text: "Длинная преамбула про историю ставок начиная с 2014 года, которая повторяет общеизвестное.",
            },
            {
              type: "numbers",
              items: [
                {
                  label: "Ключевая ставка",
                  value: "17%",
                  source: "https://www.cbr.ru/press/keypr/",
                },
              ],
            },
            {
              type: "callout",
              kind: "yes-but",
              text: "Регулятор оставляет окно для снижения в сентябре.",
            },
          ],
        },
      },
      { apiKey: "test", client },
    );

    const call = spy.mock.calls[0]![0];
    expect(call.model).toBe("claude-sonnet-4-6");
    expect(call.tool_choice).toEqual({ type: "tool", name: "x10_emit_brevity" });
    expect(result.output.compressed.body[0]).toEqual({
      type: "numbers",
      items: [
        {
          label: "Ключевая ставка",
          value: "17%",
          source: "https://www.cbr.ru/press/keypr/",
        },
      ],
    });
    expect(result.output.afterWords).toBeLessThan(result.output.beforeWords);
    expect(result.output.cuts).toHaveLength(2);
  });

  it("template=deep-dive — лимиты в system 800-2000 слов, режет мягко", async () => {
    const { client, spy } = mockAnthropic({
      toolName: "x10_emit_brevity",
      toolInput: {
        compressed: {
          tease: "t", lede: "l", whyItMatters: "w",
          body: [{ type: "paragraph", text: "x" }],
        },
        beforeWords: 2400,
        afterWords: 1800,
        cuts: ["убрал воду в первом разделе"],
      },
    });
    await BrevityAgent.run(
      {
        revised: {
          tease: "t", lede: "l", whyItMatters: "w",
          body: [{ type: "paragraph", text: "x" }],
        },
        template: "deep-dive",
      },
      { apiKey: "test", client },
    );
    const systemText = spy.mock.calls[0]![0].system[0].text;
    expect(systemText).toMatch(/≤ 2000 слов/);
    expect(systemText).toMatch(/МЯГКО|уроки/i);
  });

  it("template=daily-take — лимиты 50-200 слов, жёсткое сжатие", async () => {
    const { client, spy } = mockAnthropic({
      toolName: "x10_emit_brevity",
      toolInput: {
        compressed: {
          tease: "t", lede: "l", whyItMatters: "w",
          body: [{ type: "paragraph", text: "x" }],
        },
        beforeWords: 350,
        afterWords: 180,
        cuts: ["объединил абзацы"],
      },
    });
    await BrevityAgent.run(
      {
        revised: {
          tease: "t", lede: "l", whyItMatters: "w",
          body: [{ type: "paragraph", text: "x" }],
        },
        template: "daily-take",
      },
      { apiKey: "test", client },
    );
    const systemText = spy.mock.calls[0]![0].system[0].text;
    expect(systemText).toMatch(/≤ 200 слов/);
    expect(systemText).toMatch(/жёстко|Cite→Opinion→Implication/i);
  });
});

describe("HookGenAgent", () => {
  it("использует Haiku и возвращает 6 хуков, по одному на каждый паттерн", async () => {
    const hooks = HOOK_PATTERNS.map((pattern, i) => ({
      pattern,
      text: `Хук #${i + 1} про ставку 17%`,
      reasoning: "Паттерн подходит для tg-x10",
    }));

    const { client, spy } = mockAnthropic({
      toolName: "x10_emit_hookgen",
      toolInput: { hooks },
    });

    const result = await HookGenAgent.run(
      {
        draft: {
          tease: "ЦБ держит ставку 17%",
          lede: "Совет сохранил ставку четвёртый раз.",
          whyItMatters: "Кредитное окно для МСП закрыто до сентября.",
          body: [{ type: "paragraph", text: "Совет директоров принял решение." }],
        },
        channel: "tg-x10",
      },
      { apiKey: "test", client },
    );

    expect(spy.mock.calls[0]![0].model).toBe("claude-haiku-4-5-20251001");
    expect(result.output.hooks).toHaveLength(6);
    const patterns = result.output.hooks.map((h) => h.pattern).sort();
    expect(patterns).toEqual([...HOOK_PATTERNS].sort());
  });

  it("channel default = tg-x10 если не передан", async () => {
    const { client } = mockAnthropic({
      toolName: "x10_emit_hookgen",
      toolInput: { hooks: [] },
    });

    // input без channel — Zod подставит default
    const result = await HookGenAgent.run(
      {
        draft: {
          tease: "test",
          lede: "test",
          whyItMatters: "test",
          body: [{ type: "paragraph", text: "test" }],
        },
      } as Parameters<typeof HookGenAgent.run>[0],
      { apiKey: "test", client },
    );

    expect(result.output.hooks).toEqual([]);
  });

  it("system-prompt содержит правила от hook-generator (no questions, no em-dash, digits)", async () => {
    const { client, spy } = mockAnthropic({
      toolName: "x10_emit_hookgen",
      toolInput: { hooks: [] },
    });
    await HookGenAgent.run(
      {
        draft: {
          tease: "t", lede: "l", whyItMatters: "w",
          body: [{ type: "paragraph", text: "x" }],
        },
        channel: "linkedin",
      },
      { apiKey: "test", client },
    );
    const systemText = spy.mock.calls[0]![0].system[0].text;
    expect(systemText).toMatch(/НЕ начинай открывающую строку с вопроса/);
    expect(systemText).toMatch(/em-dash|длинное тире/);
    expect(systemText).toMatch(/арабскими/);
    expect(systemText).toMatch(/двухстрочка/);
  });
});

describe("SocialAmplifyAgent", () => {
  it("использует Sonnet, прокидывает channel rules + framework default в user-message", async () => {
    const { client, spy } = mockAnthropic({
      toolName: "x10_emit_social",
      toolInput: {
        channel: "tg-x10",
        framework: "BAB",
        post: "ЦБ держит ставку 17%.\n\nКредитное окно для МСП закрыто.\n\nЧитать полностью на x10daily.",
        hookLine: "ЦБ держит ставку 17%",
        twistLine: "Четвёртый раз подряд",
        segments: [
          { stage: "Before", text: "Была надежда на снижение" },
          { stage: "After", text: "Ставка осталась 17%" },
          { stage: "Bridge", text: "Кредитное окно для МСП закрыто" },
        ],
        wordCount: 32,
        lineCount: 5,
      },
    });

    const result = await SocialAmplifyAgent.run(
      {
        draft: {
          tease: "ЦБ держит ставку 17%",
          lede: "Совет сохранил ставку.",
          whyItMatters: "Кредитное окно для МСП закрыто.",
          body: [
            { type: "numbers", items: [{ label: "Ставка", value: "17%", source: "https://cbr.ru" }] },
          ],
        },
        channel: "tg-x10",
      },
      { apiKey: "test", client },
    );

    const call = spy.mock.calls[0]![0];
    expect(call.model).toBe("claude-sonnet-4-6");
    expect(call.tool_choice).toEqual({ type: "tool", name: "x10_emit_social" });
    expect(call.system[0].text).toContain("VOICE RULES");
    expect(call.system[0].text).toContain("FRAMEWORKS");

    // user-message содержит правила для tg-x10 и выбранный framework
    const userMsg = call.messages[0].content as string;
    expect(userMsg).toContain("Channel: tg-x10");
    expect(userMsg).toContain("Деловой, сухой");
    expect(userMsg).toContain("Framework (выбрано): BAB");

    expect(result.output.framework).toBe("BAB");
    expect(result.output.channel).toBe("tg-x10");
    expect(result.output.segments).toHaveLength(3);
  });

  it("linkedin → дефолтный framework PAS, в user-message правила LinkedIn", async () => {
    const { client, spy } = mockAnthropic({
      toolName: "x10_emit_social",
      toolInput: {
        channel: "linkedin",
        framework: "PAS",
        post: "Hook.\n\nTwist.\n\nProblem.\n\nAgitation.\n\nSolution.\n\nRepost if useful.",
        hookLine: "ЦБ держит ставку 17%",
        twistLine: "Кредитное окно закрыто",
        segments: [
          { stage: "Problem", text: "..." },
          { stage: "Agitation", text: "..." },
          { stage: "Solution", text: "..." },
        ],
        wordCount: 18,
        lineCount: 11,
      },
    });

    await SocialAmplifyAgent.run(
      {
        draft: {
          tease: "t", lede: "l", whyItMatters: "w",
          body: [{ type: "paragraph", text: "x" }],
        },
        channel: "linkedin",
      },
      { apiKey: "test", client },
    );

    const userMsg = spy.mock.calls[0]![0].messages[0].content as string;
    expect(userMsg).toContain("Channel: linkedin");
    expect(userMsg).toContain("Framework (выбрано): PAS");
    expect(userMsg).toMatch(/Hook ≤ 50|≤ 20 строк/);
  });
});

describe("PreviewScoreAgent", () => {
  it("возвращает 5 оценок, total в диапазоне 5-50, fixes привязаны к criteria", async () => {
    const { client, spy } = mockAnthropic({
      toolName: "x10_emit_score",
      toolInput: {
        hookStrength: 8,
        voiceMatch: 9,
        valueDensity: 7,
        structureFormat: 8,
        publishReadiness: 7,
        total: 39,
        verdict: "Готово к publish с лёгкими правками открывалки.",
        topPerformerComparison:
          "Топ-статьи Х10 открываются цифрой + контр-аргумент в первых 60 знаках. Эта попадает в паттерн.",
        fixes: [
          {
            criterion: "hookStrength",
            issue: "tease не содержит конкретного числа",
            suggestion: "Заменить на «ЦБ держит 17% — четвёртое заседание»",
          },
        ],
      },
    });

    const result = await PreviewScoreAgent.run(
      {
        draft: {
          tease: "ЦБ держит ставку",
          lede: "Совет сохранил ставку.",
          whyItMatters: "Кредитное окно закрыто.",
          body: [{ type: "paragraph", text: "Совет директоров." }],
        },
      },
      { apiKey: "test", client },
    );

    expect(spy.mock.calls[0]![0].model).toBe("claude-sonnet-4-6");
    expect(result.output.total).toBe(39);
    expect(result.output.fixes).toHaveLength(1);
    expect(result.output.fixes[0]?.criterion).toBe("hookStrength");
    expect(result.output.verdict).toMatch(/publish/i);
  });

  it("отвергает оценку > 10 через Zod schema", async () => {
    const { client } = mockAnthropic({
      toolName: "x10_emit_score",
      toolInput: {
        hookStrength: 11, // невалидно
        voiceMatch: 9,
        valueDensity: 7,
        structureFormat: 8,
        publishReadiness: 7,
        total: 42,
        verdict: "test",
        topPerformerComparison: "test",
        fixes: [],
      },
    });

    await expect(
      PreviewScoreAgent.run(
        {
          draft: {
            tease: "t", lede: "l", whyItMatters: "w",
            body: [{ type: "paragraph", text: "x" }],
          },
        },
        { apiKey: "test", client },
      ),
    ).rejects.toThrow();
  });
});

describe("FactCheckAgent", () => {
  it("использует Opus и возвращает claims с verdicts + status", async () => {
    const { client, spy } = mockAnthropic({
      toolName: "x10_emit_factcheck",
      toolInput: {
        claims: [
          {
            claim: "ЦБ сохранил ставку 17%",
            location: "lede",
            verdict: "supported",
            confidence: "high",
            supportingSourceUrls: ["https://www.cbr.ru/press/keypr/"],
            contradictingSourceUrls: [],
            rationale: "Источник ЦБ РФ прямо указывает ставку 17%.",
          },
        ],
        status: "passed",
        haltReason: null,
      },
    });

    const result = await FactCheckAgent.run(
      {
        draft: {
          tease: "ЦБ ставка 17%",
          lede: "Совет сохранил ставку 17%.",
          whyItMatters: "Кредитное окно закрыто.",
          body: [{ type: "paragraph", text: "Совет директоров." }],
        },
        sources: [
          { url: "https://www.cbr.ru/press/keypr/", title: "Решение", publisher: "ЦБ РФ" },
        ],
      },
      { apiKey: "test", client },
    );

    expect(spy.mock.calls[0]![0].model).toBe("claude-opus-4-7");
    expect(result.output.status).toBe("passed");
    expect(result.output.claims).toHaveLength(1);
    expect(result.output.claims[0]?.verdict).toBe("supported");
  });

  it("halt: модель не использует внешние знания (проверка в system)", async () => {
    const { client, spy } = mockAnthropic({
      toolName: "x10_emit_factcheck",
      toolInput: { claims: [], status: "passed", haltReason: null },
    });
    await FactCheckAgent.run(
      {
        draft: {
          tease: "t", lede: "l", whyItMatters: "w",
          body: [{ type: "paragraph", text: "x" }],
        },
        sources: [{ url: "https://x.test/", title: "t", publisher: "p" }],
      },
      { apiKey: "test", client },
    );
    const systemText = spy.mock.calls[0]![0].system[0].text;
    expect(systemText).toMatch(/НЕ используй внешние знания/);
    expect(systemText).toMatch(/halt/);
  });
});

describe("IngestAgent", () => {
  it("использует Haiku, заполняет decision/category/template/political", async () => {
    const { client, spy } = mockAnthropic({
      toolName: "x10_emit_ingest",
      toolInput: {
        decision: "accept",
        category: "money",
        subcategory: "money.cbr",
        template: "card-news",
        tags: ["ЦБ", "ставка", "малый-бизнес"],
        topic: "ЦБ держит ставку 17%",
        context: "Заседание 26 мая, ставка осталась 17%. МСП кредитование под давлением.",
        relevanceScore: 0.85,
        rejectReason: null,
        duplicateOf: null,
        political: true,
      },
    });

    const result = await IngestAgent.run(
      {
        rawTitle: "Банк России сохранил ключевую ставку на уровне 17%",
        rawText: "Совет директоров ЦБ принял решение сохранить ставку.",
        source: { url: "https://www.cbr.ru/", title: "Пресс-релиз", publisher: "ЦБ РФ" },
      },
      { apiKey: "test", client },
    );

    expect(spy.mock.calls[0]![0].model).toBe("claude-haiku-4-5-20251001");
    expect(result.output.decision).toBe("accept");
    expect(result.output.category).toBe("money");
    expect(result.output.subcategory).toBe("money.cbr");
    expect(result.output.template).toBe("card-news");
    expect(result.output.tags).toEqual(["ЦБ", "ставка", "малый-бизнес"]);
    expect(result.output.political).toBe(true);
    expect(result.output.relevanceScore).toBeGreaterThanOrEqual(0.6);
  });

  it("rejects infobiz контент: category/template=null, tags=[]", async () => {
    const { client } = mockAnthropic({
      toolName: "x10_emit_ingest",
      toolInput: {
        decision: "reject",
        category: null,
        subcategory: null,
        template: null,
        tags: [],
        topic: null,
        context: null,
        relevanceScore: 0.1,
        rejectReason: "infobiz",
        duplicateOf: null,
        political: false,
      },
    });

    const result = await IngestAgent.run(
      {
        rawTitle: "5 секретов миллионеров",
        rawText: "Марафон успеха.",
        source: { url: "https://example.com/", title: "t", publisher: "p" },
      },
      { apiKey: "test", client },
    );

    expect(result.output.decision).toBe("reject");
    expect(result.output.rejectReason).toBe("infobiz");
    expect(result.output.category).toBeNull();
    expect(result.output.template).toBeNull();
    expect(result.output.topic).toBeNull();
  });

  it("system-prompt описывает 6 категорий и 4 шаблона из brief'a", async () => {
    const { client, spy } = mockAnthropic({
      toolName: "x10_emit_ingest",
      toolInput: {
        decision: "accept",
        category: "taxes",
        subcategory: "taxes.news",
        template: "card-news",
        tags: ["УСН"],
        topic: "УСН 350",
        context: "test",
        relevanceScore: 0.7,
        rejectReason: null,
        duplicateOf: null,
        political: false,
      },
    });
    await IngestAgent.run(
      {
        rawTitle: "t",
        rawText: "x",
        source: { url: "https://x.test/", title: "t", publisher: "p" },
      },
      { apiKey: "test", client },
    );
    const systemText = spy.mock.calls[0]![0].system[0].text;
    expect(systemText).toMatch(/taxes\s+—/);
    expect(systemText).toMatch(/money\s+—/);
    expect(systemText).toMatch(/practice\s+—/);
    expect(systemText).toMatch(/rybakov\s+—/);
    expect(systemText).toMatch(/card-news/);
    expect(systemText).toMatch(/deep-dive/);
    expect(systemText).toMatch(/daily-take/);
    expect(systemText).toMatch(/guide/);
  });
});

describe("ScoreWeeklyAgent", () => {
  it("использует Sonnet, возвращает ranking + recommendations + correlation", async () => {
    const { client, spy } = mockAnthropic({
      toolName: "x10_emit_score_weekly",
      toolInput: {
        weekSummary: "9 статей опубликовано, среднее composite 1240.",
        topArticleIds: ["art-1", "art-2", "art-3"],
        bottomArticleIds: ["art-7", "art-8", "art-9"],
        hookPatternRanking: [
          { pattern: "contrarian", avgComposite: 1800, sampleSize: 3 },
          { pattern: "number-led", avgComposite: 1200, sampleSize: 4 },
        ],
        recommendations: [
          {
            configPath: "hookgen.patterns.contrarian.weight",
            currentValue: 1.0,
            proposedValue: 1.3,
            rationale: "contrarian +50% против медианы (n=3, эффект-сайз большой).",
            confidence: 0.7,
          },
        ],
        previewScoreCorrelation: 0.62,
      },
    });

    const result = await ScoreWeeklyAgent.run(
      {
        weekISO: "2026-W21",
        articles: [
          {
            articleId: "art-1",
            slug: "tsb-stavka-17",
            section: "main",
            publishedAt: "2026-05-20",
            previewScore: 39,
            hookPattern: "contrarian",
            views: 4200,
            uniqueReaders: 3100,
            scrollDepthAvg: 0.68,
            reactions: 230,
            shares: 45,
            newsletterSignups: 12,
          },
        ],
        currentConfig: { "hookgen.patterns.contrarian.weight": 1.0 },
      },
      { apiKey: "test", client },
    );

    expect(spy.mock.calls[0]![0].model).toBe("claude-sonnet-4-6");
    expect(result.output.recommendations).toHaveLength(1);
    expect(result.output.previewScoreCorrelation).toBeCloseTo(0.62, 2);
    expect(result.output.hookPatternRanking[0]?.pattern).toBe("contrarian");
  });
});

describe("NewsletterAssembleAgent", () => {
  it("использует Sonnet, возвращает subject + 7 секций + variants", async () => {
    const { client, spy } = mockAnthropic({
      toolName: "x10_emit_newsletter",
      toolInput: {
        subject: "ЦБ держит 17% — четвёртое заседание",
        subjectVariants: [
          "ЦБ держит 17% — четвёртое заседание",
          "Кредит для МСП закрыт до сентября",
          "Греф: ставка — главный риск года",
        ],
        preheader: "Что значит решение ЦБ для бизнеса и как реагирует рынок",
        sections: [
          {
            sectionLabel: "Главное",
            articleIds: ["art-1"],
            htmlBody: "<article><h3>ЦБ ставка 17%</h3></article>",
            plainBody: "ЦБ ставка 17%",
          },
          { sectionLabel: "Цифры дня", articleIds: [], htmlBody: "", plainBody: "" },
          { sectionLabel: "Кто и что", articleIds: [], htmlBody: "", plainBody: "" },
          { sectionLabel: "Плейбук", articleIds: [], htmlBody: "", plainBody: "" },
          { sectionLabel: "Что дальше", articleIds: [], htmlBody: "", plainBody: "" },
          { sectionLabel: "Длинное чтение", articleIds: [], htmlBody: "", plainBody: "" },
          { sectionLabel: "Слово редактора", articleIds: [], htmlBody: "", plainBody: "" },
        ],
        closing: "Подпишитесь на ежедневный X10 Daily",
        meta: { totalArticles: 1, sectionsUsed: 1, issueDate: "2026-05-26" },
      },
    });

    const result = await NewsletterAssembleAgent.run(
      {
        issueDate: "2026-05-26",
        articles: [
          {
            id: "art-1",
            slug: "tsb-stavka-17",
            section: "main",
            tease: "ЦБ держит ставку 17%",
            lede: "Совет сохранил ставку.",
            whyItMatters: "Кредитное окно закрыто.",
            wordCount: 270,
          },
        ],
      },
      { apiKey: "test", client },
    );

    expect(spy.mock.calls[0]![0].model).toBe("claude-sonnet-4-6");
    expect(result.output.sections).toHaveLength(7);
    expect(result.output.subjectVariants.length).toBeGreaterThanOrEqual(2);
    expect(result.output.meta.totalArticles).toBe(1);
  });
});

describe("masker × agent integration", () => {
  it("mask вызывается перед LLM, unmask — после", async () => {
    const maskFn = vi.fn(async (text: string) => ({
      masked: text.replace("Иванов", "[NAME_1]"),
      session: { sessionId: "s1" },
    }));
    const unmaskFn = vi.fn(async (text: string) =>
      text.replaceAll("[NAME_1]", "Иванов"),
    );

    const { client } = mockAnthropic({
      toolName: "x10_emit_numbers",
      toolInput: {
        items: [
          {
            label: "Зарплата [NAME_1]",
            value: "200 000 ₽",
            source: null,
            contextQuote: "[NAME_1] получает 200 000 ₽ в месяц",
          },
        ],
        hasUnsourcedNumbers: true,
      },
    });

    const result = await NumbersAgent.run(
      { text: "Иванов получает 200 000 ₽ в месяц", sources: [] },
      { apiKey: "test", client, masker: { mask: maskFn, unmask: unmaskFn } },
    );

    expect(maskFn).toHaveBeenCalledWith(
      expect.stringContaining("Иванов"),
    );
    expect(unmaskFn).toHaveBeenCalledOnce();
    expect(result.output.items[0]?.label).toBe("Зарплата Иванов");
    expect(result.output.items[0]?.contextQuote).toContain("Иванов");
  });

  it("passthrough masker не меняет текст", async () => {
    const masker = createMasker({ NODE_ENV: "development" });
    const { client } = mockAnthropic({
      toolName: "x10_emit_numbers",
      toolInput: { items: [], hasUnsourcedNumbers: false },
    });
    const result = await NumbersAgent.run(
      { text: "hello", sources: [] },
      { apiKey: "test", client, masker },
    );
    expect(result.output.items).toHaveLength(0);
  });
});
