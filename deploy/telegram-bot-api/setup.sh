#!/bin/bash
# T-2A-INFRA-005 — Setup script cho telegram-bot-api self-host
#
# Cách dùng:
#   chmod +x setup.sh
#   ./setup.sh
#
# Yêu cầu:
#   - Root hoặc sudo
#   - Docker + docker compose v2 đã cài
#   - File .env (copy từ .env.example) với TELEGRAM_API_ID + TELEGRAM_API_HASH
#   - Bot đã logOut khỏi cloud (xem runbook step 5)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "  T-2A-INFRA-005: telegram-bot-api self-host"
echo "=========================================="
echo ""

# 1. Check Docker
echo "[1/5] Kiểm tra Docker..."
if ! command -v docker &> /dev/null; then
  echo "  -> LỖI: Docker chưa cài. Cài Docker trước:"
  echo "     curl -fsSL https://get.docker.com | sh"
  exit 1
fi

if ! docker compose version &> /dev/null; then
  echo "  -> LỖI: docker compose v2 chưa có. Cài plugin:"
  echo "     apt-get install docker-compose-plugin"
  exit 1
fi
echo "  -> Docker $(docker --version | awk '{print $3}' | tr -d ',') OK."
echo "  -> Compose $(docker compose version --short) OK."

# 2. Check .env
echo ""
echo "[2/5] Kiểm tra .env..."
if [ ! -f "$SCRIPT_DIR/.env" ]; then
  echo "  -> LỖI: $SCRIPT_DIR/.env không tồn tại."
  echo "     cp .env.example .env"
  echo "     nano .env  # điền TELEGRAM_API_ID + TELEGRAM_API_HASH"
  exit 1
fi

# Validate env có 2 biến
if ! grep -q "^TELEGRAM_API_ID=" "$SCRIPT_DIR/.env" || ! grep -q "^TELEGRAM_API_HASH=" "$SCRIPT_DIR/.env"; then
  echo "  -> LỖI: .env thiếu TELEGRAM_API_ID hoặc TELEGRAM_API_HASH"
  exit 1
fi
# Check không phải giá trị mặc định
if grep -q "^TELEGRAM_API_ID=12345678$" "$SCRIPT_DIR/.env"; then
  echo "  -> LỖI: .env vẫn dùng TELEGRAM_API_ID mặc định, sửa thành giá trị thật"
  exit 1
fi
echo "  -> .env hợp lệ."

# 3. Pull image
echo ""
echo "[3/5] Pull image aiogram/telegram-bot-api:latest..."
docker compose pull
echo "  -> Pull xong."

# 4. Khởi động container
echo ""
echo "[4/5] Khởi động telegram-bot-api..."
docker compose up -d
sleep 3

# 5. Verify
echo ""
echo "[5/5] Verify..."
if ! docker compose ps --status running | grep -q telegram-bot-api; then
  echo "  -> LỖI: Container không chạy. Logs:"
  docker compose logs --tail=30
  exit 1
fi

# Test ping
if curl -sf -o /dev/null -w "%{http_code}" http://127.0.0.1:8081/ | grep -q "404\|405"; then
  # 404/405 là OK — server chạy nhưng path / không có handler
  echo "  -> Server lắng nghe tại http://127.0.0.1:8081 OK."
else
  echo "  -> CẢNH BÁO: Server không phản hồi tại 127.0.0.1:8081. Kiểm tra logs:"
  docker compose logs --tail=20
fi

echo ""
echo "=========================================="
echo "  Setup hoàn tất!"
echo "=========================================="
echo ""
echo "Tiếp theo:"
echo "  - Test bot: curl 'http://127.0.0.1:8081/bot<BOT_TOKEN>/getMe'"
echo "    (kết quả {ok:true,...} = thành công)"
echo "  - Update nginx: xem nginx-tg-media.conf"
echo "  - Logs:    docker compose logs -f"
echo "  - Stop:    docker compose down"
echo "  - Restart: docker compose restart"
echo ""
