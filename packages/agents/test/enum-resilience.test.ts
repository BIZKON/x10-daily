import { describe, expect, it } from "vitest";
import { z } from "zod";
import { IngestAgent } from "../src";
import { zodToToolSchema } from "../src/zod-to-tool-schema";
import { mockOpenAI } from "./mock-openai";

/**
 * Регрессия session 18: Timeweb AI Gateway (OpenAI→Anthropic tool-перевод) НЕ
 * строго энфорсит enum'ы в tool-схеме. Модель вернула category/template вне
 * enum'а → outputSchema.parse бросал ZodError → draft-article (и весь конвейер)
 * падал на первом же реальном item'е. Лечится .catch на НЕкритичных enum-полях
 * (таксономия/advisory-метки) + enum-hint в tool-схеме сохраняется через
 * zodToToolSchema(catch). Критичные enum'ы (decision, factcheck halt) — строгие.
 */

describe("enum resilience — Timeweb gateway не энфорсит tool-enum'ы", () => {
  it("zodToToolSchema сохраняет enum-hint сквозь .catch (модель всё равно видит допустимые)", () => {
    const schema = z.object({ c: z.enum(["a", "b", "c"]).nullable().catch(null) });
    const json = zodToToolSchema(schema) as {
      properties: { c: { type: string; enum?: string[] } };
    };
    expect(json.properties.c.type).toBe("string");
    expect(json.properties.c.enum).toEqual(["a", "b", "c"]);
  });

  it("IngestAgent: невалидные category/template из модели → null (не падаем), decision строгий", async () => {
    const { client } = mockOpenAI({
      toolName: "x10_emit_ingest",
      toolInput: {
        decision: "accept",
        category: "fintech", // вне INGEST_CATEGORIES
        subcategory: null,
        template: "news-article", // вне INGEST_TEMPLATES
        tags: ["банки"],
        topic: "Сбер представил платёжный терминал Нео",
        context: "Сбер показал новый платёжный терминал для торговых точек.",
        relevanceScore: 0.8,
        rejectReason: null,
        duplicateOf: null,
        political: false,
      },
    });

    const res = await IngestAgent.run(
      {
        rawTitle: "Сбер представил платёжный терминал Нео",
        rawText: "До конца 2026 года банк планирует установить тысячи таких терминалов.",
        source: { url: "https://vc.ru/money/x", title: "t", publisher: "vc.ru" },
      },
      { apiKey: "test", client },
    );

    // Не бросили — конвейер живёт. Таксономия деградировала в null (downstream подставит дефолт).
    expect(res.output.decision).toBe("accept");
    expect(res.output.category).toBeNull();
    expect(res.output.template).toBeNull();
    expect(res.output.topic).toContain("Сбер");
  });
});
