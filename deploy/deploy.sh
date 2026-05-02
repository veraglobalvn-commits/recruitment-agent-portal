#!/bin/bash
set -e

echo "=========================================="
echo "  Deploy portal.veraglobal.vn"
echo "=========================================="

cd /var/www/portal

echo ""
echo "[1/5] Pull code mới nhất từ main..."
git pull origin main
echo "  -> Pull thành công."

echo ""
echo "[2/5] Cài dependencies..."
npm ci --production=false
echo "  -> Dependencies đã cài xong."

echo ""
echo "[3/5] Build Next.js..."
npm run build
echo "  -> Build thành công."

echo ""
echo "[4/5] Sync static assets + restart portal..."
rsync -a .next/static .next/standalone/.next/
systemctl restart portal
echo "  -> Portal đã restart."

echo ""
echo "[5/5] Kiểm tra status..."
sleep 3
systemctl is-active --quiet portal && echo "  -> portal: active ✓" || echo "  -> portal: FAILED ✗"
curl -s -o /dev/null -w "  -> HTTP status: %{http_code}\n" https://portal.veraglobal.vn/

echo ""
echo "=========================================="
echo "  Deploy thành công!"
echo "=========================================="
