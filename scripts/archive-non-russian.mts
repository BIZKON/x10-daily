/**
 * Архивирует уже опубликованные НЕ-русские статьи (англоязычные драфты,
 * просочившиеся ДО языкового гейта session 26). Идемпотентно.
 *
 * Тот же критерий, что и гейт в draft-article: доля кириллицы среди
 * (кириллица+латиница) по tease+lede+whyItMatters+тело < MIN_RUSSIAN_RATIO.
 *
 * Запуск (на VM, из /opt/x10-daily, ПОСЛЕ git pull). ⚠️ scripts/ НЕ копируется
 * в образ pipeline → монтируем хостовую папку; tsx есть в образе (CMD = pnpm
 * start = tsx). НЕ `node --experimental-strip-types` — @x10/db использует
 * extensionless-импорты, нативный strip-types их не резолвит (ревью s26).
 *   set -a && . ./.env.production && set +a
 *   # DRY-RUN (только SELECT, ничего не пишет — покажет, что заархивирует):
 *   docker compose -f docker-compose.prod.yml run --rm --no-deps \
 *     -v "$PWD/scripts:/app/scripts" -e DATABASE_URL="$DATABASE_URL" \
 *     --entrypoint sh pipeline -c 'cd /app && tsx scripts/archive-non-russian.mts'
 *   # ПРИМЕНИТЬ (status -> archived) — тот же вызов с --apply в конце:
 *   #   ... -c 'cd /app && tsx scripts/archive-non-russian.mts --apply'
 */
import { and, articles, createDb, inArray, sql } from "@x10/db";

const MIN_RUSSIAN_RATIO = 0.2;
const APPLY = process.argv.includes("--apply");

function ratio(...texts: string[]): number {
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

type Block = { type: string; text?: string; items?: Array<string | { label?: string; value?: string }> };

function blockTexts(body: Block[] | null): string[] {
  if (!body) return [];
  const out: string[] = [];
  for (const b of body) {
    if (typeof b.text === "string") out.push(b.text);
    if (Array.isArray(b.items)) {
      for (const it of b.items) {
        if (typeof it === "string") out.push(it);
        else out.push(`${it.label ?? ""} ${it.value ?? ""}`);
      }
    }
  }
  return out;
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL не задан");
const db = createDb(url);

const rows = await db
  .select({
    id: articles.id,
    slug: articles.slug,
    status: articles.status,
    tease: articles.tease,
    lede: articles.lede,
    whyItMatters: articles.whyItMatters,
    body: articles.body,
  })
  .from(articles)
  .where(inArray(articles.status, ["ready", "published"]));

const bad = rows
  .map((r) => ({
    ...r,
    r: ratio(r.tease ?? "", r.lede ?? "", r.whyItMatters ?? "", ...blockTexts(r.body as Block[] | null)),
  }))
  .filter((x) => x.r < MIN_RUSSIAN_RATIO);

console.log(`Проверено ${rows.length} (ready/published). НЕ-русских (кириллица < ${MIN_RUSSIAN_RATIO}): ${bad.length}`);
for (const b of bad) {
  console.log(`  [${b.r.toFixed(2)}] ${b.slug} (${b.status}) — ${(b.tease ?? "").slice(0, 70)}`);
}

if (!bad.length) {
  console.log("Нечего архивировать.");
} else if (!APPLY) {
  console.log("\nDRY-RUN. Чтобы заархивировать — добавь --apply.");
} else {
  await db
    .update(articles)
    .set({ status: "archived", updatedAt: sql`now()` })
    .where(and(inArray(articles.id, bad.map((b) => b.id)), inArray(articles.status, ["ready", "published"])));
  console.log(`\n✓ Заархивировано ${bad.length} статей (status -> archived). Лента их больше не покажет.`);
}

process.exit(0);
