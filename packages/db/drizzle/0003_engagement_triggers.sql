-- Этап 3d — денормализованные счётчики engagement.
-- Триггеры держат articles.reactions (jsonb) и articles.bookmark_count в синхроне
-- с дочерними таблицами reactions и bookmarks. Без этого list-view ленты пришлось бы
-- считать через JOIN+GROUP BY на каждый запрос — бюджет LCP §11 не вынес бы.

-- ============================================================
-- Reactions counter (brief §6 Article.reactions {fire, insight, question})
-- ============================================================
CREATE OR REPLACE FUNCTION update_article_reactions_counter() RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE articles SET reactions = jsonb_set(
      reactions,
      ARRAY[NEW.kind::text],
      to_jsonb(COALESCE((reactions->>NEW.kind::text)::int, 0) + 1)
    ) WHERE id = NEW.article_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE articles SET reactions = jsonb_set(
      reactions,
      ARRAY[OLD.kind::text],
      to_jsonb(GREATEST(0, COALESCE((reactions->>OLD.kind::text)::int, 0) - 1))
    ) WHERE id = OLD.article_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS reactions_counter_trigger ON reactions;--> statement-breakpoint
CREATE TRIGGER reactions_counter_trigger
AFTER INSERT OR DELETE ON reactions
FOR EACH ROW EXECUTE FUNCTION update_article_reactions_counter();--> statement-breakpoint

-- ============================================================
-- Bookmarks counter (brief §6 bookmarkCount, §11 «≥40% сохранили хотя бы 1»)
-- ============================================================
CREATE OR REPLACE FUNCTION update_article_bookmark_counter() RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE articles SET bookmark_count = bookmark_count + 1 WHERE id = NEW.article_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE articles SET bookmark_count = GREATEST(0, bookmark_count - 1) WHERE id = OLD.article_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS bookmarks_counter_trigger ON bookmarks;--> statement-breakpoint
CREATE TRIGGER bookmarks_counter_trigger
AFTER INSERT OR DELETE ON bookmarks
FOR EACH ROW EXECUTE FUNCTION update_article_bookmark_counter();--> statement-breakpoint

-- ============================================================
-- Reading history: auto-completed flag (brief §11 «дочитали лонгрид ≥ 35%» — нужен флаг)
-- При INSERT/UPDATE — если read_percent >= 90, ставим completed = true.
-- ============================================================
CREATE OR REPLACE FUNCTION mark_reading_completed() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.read_percent >= 90 THEN
    NEW.completed = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS reading_completed_trigger ON user_reading_history;--> statement-breakpoint
CREATE TRIGGER reading_completed_trigger
BEFORE INSERT OR UPDATE OF read_percent ON user_reading_history
FOR EACH ROW EXECUTE FUNCTION mark_reading_completed();
