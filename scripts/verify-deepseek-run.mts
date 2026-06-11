/**
 * Верификация автономного DeepSeek-прогона (session 24).
 * Запуск ВНУТРИ контейнера pipeline:
 *   docker cp scripts/verify-deepseek-run.mts x10-daily-pipeline-1:/tmp/v.mts
 *   docker exec -w /app/apps/workers/pipeline x10-daily-pipeline-1 node --import tsx /tmp/v.mts
 *
 * Читает DATABASE_URL из env контейнера. Все даты — в дне МСК (Europe/Moscow).
 */
import { closeAllPools, createDb, sql } from "@x10/db";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("НЕТ DATABASE_URL в env");
  process.exit(1);
}
const db = createDb(url);

function hdr(t: string) {
  console.log(`\n${"=".repeat(70)}\n${t}\n${"=".repeat(70)}`);
}

async function main() {
  // 0. Контекст времени
  const t = await db.execute(sql`
    SELECT now() AT TIME ZONE 'Europe/Moscow' AS msk_now,
           (now() AT TIME ZONE 'Europe/Moscow')::date AS msk_today
  `);
  hdr("0. ВРЕМЯ");
  console.table(t.rows);

  // 1. pipeline_runs за сегодня МСК — по агенту/статусу/модели
  hdr("1. pipeline_runs СЕГОДНЯ МСК — agent × status × model");
  const breakdown = await db.execute(sql`
    SELECT agent, status, model_used,
           count(*)::int AS runs,
           round(sum(cost_usd), 4)::text AS cost_usd,
           sum(input_tokens)::int AS in_tok,
           sum(output_tokens)::int AS out_tok
    FROM pipeline_runs
    WHERE (created_at AT TIME ZONE 'Europe/Moscow')::date
        = (now() AT TIME ZONE 'Europe/Moscow')::date
    GROUP BY agent, status, model_used
    ORDER BY agent, status, model_used
  `);
  console.table(breakdown.rows);

  // 2. Итог по $ и модели — главное число
  hdr("2. ИТОГ СЕГОДНЯ МСК — $ и провайдер");
  const totals = await db.execute(sql`
    SELECT
      round(sum(cost_usd), 4)::text AS total_cost_usd,
      count(*)::int AS total_runs,
      count(*) FILTER (WHERE model_used ILIKE '%claude%')::int AS claude_runs,
      count(*) FILTER (WHERE model_used ILIKE '%deepseek%')::int AS deepseek_runs,
      count(*) FILTER (WHERE model_used IS NULL)::int AS null_model_runs,
      count(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
      count(*) FILTER (WHERE status = 'failed')::int AS failed,
      count(*) FILTER (WHERE status = 'halted')::int AS halted,
      count(*) FILTER (WHERE status = 'skipped')::int AS skipped
    FROM pipeline_runs
    WHERE (created_at AT TIME ZONE 'Europe/Moscow')::date
        = (now() AT TIME ZONE 'Europe/Moscow')::date
  `);
  console.table(totals.rows);

  // 3. Распределение по часам МСК — когда шёл прогон
  hdr("3. По часам МСК (draft-раны) — когда драфтил");
  const byHour = await db.execute(sql`
    SELECT extract(hour FROM (created_at AT TIME ZONE 'Europe/Moscow'))::int AS msk_hour,
           count(*)::int AS runs,
           count(*) FILTER (WHERE agent='draft')::int AS drafts,
           count(*) FILTER (WHERE agent='ingest')::int AS ingest_gate,
           round(sum(cost_usd), 4)::text AS cost_usd
    FROM pipeline_runs
    WHERE (created_at AT TIME ZONE 'Europe/Moscow')::date
        = (now() AT TIME ZONE 'Europe/Moscow')::date
    GROUP BY 1 ORDER BY 1
  `);
  console.table(byHour.rows);

  // 4. Ошибки/halts с текстом (детект флакки JSON/enum)
  hdr("4. failed/halted СЕГОДНЯ — с текстом ошибки");
  const fails = await db.execute(sql`
    SELECT agent, status, model_used,
           to_char(created_at AT TIME ZONE 'Europe/Moscow', 'HH24:MI') AS msk,
           left(coalesce(error,''), 300) AS error
    FROM pipeline_runs
    WHERE status IN ('failed','halted')
      AND (created_at AT TIME ZONE 'Europe/Moscow')::date
        = (now() AT TIME ZONE 'Europe/Moscow')::date
    ORDER BY created_at DESC
    LIMIT 25
  `);
  console.log(`строк: ${fails.rows.length}`);
  console.table(fails.rows);

  // 5. FactCheck-раны детально (watch-item: лёгкая модель, over-halt?)
  hdr("5. FactCheck-раны СЕГОДНЯ — детально (over-halt watch)");
  const fc = await db.execute(sql`
    SELECT status, model_used,
           to_char(created_at AT TIME ZONE 'Europe/Moscow', 'HH24:MI') AS msk,
           output->>'status' AS fc_status,
           output->>'verdict' AS verdict,
           output->>'confidence' AS confidence,
           left(coalesce(error,''), 200) AS error
    FROM pipeline_runs
    WHERE agent = 'factcheck'
      AND (created_at AT TIME ZONE 'Europe/Moscow')::date
        = (now() AT TIME ZONE 'Europe/Moscow')::date
    ORDER BY created_at DESC
    LIMIT 25
  `);
  console.log(`FactCheck-ранов сегодня: ${fc.rows.length}`);
  console.table(fc.rows);

  // 6. channels — постинг сегодня (slot drain)
  hdr("6. channels — постинг по слотам СЕГОДНЯ МСК");
  const chSummary = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE posted_at IS NOT NULL)::int AS posted_total,
      count(*) FILTER (WHERE posted_at IS NULL)::int AS pending_total
    FROM channels
  `);
  console.log("channels всего (вся история):");
  console.table(chSummary.rows);

  const postedToday = await db.execute(sql`
    SELECT channel,
           to_char(posted_at AT TIME ZONE 'Europe/Moscow', 'HH24:MI') AS posted_msk,
           post_ref, attempts,
           left(text, 220) AS preview
    FROM channels
    WHERE posted_at IS NOT NULL
      AND (posted_at AT TIME ZONE 'Europe/Moscow')::date
        = (now() AT TIME ZONE 'Europe/Moscow')::date
    ORDER BY posted_at
  `);
  console.log(`\nОПУБЛИКОВАНО СЕГОДНЯ МСК: ${postedToday.rows.length}`);
  console.table(postedToday.rows);

  // pending очередь (готовы, ждут слота) — свежесть
  const pending = await db.execute(sql`
    SELECT channel,
           to_char(created_at AT TIME ZONE 'Europe/Moscow', 'MM-DD HH24:MI') AS created_msk,
           round(extract(epoch FROM (now()-created_at))/3600, 1) AS age_h,
           attempts, left(coalesce(last_error,''),120) AS last_error,
           left(text, 120) AS preview
    FROM channels
    WHERE posted_at IS NULL
    ORDER BY created_at
    LIMIT 30
  `);
  console.log(`\nВ ОЧЕРЕДИ (pending, ждут слота): ${pending.rows.length}`);
  console.table(pending.rows);

  // 7. articles статусы сегодня (детект застрявших — failed-драфты могут не писать pipeline_runs)
  hdr("7. articles СЕГОДНЯ МСК — по статусу (детект застрявших)");
  const arts = await db.execute(sql`
    SELECT status, count(*)::int AS n
    FROM articles
    WHERE (created_at AT TIME ZONE 'Europe/Moscow')::date
        = (now() AT TIME ZONE 'Europe/Moscow')::date
    GROUP BY status ORDER BY status
  `);
  console.table(arts.rows);

  // 8. Свежие принятые статьи — заголовки для качественной оценки
  hdr("8. Свежие статьи СЕГОДНЯ — заголовки (качество ToV/тем)");
  const recent = await db.execute(sql`
    SELECT to_char(created_at AT TIME ZONE 'Europe/Moscow', 'HH24:MI') AS msk,
           status,
           left(coalesce(title,''), 110) AS title
    FROM articles
    WHERE (created_at AT TIME ZONE 'Europe/Moscow')::date
        = (now() AT TIME ZONE 'Europe/Moscow')::date
    ORDER BY created_at DESC
    LIMIT 30
  `);
  console.table(recent.rows);

  await closeAllPools();
}

main().catch((e) => {
  console.error("ОШИБКА:", e);
  process.exit(1);
});
