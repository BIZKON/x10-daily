import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodToToolSchema } from "../src/zod-to-tool-schema";

type ObjSchema = {
  properties: Record<string, { type: unknown; enum?: unknown[] }>;
  required: string[];
};

/**
 * nullable-обработка (session 23 review): вшитая в промпт схема (DeepSeek
 * response_format json_object) обязана отражать null, иначе модель видит
 * «non-null required» и перестаёт слать null там, где конвейер на него рассчитывает
 * (haltReason=null при passed, source=null без ссылки).
 */
describe("zodToToolSchema — nullable", () => {
  it("nullable string → type [string,null]; поле ОСТАЁТСЯ required (nullable ≠ optional)", () => {
    const schema = zodToToolSchema(
      z.object({ haltReason: z.string().nullable(), tease: z.string() }),
    ) as unknown as ObjSchema;
    expect(schema.properties.haltReason!.type).toEqual(["string", "null"]);
    expect(schema.required).toContain("haltReason");
    expect(schema.properties.tease!.type).toBe("string");
  });

  it("optional → НЕ required (в отличие от nullable)", () => {
    const schema = zodToToolSchema(
      z.object({ sub: z.string().optional(), x: z.string() }),
    ) as unknown as ObjSchema;
    expect(schema.required).not.toContain("sub");
    expect(schema.required).toContain("x");
  });

  it("nullable enum → null и в type, и в enum", () => {
    const schema = zodToToolSchema(
      z.object({ v: z.enum(["a", "b"]).nullable() }),
    ) as unknown as ObjSchema;
    expect(schema.properties.v!.type).toEqual(["string", "null"]);
    expect(schema.properties.v!.enum).toEqual(["a", "b", null]);
  });
});
