# T-2A-INFRA-005 — Runbook self-host telegram-bot-api

**Mục tiêu:** Cho phép upload video >20MB qua Telegram bot bằng cách tự host `telegram-bot-api` server trên VPS, thay thế cloud `api.telegram.org` (giới hạn cứng 20MB).

**Thời gian dự kiến:** 30-45 phút (lần đầu)
**Downtime bot:** ~5 phút (khi logOut + restart webhook)

---

## TL;DR

```
┌──────────────────────────────────────────────────────────────┐
│ TRƯỚC:  Telegram cloud api.telegram.org/getFile (20MB max)   │
│ SAU:    VPS localhost:8081/getFile (2GB max)                 │
│                                                              │
│ Public URL:                                                  │
│   https://portal.veraglobal.vn/tg-media/videos/file_xxx.mp4  │
│   ↓ (nginx proxy, token giấu server-side)                    │
│   http://localhost:8081/file/bot<TOKEN>/videos/file_xxx.mp4  │
└──────────────────────────────────────────────────────────────┘
```

---

## Pre-flight checklist

- [ ] Đã có **TELEGRAM_API_ID** + **TELEGRAM_API_HASH** từ https://my.telegram.org/apps
- [ ] SSH access vào VPS `72.60.40.232` (root hoặc sudo)
- [ ] Biết **TELEGRAM_BOT_TOKEN** (đang chạy production, thường ở env n8n)
- [ ] Đã backup workflow n8n hiện tại (`T-2A-N8N-001-candidate-wizard.json`) — nhỡ rollback
- [ ] User báo trước team Telegram: bot sẽ down ~5 phút trong window này

### Check Docker đã có chưa

```bash
ssh root@72.60.40.232
docker --version          # cần >= 20.10
docker compose version    # cần v2 (lệnh `docker compose`, không phải `docker-compose`)
```

Nếu chưa có Docker, cài:
```bash
curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose-plugin
systemctl enable --now docker
```

---

## Step 1: Copy files lên VPS

Trên **máy local** (terminal khác, đang ở repo):

```bash
cd /Users/apple/Coding/recruitment-agent-portal
scp -r deploy/telegram-bot-api/ root@72.60.40.232:/opt/
```

Trên **VPS**:
```bash
cd /opt/telegram-bot-api
ls -la
# Phải thấy: docker-compose.yml, .env.example, nginx-tg-media.conf, setup.sh
```

---

## Step 2: Tạo .env với credentials

Trên **VPS**:

```bash
cd /opt/telegram-bot-api
cp .env.example .env
nano .env
```

Sửa 2 dòng (giá trị từ Step 0):
```
TELEGRAM_API_ID=<điền số từ my.telegram.org>
TELEGRAM_API_HASH=<điền hex 32 ký tự>
```

Save (Ctrl+O, Enter, Ctrl+X).

Set permission (file chứa secret):
```bash
chmod 600 .env
```

---

## Step 3: ⚠️ logOut bot khỏi cloud (one-way)

**QUAN TRỌNG:** Bước này KHÔNG REVERSE được trong vòng 10 phút. Sau khi `logOut`, bot CHỈ làm việc với local server. Nếu muốn quay lại cloud → phải logOut khỏi local rồi đợi 10 phút.

Trên **VPS** (hoặc bất kỳ đâu có internet):

```bash
# Lấy bot token từ env n8n (hoặc paste trực tiếp nếu nhớ)
BOT_TOKEN="<paste-bot-token-here>"

# Verify token đúng trước khi logOut
curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getMe" | python3 -m json.tool
# Phải thấy {"ok": true, "result": {"id": ..., "username": "Bangladesh_Recruitment_Bot"}}

# logOut khỏi cloud
curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/logOut"
# Kết quả: {"ok":true,"result":true,"description":"Bot logged out"}
```

Sau lệnh này:
- ❌ Không gọi được `api.telegram.org/bot<TOKEN>/...` nữa (sẽ trả `Unauthorized`)
- ✅ Bot ready để dùng local server

---

## Step 4: Khởi động telegram-bot-api server

Trên **VPS**:

```bash
cd /opt/telegram-bot-api
chmod +x setup.sh
./setup.sh
```

Script sẽ:
1. Check Docker
2. Validate `.env`
3. Pull image `aiogram/telegram-bot-api:latest` (~18MB)
4. Khởi động container `127.0.0.1:8081`
5. Verify server lắng nghe

Sau khi chạy xong, test thủ công:

```bash
# Bot phải tự động đăng ký với local server lần đầu (close=true → server load token)
curl "http://127.0.0.1:8081/bot${BOT_TOKEN}/getMe"
# Kết quả: {"ok":true,"result":{...}}

# Test getFile (nếu có file_id)
curl "http://127.0.0.1:8081/bot${BOT_TOKEN}/getMe"
```

