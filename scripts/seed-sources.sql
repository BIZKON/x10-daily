-- ProAgent AI · RSS-источники автопостинга (идемпотентно). Ниша: ИИ-разработка и
-- агентная работа для бизнеса (доступная кастомная разработка силами ИИ-агентов).
--
-- Применение:  psql "$DATABASE_URL" -f scripts/seed-sources.sql
-- ⚠️ Требует миграцию 0013 (колонки adapter_type/status). Порядок: migrate → seed.
--
-- Фетчер (apps/workers/ingest/fetch-rss.ts, rss-parser) универсален — парсит RSS И
-- Atom, поэтому youtube (videos.xml), github (releases.atom), reddit (.rss) заводятся
-- как kind='rss'; adapter_type — семантика/доки/спец-хендлинг. Крон фетчит
-- kind='rss' AND enabled=true. pending-источники всегда enabled=false.
--
-- ⚠️ Анти-флуд: после INSERT новые active-источники приминаются (seen_items
-- заполняется текущим фидом) — иначе первый тик выстрелит бэклогом. Прайминг
-- делает scripts/verify-sources.mts (он же — реальный fetch-прогон Фазы 2).
--
-- URL/channel_id проверены живым fetch 20.07.2026 (все active вернули ≥1 элемент).
-- Полная таблица источников и правила — docs/parsing-sources.md.

