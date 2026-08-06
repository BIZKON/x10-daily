-- Диагностический след постинга: чем пост УШЁЛ на самом деле.
--
-- Зачем. Отправка в Telegram деградирует ступенями (post-channel.ts):
-- фото+HTML-подпись → фото+plain → HTML-текст → плоский текст. Деградация — не
-- ошибка: пост уходит, `outcome.ok` остаётся true, `last_error` пуст, `attempts`
-- не растёт. То есть факт «картинка не взлетела» до сих пор не сохранялся НИГДЕ,
-- и вопрос «идут ли публикации с обложками» проверялся только глазами в канале
-- либо по логам контейнера, которые смывает деплой.
--
-- 06.08.2026 это стоило расследования: из пяти постов с одобренными обложками
-- три ушли текстом, и для одного из них причину установить уже не удалось.
--
-- varchar + CHECK, а НЕ pg enum: обратимо и не требует ADD VALUE (см. 0014).
-- NULL — легитимное значение: строки, опубликованные до этой миграции, о своём
-- режиме ничего не знают, и притворяться, что знают, нельзя.
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "post_mode" varchar(16);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'channels_post_mode_check'
  ) THEN
    ALTER TABLE "channels" ADD CONSTRAINT "channels_post_mode_check"
      CHECK ("post_mode" IS NULL OR "post_mode" IN (
        'photo',       -- sendPhoto + HTML-подпись: как задумано
        'photo_plain', -- sendPhoto, но разметку подписи Telegram отбил
        'text_html',   -- текстом с rich-HTML: либо обложки не было, либо фото отбито
        'text_plain',  -- текстом без разметки: отбито и фото, и HTML
        'vk'           -- VK: у него нет ступеней деградации
      ));
  END IF;
END $$;