Logs:
```bash
docker compose logs -f telegram-bot-api
# Phải thấy "[INFO] Telegram Bot API server started" hoặc tương đương
```

---

## Step 5: Update nginx — thêm location /tg-media/

Trên **VPS**:

### 5.1. Lấy bot token để inject vào nginx config

```bash
BOT_TOKEN="<paste-bot-token-here>"

# Tạo file config có sẵn token
cd /opt/telegram-bot-api
sed "s|__BOT_TOKEN__|${BOT_TOKEN}|g" nginx-tg-media.conf > /tmp/nginx-tg-media-final.conf
```

### 5.2. Mở file nginx hiện tại

```bash
nano /etc/nginx/conf.d/domains/portal.veraglobal.vn.ssl.conf
```

Trong `server { listen ...:443 ssl; ... }`, **thêm đoạn sau VÀO TRƯỚC `location / { ... }`**:

```nginx
location ^~ /tg-media/ {
    access_log /var/log/nginx/portal.veraglobal.vn.tg-media.access.log;
    error_log  /var/log/nginx/portal.veraglobal.vn.tg-media.error.log;

    rewrite ^/tg-media/(.*)$ /file/bot<PASTE_BOT_TOKEN_HERE>/$1 break;
    proxy_pass http://127.0.0.1:8081;

    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_buffering off;
    proxy_request_buffering off;
    proxy_max_temp_file_size 0;
    proxy_connect_timeout 30s;
    proxy_send_timeout    300s;
    proxy_read_timeout    300s;

    add_header Cache-Control "public, max-age=86400, immutable" always;
}
```

**THAY** `<PASTE_BOT_TOKEN_HERE>` bằng giá trị `BOT_TOKEN` thật (vd `1234567:ABC-DEF...`).

> Nếu lười copy-paste manual, có thể chạy:
> ```bash
> # Tạo file mới có sẵn token, copy nội dung vào nginx config
> cat /tmp/nginx-tg-media-final.conf
> # → copy output, paste vào nginx config
> ```

### 5.3. Tăng `client_max_body_size` (cho upload bot >50MB)

Trong cùng `server {}` block, sửa:
```nginx
client_max_body_size 50m;
```
→
```nginx
client_max_body_size 2g;
```

### 5.4. Test + reload nginx

```bash
nginx -t
# Phải thấy "syntax is ok" và "test is successful"

systemctl reload nginx
```

### 5.5. Xóa file token tạm

```bash
rm /tmp/nginx-tg-media-final.conf
shred -u /tmp/nginx-tg-media-final.conf 2>/dev/null || true
```

---

## Step 6: Test nginx proxy

Cần 1 file_id thật để test. Cách lấy:
1. Mở Telegram, gửi 1 video bất kỳ vào @Bangladesh_Recruitment_Bot
2. Chờ vài giây để bot nhận (qua webhook n8n hoặc direct)
3. Trên VPS:
   ```bash
   curl "http://127.0.0.1:8081/bot${BOT_TOKEN}/getUpdates" | python3 -m json.tool
   # Tìm "file_id" trong "video" hoặc "document"
   ```
4. Lấy file_path:
   ```bash
   FILE_ID="<paste-file-id>"
   curl "http://127.0.0.1:8081/bot${BOT_TOKEN}/getFile?file_id=${FILE_ID}" | python3 -m json.tool
   # Lấy "file_path" — vd "videos/file_5.mp4"
   ```
5. Test public URL:
   ```bash
   curl -I "https://portal.veraglobal.vn/tg-media/videos/file_5.mp4"
   # Phải thấy "HTTP/2 200" và "Content-Type: video/mp4"
   ```

Nếu HTTP 200 + content-type đúng → nginx proxy OK!

---

## Step 7: Update n8n — join tg_net + thêm env vars

n8n và telegram-bot-api cùng chạy Docker. Để n8n gọi được `telegram-bot-api` qua
service name (`http://telegram-bot-api:8081`) thay vì IP gateway, cả 2 container phải
join cùng Docker network `tg_net`.

Repo đã chuẩn sẵn compose mới và script tự động tại `deploy/n8n/`.

### 7.1. Copy files lên VPS

Trên **máy local**:

```bash
cd /Users/apple/Coding/recruitment-agent-portal
scp -r deploy/n8n/ root@72.60.40.232:/opt/n8n-update/
```

Trên **VPS**, verify:

```bash
ls /opt/n8n-update/
# Phải thấy: docker-compose.yml  .env.example  env-snippet.txt  migrate.sh
```

