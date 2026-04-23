#!/bin/bash
set -e

echo "=========================================="
echo "  Setup VPS cho portal.veraglobal.vn"
echo "=========================================="

# 1. Cài Node.js 22 LTS qua NodeSource
echo ""
echo "[1/8] Kiểm tra Node.js..."
REQUIRED_NODE=22
CURRENT_NODE=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1 || echo "0")

if [ "$CURRENT_NODE" -lt "$REQUIRED_NODE" ] 2>/dev/null; then
  echo "  -> Node.js chưa có hoặc version thấp hơn 22. Đang cài Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
  echo "  -> Node.js $(node --version) đã được cài."
else
  echo "  -> Node.js $(node --version) OK."
fi

# 2. Cài PM2 globally nếu chưa có
echo ""
echo "[2/8] Kiểm tra PM2..."
if ! command -v pm2 &> /dev/null; then
  echo "  -> Đang cài PM2..."
  npm install -g pm2
  echo "  -> PM2 $(pm2 --version) đã được cài."
else
  echo "  -> PM2 $(pm2 --version) OK."
fi

# 3. Tạo thư mục /var/www/portal
echo ""
echo "[3/8] Tạo thư mục /var/www/portal..."
mkdir -p /var/www/portal
echo "  -> Thư mục đã sẵn sàng."

# 4. Clone repo
echo ""
echo "[4/8] Clone repo..."
REPO_URL="https://github.com/veraglobalvn-commits/recruitment-agent-portal.git"

if [ -d "/var/www/portal/.git" ]; then
  echo "  -> Repo đã tồn tại, bỏ qua clone."
else
  git clone "$REPO_URL" /var/www/portal
  echo "  -> Clone thành công."
fi

cd /var/www/portal

# 5. Cài dependencies (bao gồm devDependencies để build)
echo ""
echo "[5/8] Cài dependencies..."
npm ci --production=false
echo "  -> Dependencies đã cài xong."

# 6. Nhắc tạo .env.local
echo ""
echo "[6/8] *** DỪNG LẠI ***"
echo "  -> Tạo file /var/www/portal/.env.local với các biến môi trường trước khi build:"
echo ""
echo "  NEXT_PUBLIC_SUPABASE_URL="
echo "  NEXT_PUBLIC_SUPABASE_ANON_KEY="
echo "  SUPABASE_SERVICE_ROLE_KEY="
echo "  OCR_SPACE_API_KEY="
echo "  OPENAI_API_KEY="
echo "  NEXT_PUBLIC_N8N_UPLOAD_URL="
echo "  NEXT_PUBLIC_N8N_VIDEO_UPDATE_URL="
echo "  OPENROUTER_API_KEY="
echo "  NEXT_PUBLIC_N8N_RECRUITMENT_DOC_URL="
echo ""
echo "  Sau khi tạo xong .env.local, nhấn Enter để tiếp tục..."
read -r

if [ ! -f "/var/www/portal/.env.local" ]; then
  echo "  -> LỖI: Không tìm thấy /var/www/portal/.env.local. Dừng lại."
  exit 1
fi
echo "  -> .env.local đã tìm thấy."

# 7. Build
echo ""
echo "[7/8] Build Next.js..."
npm run build
echo "  -> Build thành công."

# 8. Start với PM2
echo ""
echo "[8/8] Khởi động với PM2..."
pm2 start /var/www/portal/ecosystem.config.js
pm2 save
# Tự động thực thi lệnh startup mà pm2 sinh ra (kích hoạt tự khởi động khi reboot)
env PATH="$PATH:/usr/bin" pm2 startup systemd -u root --hp /root | tail -n1 | bash
pm2 save

echo ""
echo "=========================================="
echo "  Setup hoàn tất!"
echo "=========================================="
echo ""
echo "Bước tiếp theo:"
echo "  1. Copy deploy/nginx-portal-http.conf vào /etc/nginx/conf.d/domains/portal.veraglobal.vn.conf"
echo "  2. nginx -t && systemctl reload nginx"
echo "  3. certbot certonly --nginx -d portal.veraglobal.vn"
echo "  4. Copy deploy/nginx-portal.conf vào /etc/nginx/conf.d/domains/portal.veraglobal.vn.ssl.conf"
echo "  5. rm /etc/nginx/conf.d/domains/portal.veraglobal.vn.conf"
echo "  6. nginx -t && systemctl reload nginx"
echo ""
echo "  Xem logs: pm2 logs portal"
echo "  Xem status: pm2 status"
