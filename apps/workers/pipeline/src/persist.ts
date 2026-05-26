import type { ArticleBlock, DraftShape } from "@x10/agents";
import { articles, createDb, eq } from "@x10/db";

/** Slug: транслит русского → латиница, ≤ 80 символов. */
export function slugify(text: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
    з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
    п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
    ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  return text
    .toLowerCase()
    .split("")
    .map((c) => map[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function countWords(draft: DraftShape): number {
  const texts: string[] = [draft.tease, draft.lede, draft.whyItMatters];
  for (const block of draft.body) {
    switch (block.type) {
      case "paragraph":
      case "callout":
      case "quote":
        texts.push(block.text);
        break;
      case "numbers":
        for (const n of block.items) texts.push(`${n.label} ${n.value}`);
        break;
      case "list":
        texts.push(...block.items);
        break;
    }
  }
  return texts.join(" ").split(/\s+/).filter(Boolean).length;
}

export function serializeDraftForNumbers(draft: DraftShape): string {
  const lines: string[] = [draft.lede, draft.whyItMatters];
  for (const block of draft.body) {
    switch (block.type) {
      case "paragraph":
      case "callout":
        lines.push(block.text);
        break;
      case "quote":
        lines.push(`"${block.text}" — ${block.attribution}`);
        break;
      case "numbers":
        for (const n of block.items) lines.push(`${n.label}: ${n.value}`);
        break;
      case "list":
        lines.push(...block.items);
        break;
    }
  }
  return lines.join("\n");
}

export type PersistInput = {
  revised: DraftShape;
  section: "main" | "numbers" | "people" | "playbook" | "weekend" | "longread";
  sources: Array<{ url: string; title: string; publisher: string; publishedAt?: string }>;
  databaseUrl: string;
};

export async function persistArticle({
  revised,
  section,
  sources,
  databaseUrl,
}: PersistInput): Promise<{ id: string; slug: string }> {
  const db = createDb(databaseUrl);
  const baseSlug = slugify(revised.tease);
  const slug = baseSlug || `article-${Date.now()}`;

  // Уникальность slug — если занят, добавим -2, -3…
  const existing = await db
    .select({ slug: articles.slug })
    .from(articles)
    .where(eq(articles.slug, slug))
    .limit(1);
  const finalSlug = existing.length === 0 ? slug : `${slug}-${Date.now().toString(36)}`;

  const wordCount = countWords(revised);
  const readSeconds = Math.max(20, Math.round((wordCount / 200) * 60));

  const [row] = await db
    .insert(articles)
    .values({
      slug: finalSlug,
      section,
      status: "ready",
      tease: revised.tease,
      lede: revised.lede,
      whyItMatters: revised.whyItMatters,
      body: revised.body as ArticleBlock[],
      wordCount,
      readSeconds,
      citations: sources,
    })
    .returning({ id: articles.id, slug: articles.slug });

  if (!row) throw new Error("persistArticle: insert returned no rows");
  return { id: row.id, slug: row.slug };
}
