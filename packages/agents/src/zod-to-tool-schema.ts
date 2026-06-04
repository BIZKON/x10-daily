import type { z } from "zod";

/**
 * Минимальный Zod → JSON Schema конвертер достаточный для Anthropic tool_use.
 * Не цель — покрыть всё (refinements/transforms/discriminated unions); цель —
 * стабильный mapping для агентских структурированных выходов.
 *
 * Поддерживает: object, string, number, boolean, array, enum, literal, optional,
 * nullable, default, catch, union (string-литералов → enum).
 */

type JsonSchema = Record<string, unknown>;

export function zodToToolSchema(schema: z.ZodType): JsonSchema {
  return walk(schema);
}

function walk(schema: z.ZodType): JsonSchema {
  const def = (schema as unknown as { def: { type: string } }).def;
  const type = def.type;

  switch (type) {
    case "object": {
      const shape = (schema as unknown as { def: { shape: Record<string, z.ZodType> } }).def.shape;
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [key, child] of Object.entries(shape)) {
        properties[key] = walk(child);
        if (!isOptional(child)) required.push(key);
      }
      return { type: "object", properties, required, additionalProperties: false };
    }
    case "string": {
      const out: JsonSchema = { type: "string" };
      const desc = describe(schema);
      if (desc) out.description = desc;
      return out;
    }
    case "number":
      return { type: "number" };
    case "int":
      return { type: "integer" };
    case "boolean":
      return { type: "boolean" };
    case "array": {
      const element = (schema as unknown as { def: { element: z.ZodType } }).def.element;
      return { type: "array", items: walk(element) };
    }
    case "enum": {
      const values = (schema as unknown as { def: { entries: Record<string, string> } }).def
        .entries;
      return { type: "string", enum: Object.values(values) };
    }
    case "literal": {
      const values = (schema as unknown as { def: { values: unknown[] } }).def.values;
      return { type: "string", enum: values };
    }
    case "optional":
    case "nullable":
    case "default":
    case "catch": {
      // catch — обёртка-резильентность: при невалидном значении возвращает
      // fallback. В tool-схему отдаём ВНУТРЕННИЙ тип (с enum-hint'ом), чтобы
      // модель всё равно видела допустимые значения; catch ловит редкие
      // отклонения уже на парсинге ответа (Timeweb proxy не строго
      // энфорсит tool-enum'ы).
      const inner = (schema as unknown as { def: { innerType: z.ZodType } }).def.innerType;
      return walk(inner);
    }
    case "union": {
      const options = (schema as unknown as { def: { options: z.ZodType[] } }).def.options;
      const literalValues = options
        .map((o) => (o as unknown as { def: { type: string; values?: unknown[] } }).def)
        .filter((d) => d.type === "literal")
        .flatMap((d) => d.values ?? []);
      if (literalValues.length === options.length) {
        return { type: "string", enum: literalValues };
      }
      return { anyOf: options.map(walk) };
    }
    default:
      return { type: "string" };
  }
}

function isOptional(schema: z.ZodType): boolean {
  const def = (schema as unknown as { def: { type: string } }).def;
  return def.type === "optional" || def.type === "default";
}

function describe(schema: z.ZodType): string | undefined {
  return (schema as unknown as { description?: string }).description;
}
