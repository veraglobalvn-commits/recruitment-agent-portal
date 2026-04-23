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
echo "[4/5] Reload PM2..."
pm2 reload portal
echo "  -> PM2 đã reload."

echo ""
echo "[5/5] Kiểm tra status..."
pm2 status portal

echo ""
echo "=========================================="
echo "  Deploy thành công!"
echo "=========================================="
