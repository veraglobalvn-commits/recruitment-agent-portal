#!/bin/bash
# T-2A-INFRA-005 — Migrate n8n Docker Compose để join tg_net
#
# Script này cập nhật n8n đang chạy trên VPS:
#   1. Tạo Docker network tg_net (nếu chưa có)
#   2. Backup compose cũ
#   3. Replace bằng compose mới (có networks: tg_net)
#   4. Append 2 env vars mới vào .env (idempotent)
#   5. Recreate container với network mới
#   6. Verify n8n chạy OK
#
# Cách dùng (trên VPS, sau khi đã scp deploy/n8n/ vào /opt/n8n-update/):
#   chmod +x /opt/n8n-update/migrate.sh
#   bash /opt/n8n-update/migrate.sh
#
# Nếu muốn custom đường dẫn n8n:
#   N8N_DIR=/srv/n8n bash /opt/n8n-update/migrate.sh
#
# Yêu cầu:
#   - n8n đang chạy Docker Compose tại $N8N_DIR (default: /opt/n8n)
#   - docker compose v2 đã cài
#   - telegram-bot-api container đang chạy (hoặc ít nhất compose đã up ở /opt/telegram-bot-api)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
N8N_DIR="${N8N_DIR:-/opt/n8n}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

echo "=========================================="
echo "  T-2A-INFRA-005: Migrate n8n to tg_net"
echo "=========================================="
echo "  n8n dir : $N8N_DIR"
echo "  script  : $SCRIPT_DIR"
echo ""

# ─── 1. Kiểm tra Docker ───────────────────────────────────────────────────────
echo "[1/6] Kiểm tra Docker..."
if ! command -v docker &>/dev/null; then
  echo "  -> LỖI: Docker chưa cài."
  exit 1
fi
if ! docker compose version &>/dev/null; then
  echo "  -> LỖI: docker compose v2 chưa có."
  exit 1
fi
echo "  -> Docker OK."

# ─── 2. Kiểm tra n8n dir ──────────────────────────────────────────────────────
echo ""
echo "[2/6] Kiểm tra $N8N_DIR..."
if [ ! -d "$N8N_DIR" ]; then
  echo "  -> LỖI: Thư mục $N8N_DIR không tồn tại."
  echo "     Đặt N8N_DIR=<đường dẫn thật> rồi chạy lại."
  exit 1
fi
if [ ! -f "$N8N_DIR/docker-compose.yml" ]; then
  echo "  -> LỖI: $N8N_DIR/docker-compose.yml không tồn tại."
  exit 1
fi
if [ ! -f "$N8N_DIR/.env" ]; then
  echo "  -> LỖI: $N8N_DIR/.env không tồn tại."
  echo "     Tạo .env từ .env.example rồi điền đủ giá trị trước khi migrate."
  exit 1
fi
echo "  -> OK."

# ─── 3. Tạo Docker network tg_net ────────────────────────────────────────────
echo ""
echo "[3/6] Đảm bảo Docker network tg_net tồn tại..."
if docker network inspect tg_net &>/dev/null; then
  echo "  -> tg_net đã có."
else
  docker network create tg_net
  echo "  -> Đã tạo tg_net."
fi

# ─── 4. Backup + replace compose ──────────────────────────────────────────────
echo ""
echo "[4/6] Backup + thay thế docker-compose.yml..."
BACKUP_FILE="$N8N_DIR/docker-compose.yml.bak-$TIMESTAMP"
cp "$N8N_DIR/docker-compose.yml" "$BACKUP_FILE"
echo "  -> Backup: $BACKUP_FILE"

cp "$SCRIPT_DIR/docker-compose.yml" "$N8N_DIR/docker-compose.yml"
echo "  -> Đã copy compose mới vào $N8N_DIR/docker-compose.yml"

# ─── 5. Append env vars (idempotent) ──────────────────────────────────────────
echo ""
echo "[5/6] Append env vars vào $N8N_DIR/.env (idempotent)..."

ENV_FILE="$N8N_DIR/.env"

append_env_if_missing() {
  local key="$1"
  local val="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    echo "  -> $key đã có, bỏ qua."
  else
    echo "${key}=${val}" >> "$ENV_FILE"
    echo "  -> Đã thêm $key."
  fi
}

append_env_if_missing "TELEGRAM_BOT_API_BASE_URL" "http://telegram-bot-api:8081"
append_env_if_missing "TELEGRAM_PUBLIC_FILE_BASE" "https://portal.veraglobal.vn/tg-media"

# ─── 6. Recreate container ────────────────────────────────────────────────────
echo ""
echo "[6/6] Recreate n8n container (down → up -d)..."
cd "$N8N_DIR"
docker compose down
docker compose up -d
sleep 5

# ─── Verify ───────────────────────────────────────────────────────────────────
echo ""
echo "Verify..."

if ! docker compose ps --status running | grep -q n8n; then
  echo "  -> LỖI: n8n container không chạy. Logs:"
  docker compose logs --tail=30
  echo ""
  echo "Rollback: cp $BACKUP_FILE $N8N_DIR/docker-compose.yml && docker compose up -d"
  exit 1
fi

# Health check qua port
if curl -sf -o /dev/null "http://127.0.0.1:5678/healthz"; then
  echo "  -> n8n healthz OK."
else
  echo "  -> CẢNH BÁO: /healthz không phản hồi. Kiểm tra thêm:"
  echo "     docker compose logs --tail=20"
fi

# Kiểm tra đã join tg_net
if docker inspect n8n 2>/dev/null | grep -q "tg_net"; then
  echo "  -> n8n đã join tg_net OK."
else
  echo "  -> CẢNH BÁO: n8n chưa thấy trong tg_net. Kiểm tra:"
  echo "     docker inspect n8n | grep -A5 Networks"
fi

echo ""
echo "=========================================="
echo "  Migration hoàn tất!"
echo "=========================================="
echo ""
echo "Tiếp theo (Step 8 — runbook):"
echo "  1. Cập nhật Telegram Trigger credential baseUrl trong n8n UI:"
echo "     Credentials → Telegram API → Base URL: http://telegram-bot-api:8081"
echo "  2. Import workflow mới: n8n-workflows/T-2A-N8N-001-candidate-wizard.json"
echo "  3. Set lại webhook: xem Step 8.3 trong runbook"
echo ""
echo "Rollback nếu cần:"
echo "  cp $BACKUP_FILE $N8N_DIR/docker-compose.yml"
echo "  cd $N8N_DIR && docker compose up -d"