### 7.2. Chạy migrate script

```bash
chmod +x /opt/n8n-update/migrate.sh
bash /opt/n8n-update/migrate.sh
```

Script tự động:
1. Tạo Docker network `tg_net` (nếu chưa có)
2. Backup `/opt/n8n/docker-compose.yml` → `docker-compose.yml.bak-<timestamp>`
3. Thay bằng compose mới (có `networks: tg_net`)
4. Append 2 env vars vào `/opt/n8n/.env` (idempotent):
   ```
   TELEGRAM_BOT_API_BASE_URL=http://telegram-bot-api:8081
   TELEGRAM_PUBLIC_FILE_BASE=https://portal.veraglobal.vn/tg-media
   ```
5. `docker compose down && docker compose up -d`
6. Verify container running + healthz

> **Nếu n8n không nằm ở `/opt/n8n/`**, chỉ định đường dẫn:
> ```bash
> N8N_DIR=/srv/n8n bash /opt/n8n-update/migrate.sh
> ```

### 7.3. Cập nhật Telegram Trigger credential trong n8n UI

Sau khi migrate, Telegram Trigger node cần biết base URL của local server.
Env vars trên chỉ cho HTTP Request nodes — Trigger node dùng credential riêng:

1. n8n UI → **Credentials** → chọn credential kiểu **Telegram API** đang dùng
2. Thêm / sửa trường **Base URL**: `http://telegram-bot-api:8081`
3. Save credential

> Nếu không sửa Trigger credential, webhook vẫn đăng ký với `api.telegram.org` (sẽ fail
> vì bot đã logOut khỏi cloud ở Step 3).

---

## Step 8: Import workflow mới

### 8.1. Backup workflow cũ

Trong n8n UI:
1. Vào workflow "T-2A-N8N-001 Candidate Wizard"
2. **Top-right → Download** → save file `.json` (backup)

### 8.2. Import workflow mới

1. Trên local: file `n8n-workflows/T-2A-N8N-001-candidate-wizard.json` đã được update (commit T-2A-INFRA-005)
2. Pull file mới về máy:
   ```bash
   git pull origin devin/t-2a-infra-005-telegram-bot-api
   ```
3. Trong n8n UI:
   - Workflow → Import from File → chọn file đã pull
   - Hoặc copy paste JSON
4. Sau khi import, **DEACTIVATE** workflow cũ và **ACTIVATE** workflow mới

### 8.3. Setup webhook lại

Vì bot vừa logOut + đăng ký local server → webhook cũ **mất**. Phải set lại:

```bash
BOT_TOKEN="<paste>"
WEBHOOK_URL="https://portal.veraglobal.vn/api/n8n-webhook/<workflow-webhook-path>"
# (Lấy URL webhook từ n8n workflow node "Webhook" trong UI)

curl -s -X POST "http://127.0.0.1:8081/bot${BOT_TOKEN}/setWebhook" \
  -d "url=${WEBHOOK_URL}" \
  -d "drop_pending_updates=true"
# Kết quả: {"ok":true,"result":true}

# Verify
curl "http://127.0.0.1:8081/bot${BOT_TOKEN}/getWebhookInfo" | python3 -m json.tool
```

---

## Step 9: Test end-to-end

### TC1: Bot vẫn nhận message
1. Mở Telegram → chat bot → gõ `/help` → bot phản hồi list 4 lệnh

### TC2: Upload avatar (small file ~2MB)
1. Gõ `/add` → chọn order → upload passport (PDF)
2. Khi tới bước avatar → gửi ảnh ~2MB
3. Verify: bot prompt sang video upload (không silent)

### TC3: Upload video small (~5MB) — sanity check
1. Tiếp tục flow: gửi video 5MB
2. Bot prompt consent checklist → toggle 6 nút → finalize
3. Verify candidate xuất hiện trong agent portal với:
   - URL video dạng `https://portal.veraglobal.vn/tg-media/videos/...`
   - Click play được trong CandidateCard

### TC4: Upload video LARGE (~50MB) — feature mới chính
1. Lặp lại TC3 với video 50MB
2. Bot phải accept (không "Video too large")
3. Public URL load được từ browser

### TC5: Upload video VERY LARGE (~200MB) — stress test (optional)
- Telegram client có thể gửi tới 2GB qua Telegram Desktop
- Test xem nginx + telegram-bot-api có handle được không

---

## Disk monitoring

File telegram cache lưu vĩnh viễn ở Docker volume `tg-bot-api-data`. Theo thời gian sẽ tăng. Setup alert:

```bash
# Check kích thước hiện tại
docker system df -v | grep tg-bot-api-data

# Hoặc xem trực tiếp
docker run --rm -v telegram-bot-api_tg-bot-api-data:/data alpine du -sh /data
```