INSERT INTO sources (name, kind, tier, url, locale, enabled, adapter_type, status, notes)
SELECT v.name, 'rss'::source_kind, v.tier::source_tier, v.url, v.locale, v.enabled, v.adapter_type, v.status, v.notes
FROM (VALUES
  -- ── Текущие RU-источники общих ИИ-новостей (оставлены активными) ───────────
  ('Habr · Искусственный интеллект','primary','https://habr.com/ru/rss/hub/artificial_intelligence/all/?fl=ru','ru',true,'rss','active','RU: ИИ/LLM/агенты, практика внедрения'),
  ('RB.RU · тег ИИ','primary','https://rb.ru/feeds/tag/ai/','ru',true,'rss','active','RU: ИИ x бизнес, рынок, кейсы компаний'),
  ('Habr · Машинное обучение','secondary','https://habr.com/ru/rss/hub/machine_learning/all/?fl=ru','ru',true,'rss','active','RU: ML-хаб (дубли с ИИ-хабом отсеются)'),
  ('vc.ru','secondary','https://vc.ru/rss','ru',true,'rss','active','RU: бизнес/сервисы, ИИ-релевантность фильтрует гейт'),
  ('RB.RU','fringe','https://rb.ru/feeds/all/','ru',true,'rss','active','RU: общая стартап-лента для рубрики Практика'),
  ('Хайтек','fringe','https://hightech.fm/feed','ru',true,'rss','active','RU: технологии/наука, регулярные ИИ-новости'),

  -- ── Блок 1: бизнес-модель (ИИ как услуга / ИИ-сотрудники для SMB), YouTube ──
  ('Nick Saraev · YouTube','primary','https://www.youtube.com/feeds/videos.xml?channel_id=UCbo-KbSjJDG6JWQ_MTZ_rNA','en',true,'youtube','active','EN: агентства ИИ-автоматизации, деньги на ИИ-услугах'),
  ('Nate Herk · YouTube','primary','https://www.youtube.com/feeds/videos.xml?channel_id=UC2ojq-nuP8ceeHqiroeKhBA','en',true,'youtube','active','EN: n8n/агенты, практика автоматизации'),
  ('Liam Ottley · YouTube','secondary','https://www.youtube.com/feeds/videos.xml?channel_id=UCui4jxDaMb53Gdh-AZUTPAg','en',true,'youtube','active','EN: ИИ-агентства, монетизация'),
  ('Mark Kashef · YouTube','secondary','https://www.youtube.com/feeds/videos.xml?channel_id=UCHkzp52CldSPZqU5T49mOnA','en',true,'youtube','active','EN: prompt/агенты для бизнеса'),
  ('Brendan Jowett · YouTube','fringe','https://www.youtube.com/feeds/videos.xml?channel_id=UCzIsviqoJc-VcWqF5Pp8iLw','en',true,'youtube','active','EN: автоматизация под ключ'),
  ('Jannis Moore · YouTube','fringe','https://www.youtube.com/feeds/videos.xml?channel_id=UCdC1fW4Gp5csXeQ8BVzsAAA','en',true,'youtube','active','EN: агентные системы для бизнеса'),

  -- ── Блок 2: инженерная практика (как строят софт агентами), YouTube+GitHub ──
  ('Dave Ebbelaar · YouTube','primary','https://www.youtube.com/feeds/videos.xml?channel_id=UCn8ujwUInbJkBhffxqAPBVQ','en',true,'youtube','active','EN: AI-инженерия, продакшн-агенты'),
  ('IndyDevDan · YouTube','primary','https://www.youtube.com/feeds/videos.xml?channel_id=UC_x36zCEGilGpB1m-V4gmjg','en',true,'youtube','active','EN: agentic coding, Claude Code/инструменты'),
  ('Cole Medin · YouTube','primary','https://www.youtube.com/feeds/videos.xml?channel_id=UCMwVTLZIRRUyyVrkjDpn4pA','en',true,'youtube','active','EN: production-агенты, RAG, фреймворки'),
  ('AI Jason · YouTube','secondary','https://www.youtube.com/feeds/videos.xml?channel_id=UCrXSVX9a1mj8l0CMLwKgMVw','en',true,'youtube','active','EN: разбор ИИ-инструментов и агентов'),
  ('Riley Brown · YouTube','secondary','https://www.youtube.com/feeds/videos.xml?channel_id=UCMcoud_ZW7cfxeIugBflSBw','en',true,'youtube','active','EN: vibe-coding, ИИ-приложения'),
  ('Cole Medin · Archon (GitHub)','secondary','https://github.com/coleam00/Archon/releases.atom','en',true,'github','active','EN: релизы Archon (флагман coleam00)'),

  -- ── Блок 3: стратегия/текст ────────────────────────────────────────────────
  ('Greg Isenberg · YouTube','secondary','https://www.youtube.com/feeds/videos.xml?channel_id=UCPjNBjflYl0-HQtUvOx0Ibw','en',true,'youtube','active','EN: продукт/стартапы на ИИ'),
  ('Matthew Berman · YouTube','primary','https://www.youtube.com/feeds/videos.xml?channel_id=UCawZsQWqfGSbCI5yjkdVkTA','en',true,'youtube','active','EN: ИИ-новости, модели, агенты'),

  -- ── Блок 4: опенсорс-фреймворки — GitHub releases ──────────────────────────
  ('CrewAI (GitHub)','primary','https://github.com/crewAIInc/crewAI/releases.atom','en',true,'github','active','EN: релизы мультиагентного фреймворка'),
  ('n8n (GitHub)','primary','https://github.com/n8n-io/n8n/releases.atom','en',true,'github','active','EN: релизы low-code автоматизации'),
  ('Dify (GitHub)','secondary','https://github.com/langgenius/dify/releases.atom','en',true,'github','active','EN: релизы LLM-app платформы'),
  ('Activepieces (GitHub)','secondary','https://github.com/activepieces/activepieces/releases.atom','en',true,'github','active','EN: релизы open-source автоматизации'),
  ('CopilotKit (GitHub)','fringe','https://github.com/CopilotKit/CopilotKit/releases.atom','en',true,'github','active','EN: релизы in-app ИИ-ассистентов'),
  ('PraisonAI (GitHub)','fringe','https://github.com/MervinPraison/PraisonAI/releases.atom','en',true,'github','active','EN: релизы агентного фреймворка'),

  -- ── Блок 1/2/3 · RSS-рассылки блогов (найденные) ───────────────────────────
  ('Nick Saraev · рассылка','secondary','https://nicksaraev.com/rss/','en',true,'rss','active','EN: письма про ИИ-автоматизацию бизнеса'),

  -- ── PENDING (enabled=false) — Reddit: 429 на datacenter-IP ──────────────────
  ('r/AI_Agents (Reddit)','secondary','https://www.reddit.com/r/AI_Agents/top/.rss?t=week','en',false,'reddit','pending','pending: Reddit 429 на datacenter-IP (VM прод-IP + прод-UA + пауза; old.reddit тоже нестабилен). Нужен OAuth-API (60/мин) или RSS-мост'),
  ('r/n8n (Reddit)','fringe','https://www.reddit.com/r/n8n/top/.rss?t=week','en',false,'reddit','pending','pending: Reddit 429 на datacenter-IP. Нужен OAuth-API или RSS-мост'),
  ('r/AgentsOfAI (Reddit)','fringe','https://www.reddit.com/r/AgentsOfAI/top/.rss?t=week','en',false,'reddit','pending','pending: Reddit 429 на datacenter-IP. Нужен OAuth-API или RSS-мост'),
  ('r/SaaS (Reddit)','fringe','https://www.reddit.com/r/SaaS/top/.rss?t=week','en',false,'reddit','pending','pending: Reddit 429 на datacenter-IP. Нужен OAuth-API или RSS-мост'),

  -- ── PENDING — X (нет нативного RSS) ────────────────────────────────────────
  ('Greg Isenberg · X','secondary','https://x.com/gregisenberg','en',false,'x','pending','pending: у X нет нативного RSS. Нужен RSS.app или self-hosted Nitter-мост — отдельной задачей'),

  -- ── PENDING — блоги без найденного фида (YouTube этих авторов активен) ──────
  ('Dave Ebbelaar · блог','fringe','https://daveebbelaar.com','en',false,'rss','pending','pending: RSS не найден автодискавери (head + /rss,/feed,/rss.xml,/feed.xml,/atom.xml). Уточнить путь/платформу'),
  ('IndyDevDan · блог','fringe','https://indydevdan.com','en',false,'rss','pending','pending: RSS не найден автодискавери. Уточнить путь/платформу'),
  ('Matthew Berman · Forward Future','fringe','https://forwardfuture.com','en',false,'rss','pending','pending: RSS не найден автодискавери (возможно Beehiiv — уточнить pub-id/домен forwardfuture.ai)')
) AS v(name, tier, url, locale, enabled, adapter_type, status, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM sources s WHERE s.name = v.name AND s.url = v.url
);
