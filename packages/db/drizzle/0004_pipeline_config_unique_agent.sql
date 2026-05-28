-- MEDIUM-7 из docs/SECURITY-AUDIT.md — закрепляет «один row per agent» в схеме.
-- До этой миграции приложение enforces в коде (SELECT-then-UPDATE/INSERT),
-- но при concurrent PUT возможна race condition с дублирующимися rows.
--
-- После миграции:
--   1. Дубликаты (если есть) удаляются — оставляется самая свежая запись per agent.
--   2. Создаётся unique index pipeline_config_agent_uidx.
--   3. Хендлер admin-content.ts может быть упрощён на INSERT ... ON CONFLICT DO UPDATE.

-- Step 1: cleanup duplicates. Оставляем строку с наибольшим updated_at (fallback created_at).
DELETE FROM pipeline_config
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY agent
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      ) AS rn
    FROM pipeline_config
  ) ranked
  WHERE ranked.rn > 1
);
--> statement-breakpoint

-- Step 2: unique index. Если каким-то образом дубликат остался после step 1 —
-- миграция упадёт здесь, что корректно (нельзя продолжать с broken state).
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_config_agent_uidx
  ON pipeline_config (agent);
