-- x10-daily · RSS-источники для multi-source автопостинга (идемпотентно).
--
-- Применение:  psql "$DATABASE_URL" -f scripts/seed-sources.sql
--
-- ⚠️ ВАЖНО (анти-флуд): после засида НОВОГО источника обязательно ПРИМИНИ его
-- seen_items текущим фидом (mark-all-as-seen), иначе первый тик ingest-rss
-- выстрелит всем backlog'ом в конвейер. См. docs/handoffs/handoff-session-18.md §4.
--
-- URL'ы проверены живьём с РФ-VM (HTTP 200 + валидный RSS). Firehose-фиды
-- (ТАСС/Ведомости, 100-200 общеновостных items) намеренно НЕ включены —
-- много оффтопа → пустые Haiku-гейт-вызовы. enabled=false можно выставить
-- точечно через UPDATE, не трогая код.

INSERT INTO sources (name, kind, tier, url, locale, enabled, notes)
SELECT v.name, 'rss'::source_kind, v.tier::source_tier, v.url, 'ru', true, v.notes
FROM (VALUES
  ('Forbes.ru',   'secondary', 'https://www.forbes.ru/newrss.xml',                      'бизнес/деньги'),
  ('Коммерсантъ', 'secondary', 'https://www.kommersant.ru/rss/section-economics.xml',   'экономика/власть'),
  ('РБК',         'secondary', 'https://rssexport.rbc.ru/rbcnews/news/30/full.rss',     'бизнес/власть (общая лента)'),
  ('Habr',        'fringe',    'https://habr.com/ru/rss/news/?fl=ru',                   'tech')
) AS v(name, tier, url, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM sources s WHERE s.name = v.name AND s.url = v.url
);

-- vc.ru засеян отдельно (session 18 walking-skeleton) — здесь не дублируем.
