-- ProAgent AI · RSS-источники для multi-source автопостинга (идемпотентно).
--
-- Применение:  psql "$DATABASE_URL" -f scripts/seed-sources.sql
--
-- ⚠️ ВАЖНО (анти-флуд): после INSERT обязателен прайминг seen_items (анти-флуд) —
-- каждый НОВЫЙ источник примируется текущим фидом (mark-all-as-seen), иначе
-- первый тик ingest-rss выстрелит всем backlog'ом в конвейер. Процедура —
-- docs/handoffs/handoff-session-18.md §4. Этот файл прайминг НЕ выполняет.
--
-- Тематика отбора: ИИ-агенты, автоматизация и внедрение ИИ в малом/среднем
-- бизнесе РФ; угол — практическая выгода (часы, деньги, конверсия).
-- URL'ы проверены живьём 20.07.2026 (HTTP 200 + валидный XML + свежие pubDate);
-- перед прод-применением повторить проверку с РФ-VM. Firehose-фиды намеренно
-- НЕ включены (прежний анти-флуд-принцип): CNews (~200 общих IT-items) —
-- много оффтопа → пустые гейт-вызовы. Мёртвые на момент проверки: TAdviser
-- (404), hightech.plus (500), vc.ru/rss/ai (404 — тематического фида нет).
-- enabled=false можно выставить точечно через UPDATE, не трогая код.

INSERT INTO sources (name, kind, tier, url, locale, enabled, notes)
SELECT v.name, 'rss'::source_kind, v.tier::source_tier, v.url, 'ru', true, v.notes
FROM (VALUES
  ('Habr · Искусственный интеллект', 'primary',   'https://habr.com/ru/rss/hub/artificial_intelligence/all/?fl=ru', 'ядро тематики: ИИ/LLM/агенты, практика внедрения'),
  ('RB.RU · тег ИИ',                 'primary',   'https://rb.ru/feeds/tag/ai/',                                    'ИИ × бизнес: рынок, регулирование, кейсы компаний'),
  ('Habr · Машинное обучение',       'secondary', 'https://habr.com/ru/rss/hub/machine_learning/all/?fl=ru',        'ML-хаб; пересекается с ИИ-хабом (дубли отсеются)'),
  ('vc.ru',                          'secondary', 'https://vc.ru/rss',                                              'бизнес/стартапы/сервисы; ИИ-релевантность отфильтрует гейт'),
  ('RB.RU',                          'fringe',    'https://rb.ru/feeds/all/',                                       'общая стартап/бизнес-лента — для рубрики «Практика»'),
  ('Хайтек',                         'fringe',    'https://hightech.fm/feed',                                       'технологии/наука, регулярные ИИ-новости; малый объём (~10 items)')
) AS v(name, tier, url, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM sources s WHERE s.name = v.name AND s.url = v.url
);

-- ⚠️ Прод-миграция (отдельный этап, здесь НЕ выполняется): старые X10-источники
-- (Forbes.ru, Коммерсантъ, РБК, Habr-news + vc.ru из session 18) выключить
-- `UPDATE sources SET enabled=false ...` или удалить. Этот файл только добавляет;
-- строка vc.ru идемпотентна по (name, url) — при совпадении с прод-строкой
-- INSERT будет пропущен.