Cron weekly check:
```bash
# /etc/cron.weekly/tg-bot-api-disk
#!/bin/bash
SIZE=$(docker run --rm -v telegram-bot-api_tg-bot-api-data:/data alpine du -s /data | awk '{print $1}')
THRESHOLD=$((20 * 1024 * 1024))  # 20GB in KB
if [ "$SIZE" -gt "$THRESHOLD" ]; then
    echo "telegram-bot-api volume vượt 20GB, hiện $((SIZE / 1024 / 1024))GB" | mail -s "TG bot disk alert" admin@veraglobal.vn
fi
```

> Nếu disk gần đầy → cleanup file cũ:
> ```bash
> docker exec telegram-bot-api find /var/lib/telegram-bot-api -mtime +90 -delete
> # Xóa file >90 ngày. Cẩn thận: file_id Telegram vẫn valid, nhưng URL cũ bị 404.
> ```

---

## Rollback plan (nếu fail)

Nếu test thất bại, quay về cloud API trong 5 phút:

```bash
# 1. Stop self-host server
cd /opt/telegram-bot-api
docker compose down

# 2. logOut khỏi local
BOT_TOKEN="<paste>"
docker compose up -d
sleep 3
curl -X POST "http://127.0.0.1:8081/bot${BOT_TOKEN}/logOut"
docker compose down

# 3. Đợi 10 phút (Telegram requirement)

# 4. Restart bot trên cloud (đăng ký lại webhook về workflow CŨ)
curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -d "url=<old-workflow-webhook>" \
  -d "drop_pending_updates=true"

# 5. Trong n8n UI: deactivate workflow mới, activate workflow cũ (đã backup)

# 6. Revert nginx
nano /etc/nginx/conf.d/domains/portal.veraglobal.vn.ssl.conf
# Xóa `location ^~ /tg-media/` block
nginx -t && systemctl reload nginx
```

---

## Acceptance criteria

- [ ] `docker compose ps` thấy `telegram-bot-api` Up + healthcheck pass
- [ ] `curl http://127.0.0.1:8081/bot<TOKEN>/getMe` trả `{"ok":true}`
- [ ] `curl https://portal.veraglobal.vn/tg-media/<some-file-path>` trả HTTP 200
- [ ] Bot reply `/help` → 4 lệnh
- [ ] Upload video 50MB qua bot → finalize thành công, agent portal load video
- [ ] Disk usage `/var/lib/telegram-bot-api` <2GB sau 1 tuần test (~1MB/file × N candidates)
- [ ] Log nginx `tg-media.access.log` có entries 200 mỗi lần agent click play

---

## Bảo mật notes

1. **Token chỉ ở server-side:** URL public `/tg-media/<path>` không chứa BOT_TOKEN. Nginx inject token khi rewrite. Browser/agent không thấy token.

2. **File path là random hash:** `videos/file_xxx.mp4` với `xxx` là số random từ Telegram. Khó guess → security through obscurity. Nhưng KHÔNG đủ với attacker đã có 1 URL valid (có thể fuzz). Nếu cần auth thật:
   - Option: signed URL với HMAC + expires (nginx có module `secure_link`).
   - Option: yêu cầu cookie session từ portal.

3. **CSP:** Nếu Next.js có Content-Security-Policy, thêm `portal.veraglobal.vn` vào `media-src` directive.

4. **Rate limit:** Có thể thêm `limit_req_zone` trong nginx nếu lo DDoS qua /tg-media/.

5. **Firewall:** Đảm bảo port 8081 KHÔNG mở public. Verify:
   ```bash
   ufw status | grep 8081  # phải không có rule allow
   netstat -tnlp | grep 8081  # phải bind 127.0.0.1, không 0.0.0.0
   ```

---

## Contact troubleshooting

| Symptom | Possible cause | Fix |
|---|---|---|
| `curl localhost:8081` connection refused | Container không chạy | `docker compose ps` + `docker compose logs` |
| Bot trả `Unauthorized` | Chưa logOut khỏi cloud, hoặc TOKEN sai | Verify token với `getMe` lần nữa |
| `/tg-media/` trả 502 Bad Gateway | nginx config sai upstream | Check `nginx -T` xem rewrite + proxy_pass đúng port |
| Video upload >20MB vẫn lỗi | n8n chưa update env, hoặc workflow cũ | Verify env n8n + workflow phải là version mới |
| `getFile` trả `file is too big` | Bot vẫn ở cloud | Check `getMe` từ cloud — phải fail |

---

**Tác giả:** Devin (Architect + Builder)
**Ngày:** 2026-04-30
**Task:** T-2A-INFRA-005
