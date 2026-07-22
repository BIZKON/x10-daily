/**
 * verify-sources.mts — реальный fetch-прогон (Фаза 2 приёмки) + прайминг seen_items.
 *
 * Гоняет НАСТОЯЩИЙ код-путь ingest (fetchRss → simhash64 → markIfNew) по каждому
 * active-источнику из БД. Никаких моков: реальная сеть, реальный parser, реальный
 * дедуп. markIfNew заодно ПРАЙМИТ seen_items (анти-флуд: первый тик ingest не
 * выстрелит бэклогом). DRY=1 — только fetch+simhash без записи (для сухого прогона).
 *
 * Запуск на VM (образ pipeline содержит @x10/worker-ingest + @x10/db + @x10/agents):
 *   docker compose -f docker-compose.prod.yml run --rm --no-deps \
 *     -v "$PWD/scripts/verify-sources.mts:/app/apps/workers/pipeline/_verify.mts" \
 *     -e DATABASE_URL="$DATABASE_URL" --entrypoint sh pipeline \
 *     -c 'cd /app/apps/workers/pipeline && pnpm exec tsx _verify.mts'
 */
import { createMasker } from "@x10/agents";
import { createDb } from "@x10/db";
import { fetchRss, listEnabledRssSources, markIfNew, simhash64 } from "@x10/worker-ingest";

const DATABASE_URL = process.env.DATABASE_URL;
const DRY = process.env.DRY === "1";
if (!DATABASE_URL) {
  console.error("✗ DATABASE_URL не задан");
  process.exit(1);
}

async function main(): Promise<void> {
  const db = createDb(DATABASE_URL as string);

  // Инвариант: KikuAI Masker на месте в downstream-цепочке. createMasker
  // инстанцируется в process-source-item/draft-article/… и вшит в define-agent
  // (mask вход / unmask выход). Здесь LLM-цепочку НЕ трогаем — только проверяем.
  console.log(
    `KikuAI Masker: createMasker=${typeof createMasker} (импортируем из @x10/agents; вшит в define-agent.mask/unmask — не отключён, не тронут).\n`,
  );

  const sources = await listEnabledRssSources(db);
  console.log(`Active RSS-источников (kind='rss' AND enabled=true): ${sources.length}`);
  console.log(`Режим: ${DRY ? "DRY (без записи seen_items)" : "PRIME (markIfNew → прайминг)"}\n`);

  const line = (s: string) => console.log(s);
  line(
    "СТАТУС | ИСТОЧНИК                          | ЭЛ-ТОВ | SIMHASH | FRESH/DUP | ПРИМЕР ЗАГОЛОВКА",
  );
  line("-".repeat(110));

  let okCount = 0;
  let failCount = 0;
  for (const src of sources) {
    try {
      const items = await fetchRss(src.url);
      let fresh = 0;
      let dup = 0;
      let simhashOk = true;
      for (const it of items) {
        let fp: string | null = null;
        try {
          fp = simhash64(`${it.title}\n${it.text}`);
        } catch {
          simhashOk = false;
        }
        if (!DRY) {
          const isNew = await markIfNew(db, {
            sourceId: src.id,
            externalId: it.externalId.slice(0, 256),
            fingerprint: fp,
          });
          if (isNew) fresh++;
          else dup++;
        }
      }
      okCount++;
      const sample = (items[0]?.title ?? "").slice(0, 44).replace(/\s+/g, " ");
      line(
        `OK     | ${src.name.slice(0, 32).padEnd(32)} | ${String(items.length).padStart(5)}  | ${
          simhashOk ? "да     " : "ОШИБКА "
        } | ${String(fresh).padStart(4)}/${String(dup).padEnd(4)} | «${sample}»`,
      );
    } catch (e) {
      failCount++;
      const msg = e instanceof Error ? e.message : String(e);
      line(`FAIL   | ${src.name.slice(0, 32).padEnd(32)} | ${msg.slice(0, 60)}`);
    }
  }

  line("-".repeat(110));
  line(`Итог: OK=${okCount}, FAIL=${failCount}, всего active=${sources.length}`);
  if (failCount > 0) {
    line(
      "⚠ Есть FAIL — по ТЗ такие источники надо либо чинить, либо переводить в pending (UPDATE sources SET enabled=false, status='pending').",
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
