#!/usr/bin/env bash
# ProAgent AI — прод-катовер ребрендинга X10 → ProAgent AI (ОДИН прогон на VM).
#
# Запуск на VM:
#   ssh root@37.77.105.82
#   cd /opt/x10-daily && git pull --ff-only && bash scripts/rebrand-cutover.sh
#
# Порядок важен:
#   1) пауза постинга          — чтобы во время катовера ничего не постилось/не ingest-илось
#   2) архив старых X10-статей  — ДО деплоя, чтобы новый бренд стартовал с чистой ленты
#   3) ./deploy.sh              — git pull + build нового кода + миграция 0012 (dry-run-проверена) + up -d
#   4) источники               — выключить старые X10-RSS + добавить 6 новых про ИИ (файл появляется после git pull в п.3)
#   5) снять паузу             — ingest пойдёт по НОВЫМ источникам, генерит ProAgent AI-контент
#   6) верификация
#
# ⚠️ Прайминг seen_items НЕ делаем намеренно: постинг слотовый (drain-post-slots
#    4/день) отвязывает канал от бэклога — флуда КАНАЛА не будет; первый тик
#    наполнит ЛЕНТУ из текущего RSS-бэклога (хорошо для старта), draft-burst
#    ограничен дневным потолком $15 и часовым rate-limit 50/ч. Если нужен «пустой
#    медленный старт» — прайминг по docs/handoffs/handoff-session-18.md §4.
#
# Откат: git checkout x10-daily-final && ./deploy.sh ; статьи вернуть
#   UPDATE articles SET status='published' WHERE status='archived' AND published_at IS NOT NULL;
#   (но 6 исходно-archived останутся — при нужде фильтровать по дате).

set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env.production ]]; then echo "✗ .env.production не найден"; exit 1; fi
# Берём ТОЛЬКО DATABASE_URL (без source всего файла — надёжнее под set -e).
DATABASE_URL=$(grep -m1 '^DATABASE_URL=' .env.production | cut -d= -f2- | sed 's/^["'"'"']//; s/["'"'"']$//')
if [[ -z "$DATABASE_URL" ]]; then echo "✗ DATABASE_URL не найден в .env.production"; exit 1; fi

# psql через одноразовый postgres:17 (локальный psql на VM = v16). --network host —
# достучаться до managed PG по адресу из DATABASE_URL. URL передаём АРГУМЕНТОМ psql
# (через -e U=... он бы раскрывался хост-шеллом снаружи контейнера → пусто → local socket).
PSQL() {
  docker run --rm -i --network host \
    -v "$PWD/scripts/seed-sources.sql:/seed.sql:ro" \
    postgres:17-alpine \
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 "$@"
}

echo "▸ Катовер X10 → ProAgent AI. Будет: пауза → архив ВСЕХ published статей → deploy → смена источников → снятие паузы."
if [[ "${1:-}" != "--yes" ]]; then
  # /dev/tty — читаем именно с терминала (иначе вставленный перевод строки съедается как пустой ответ).
  read -r -p "  Продолжить? Напиши YES (или запусти с флагом --yes): " CONF </dev/tty || CONF=""
  [[ "$CONF" == "YES" ]] || { echo "отменено (для запуска без вопроса: bash scripts/rebrand-cutover.sh --yes)"; exit 1; }
fi

echo "▸ 1/6 пауза постинга"
PSQL -c "UPDATE posting_control SET paused=true WHERE id='global';" \
     -c "SELECT id, paused FROM posting_control;"

echo "▸ 2/6 архив старых X10-статей (status published → archived)"
PSQL -c "UPDATE articles SET status='archived' WHERE status='published';" \
     -c "SELECT status, count(*) FROM articles GROUP BY status ORDER BY count DESC;"

echo "▸ 3/6 деплой нового кода + миграция 0012 (это займёт пару минут)"
./deploy.sh

echo "▸ 4/6 источники: выключить старые X10-RSS, добавить новые про ИИ (идемпотентно)"
PSQL -c "UPDATE sources SET enabled=false WHERE name IN ('Forbes.ru','Коммерсантъ','РБК','Habr');"
PSQL -f /seed.sql
PSQL -c "SELECT name, tier, enabled FROM sources ORDER BY enabled DESC, tier;"

echo "▸ 5/6 снять паузу постинга"
PSQL -c "UPDATE posting_control SET paused=false WHERE id='global';" \
     -c "SELECT id, paused FROM posting_control;"

echo "▸ 6/6 верификация"
PSQL -c "SELECT enum_range(NULL::article_category);"
echo "  health API:"; curl -s -o /dev/null -w "  api.pro-agent-ai.ru/health → %{http_code}\n" https://api.pro-agent-ai.ru/health || true
echo "  контейнеры:"; docker compose -f docker-compose.prod.yml ps --format "table {{.Service}}\t{{.Status}}" || true

cat <<'EOF'

✓ Катовер завершён. Проверь вручную:
  - https://app.pro-agent-ai.ru  — открой в Telegram (@Sekretar_Syrov_IP_bot → меню): бренд ProAgent AI, разделы Лента/Кейсы/Обучение/Я
  - Лента наполнится ИИ-статьями по мере генерации (~50/ч, слот-постинг 4/день)
  - IPv6: journalctl -t x10-ipv6 --no-pager | tail ; curl -6 -sS -o /dev/null -w "%{http_code}\n" https://api.telegram.org  (ждём 302)
  - Inngest: docker compose -f docker-compose.prod.yml logs pipeline | tail
EOF
