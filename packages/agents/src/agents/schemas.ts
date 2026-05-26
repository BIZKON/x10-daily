import { z } from "zod";

/** Минимальный источник для агента: URL + название издания. */
export const sourceRefSchema = z.object({
  url: z.string(),
  title: z.string(),
  publisher: z.string(),
  publishedAt: z.string().optional(),
});
export type SourceRef = z.infer<typeof sourceRefSchema>;

/** Один блок тела статьи — копирует ArticleBlock из @x10/db, но независимо. */
export const articleBlockSchema = z.union([
  z.object({ type: z.literal("paragraph"), text: z.string() }),
  z.object({
    type: z.literal("numbers"),
    items: z.array(
      z.object({
        label: z.string(),
        value: z.string(),
        source: z.string().optional(),
      }),
    ),
  }),
  z.object({
    type: z.literal("quote"),
    text: z.string(),
    attribution: z.string(),
  }),
  z.object({
    type: z.literal("callout"),
    kind: z.enum(["why", "yes-but", "what-next", "big-picture"]),
    text: z.string(),
  }),
  z.object({
    type: z.literal("list"),
    ordered: z.boolean(),
    items: z.array(z.string()),
  }),
]);
export type ArticleBlock = z.infer<typeof articleBlockSchema>;

/** Smart Brevity 6 блоков: tease/lede/why/numbers/yes-but/what-next. */
export const draftShapeSchema = z.object({
  tease: z.string(),
  lede: z.string(),
  whyItMatters: z.string(),
  body: z.array(articleBlockSchema),
});
export type DraftShape = z.infer<typeof draftShapeSchema>;
