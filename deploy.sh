#!/usr/bin/env bash
# x10-daily M0 deploy — один прогон на Timeweb Cloud Server (VM).
# Цикл: git pull → build → migrate (managed PG) → up -d.
#
# Запуск:
#   ssh <vm>
#   cd /opt/x10-daily
#   ./deploy.sh
#
# Требуется на VM:
#   - .env.production рядом с этим скриптом (chmod 600, не в репо)
#   - Docker + Compose v2
#   - Расширение vector включено в managed PG (ДО первого migrate)
#
# Это НЕ CI/CD конвейер — намеренно простой shell без откатов и
# health-gating'а. Откат: git checkout <prev-sha> && ./deploy.sh.

set -euo pipefail

cd "$(dirname "$0")"

ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.prod.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "✗ $ENV_FILE не найден. Скопируй .env.example → .env.production и заполни."
  exit 1
fi

# Минимальная проверка обязательных ключей (без значений, фейлим рано).
required=(
  DATABASE_URL
  X10_BASE_DOMAIN
  CADDY_ACME_EMAIL
  AI_GATEWAY_API_KEY
  TELEGRAM_BOT_TOKEN
  X10_JWT_SECRET
  INNGEST_EVENT_KEY
  INNGEST_SIGNING_KEY
  INNGEST_POSTGRES_URI
)
missing=()
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
for key in "${required[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    missing+=("$key")
  fi
done
if [[ ${#missing[@]} -gt 0 ]]; then
  printf '✗ В %s не задано: %s\n' "$ENV_FILE" "${missing[*]}"
  exit 1
fi

echo "▸ git pull"
git pull --ff-only

echo "▸ docker compose build"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build

echo "▸ migrate (drizzle-kit на managed PG)"
# Запускаем миграции одноразовым контейнером поверх pipeline-образа.
# pnpm --filter @x10/db db:migrate использует DATABASE_URL из env.
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm \
  -e DATABASE_URL="$DATABASE_URL" \
  --no-deps \
  --entrypoint sh \
  pipeline -c 'cd /app && pnpm --filter @x10/db db:migrate'

echo "▸ docker compose up -d"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

echo "▸ статус контейнеров"
docker compose -f "$COMPOSE_FILE" ps

echo "▸ ждём 10 сек прогрева healthcheck'ов..."
sleep 10

echo "▸ итоговое состояние"
docker compose -f "$COMPOSE_FILE" ps

cat <<EOF

✓ Deploy завершён.

  Проверь:
    - https://app.${X10_BASE_DOMAIN}    — miniapp
    - https://admin.${X10_BASE_DOMAIN}  — admin
    - https://api.${X10_BASE_DOMAIN}/health  — должен вернуть 200

  Inngest dashboard внутри VPC: http://localhost:8288 (forward через SSH:
    ssh -L 8288:localhost:8288 <vm>).

  Логи:
    docker compose -f $COMPOSE_FILE logs -f api pipeline
EOF
