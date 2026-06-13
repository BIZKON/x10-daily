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

/**
 * Доля кириллицы среди буквенных символов (кириллица + латиница) по ВСЕМУ
 * драфту: tease+lede+whyItMatters+тело. Жёсткое правило «только русский»
 * (кейс англоязычных источников, давших английский драфт). Латинские бренды/
 * термины допустимы → у нормальной русской статьи (даже tech-heavy) полный
 * драфт ≈0.7, у полностью английского ≈0. Гейт в draft-article режет ниже порога.
 *
 * Порог 0.2 — НАМЕРЕННО консервативный (не 0.5): отказ модели бинарен (пишет
 * либо целиком по-русски ≈0.7, либо целиком по-английски ≈0), разрыв огромен.
 * 0.2 ловит английский с запасом и почти исключает ложный halt легитимной
 * латино-тяжёлой русской статьи с коротким телом (ревью s26).
 */
export const MIN_RUSSIAN_RATIO = 0.2;

export function russianRatio(draft: DraftShape): number {
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
  let cyr = 0;
  let lat = 0;
  for (const ch of texts.join(" ")) {
    const c = ch.toLowerCase();
    if ((c >= "а" && c <= "я") || c === "ё") cyr++;
    else if (c >= "a" && c <= "z") lat++;
  }
  const total = cyr + lat;
  return total === 0 ? 1 : cyr / total;
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

/**
 * Метаданные pipeline в articles.metadata (jsonb).
 * UI админки читает это для отрисовки scorecard / hooks / social preview / factcheck.
 */
export type PipelineMetadata = {
  brevity?: {
    beforeWords: number;
    afterWords: number;
    cuts: string[];
  };
  score?: {
    total: number;
    verdict: string;
    breakdown: {
      hookStrength: number;
      voiceMatch: number;
      valueDensity: number;
      structureFormat: number;
      publishReadiness: number;
    };
    fixes: Array<{ criterion: string; issue: string; suggestion: string }>;
  };
  hooks?: Array<{ pattern: string; text: string; reasoning: string }>;
  social?: {
    channel: string;
    framework: string;
    post: string;
    hookLine: string;
    twistLine: string | null;
    wordCount: number;
    lineCount: number;
  };
  factcheck?: {
    status: "passed" | "review-needed" | "halt";
    haltReason: string | null;
    claims: Array<{
      claim: string;
      location: string;
      verdict: string;
      confidence: string;
      supportingSourceUrls: string[];
      contradictingSourceUrls: string[];
      rationale: string;
    }>;
  } | null;
  totalCostUsd?: number;
};

export type PersistInput = {
  revised: DraftShape;
  /** Pipeline-internal section (наследие). */
  section: "main" | "numbers" | "people" | "playbook" | "weekend" | "longread";
  /** brief §5 — user-facing category. По умолчанию 'practice'. */
  category?: "taxes" | "money" | "practice" | "power" | "tech" | "rybakov";
  /** brief §1 — "taxes.news", "practice.stories" и т.д. */
  subcategory?: string;
  /** brief §3 — шаблон материала. По умолчанию 'card-news'. */
  template?: "card-news" | "deep-dive" | "daily-take" | "guide" | "digest";
  /** brief §5 — теги. По умолчанию []. */
  tags?: string[];
  sources: Array<{ url: string; title: string; publisher: string; publishedAt?: string }>;
  databaseUrl: string;
  /** Опциональные pipeline-результаты — сохраняются в articles.metadata. */
  pipelineMetadata?: PipelineMetadata;
};

export async function persistArticle({
  revised,
  section,
  category,
  subcategory,
  template,
  tags,
  sources,
  databaseUrl,
  pipelineMetadata,
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
      category: category ?? "practice",
      subcategory: subcategory ?? null,
      template: template ?? "card-news",
      tags: tags ?? [],
      // session 24: статья публикуется СРАЗУ в miniapp-ленту (published + publishedAt),
      // а не ждёт ручного ревью (был 'ready') — авто-режим walking-skeleton. Так
      // reader/engagement/feed (фильтруют status='published') консистентны: весь
      // прошедший пайплайн контент читаем и реагируем. TG-канал остаётся курируемым
      // (4/день через channels-очередь + drain-post-slots, независимо от status).
      status: "published",
      publishedAt: new Date(),
      tease: revised.tease,
      lede: revised.lede,
      whyItMatters: revised.whyItMatters,
      body: revised.body as ArticleBlock[],
      wordCount,
      readSeconds,
      citations: sources,
      metadata: pipelineMetadata ?? null,
    })
    .returning({ id: articles.id, slug: articles.slug });

  if (!row) throw new Error("persistArticle: insert returned no rows");
  return { id: row.id, slug: row.slug };
}
