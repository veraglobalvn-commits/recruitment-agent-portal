# AGENTS.md

## Quy tắc bắt buộc (BẮT BUỘC — áp dụng mọi session, mọi agent)

- **TUYỆT ĐỐI KHÔNG** paste code, diff, nội dung file, hay output dài ra chat.
- Chỉ báo cáo: file nào đã đọc/sửa, làm gì, kết quả ra sao.
- Nếu cần tham chiếu: dùng `<ref_file />` hoặc `<ref_snippet />`. KHÔNG quote nội dung file dù chỉ vài dòng.
- Ngoại lệ duy nhất được phép hiện nội dung:
  1. User yêu cầu rõ ràng "cho tôi xem code/nội dung"
  2. Shell command ngắn user cần chạy trên VPS (không phải nội dung file)
- **Vi phạm thường gặp cần tránh:** đọc file rồi quote lại → dùng ref_snippet thay thế.

---

## Quy tắc kỹ thuật bắt buộc

### Role mới = phải update RLS đồng thời

Khi thêm role mới hoặc thay đổi quyền của role trong `lib/permissions.ts`, **BẮT BUỘC** kiểm tra và cập nhật đồng thời RLS policies trong Supabase:

1. Đọc tất cả migration files trong `supabase/migrations/` để xác định mọi policy có liên quan.
2. Với mỗi policy dùng `get_current_user_role() IN (...)`: kiểm tra role mới đã có trong list chưa.
3. Nếu thiếu: viết migration SQL mới (`supabase/migrations/YYYYMMDD_fix_rls_<role>.sql`) và yêu cầu user chạy ngay trên Supabase SQL Editor.
4. **Không được commit code app** sử dụng role mới khi chưa confirm RLS đã được update.

**Lý do:** Role defined ở app-level (`lib/permissions.ts`) hoàn toàn độc lập với DB-level RLS. App có thể query đúng, nhưng Supabase trả về empty rows vì RLS block — không có error, chỉ có silent empty result. Đây là bug khó phát hiện nhất.

**Incident 2026-05-23:** Role `'member'` có trong `lib/permissions.ts` từ lâu, nhưng tất cả RLS policies trên `orders`, `candidates`, `companies`, `order_agents` đều thiếu `'member'` → member login vào thấy 0 orders, 0 candidates. Fix: `supabase/migrations/20260523000001_add_member_role_to_rls.sql`.

---

## Session notes (2026-05-01)

### Production runtime + deploy (critical)
- Production app must run on port `3001`.
- **Process manager: systemd** — service name `portal` (created 2026-05-02).
  - Start/stop: `systemctl start portal` / `systemctl stop portal`
  - Restart: `systemctl restart portal`
  - Logs: `journalctl -u portal -f`
  - Auto-starts on boot + auto-restarts on crash (`Restart=always`).
  - Service file: `/etc/systemd/system/portal.service`
  - EnvironmentFile: `/var/www/portal/.env.local`
  - **KHÔNG dùng** `nohup node ...` hay manual start nữa.
- After each `next build`, copy static assets for standalone runtime:
  - `rsync -a .next/static .next/standalone/.next/`
- If this copy is skipped, route JS chunks can 404 and users may see blank page.

### Health checks
- Verify app process listening: `ss -ltnp | grep :3001`
- Verify portal: `curl -s -o /dev/null -w "portal=%{http_code}\n" https://portal.veraglobal.vn/`

### Checklist sau mỗi lần rebuild portal (BẮT BUỘC)
Sau khi thay đổi `.env.local` và rebuild, chạy lệnh sau để verify secrets khớp:
```bash
N8N=$(docker exec n8n env | grep TELEGRAM_BRIDGE_SECRET | cut -d= -f2)
PORTAL=$(grep TELEGRAM_BRIDGE_SECRET /var/www/portal/.env.local | cut -d= -f2)
[ "$N8N" = "$PORTAL" ] && echo "OK: secrets match" || echo "MISMATCH: fix n8n .env then docker compose up -d"
```
Nếu MISMATCH: `sed -i "s/TELEGRAM_BRIDGE_SECRET=.*/TELEGRAM_BRIDGE_SECRET=$PORTAL/" /var/www/portal/deploy/n8n/.env && cd /var/www/portal/deploy/n8n && docker compose up -d`

### ⚠️ CRITICAL — docker compose up -d n8n (BẮT BUỘC ĐỌC TRƯỚC KHI CHẠY)

**Bất kỳ lúc nào chạy `docker compose up -d` cho n8n** (dù chỉ để thêm 1 env var mới), container sẽ bị **RECREATE** và load lại toàn bộ từ file `.env`. Nếu file `.env` có secret cũ/sai → bot lỗi ngay.

**LUÔN chạy 2 bước này TRƯỚC `docker compose up -d`:**
```bash
# Bước 1: Fix TELEGRAM_BRIDGE_SECRET trong .env file (không phải trong container)
PORTAL=$(grep TELEGRAM_BRIDGE_SECRET /var/www/portal/.env.local | cut -d= -f2)
sed -i "s/TELEGRAM_BRIDGE_SECRET=.*/TELEGRAM_BRIDGE_SECRET=$PORTAL/" /var/www/portal/deploy/n8n/.env

# Bước 2: Verify trước khi up
grep TELEGRAM_BRIDGE_SECRET /var/www/portal/deploy/n8n/.env
```

**Sau `docker compose up -d`, LUÔN verify lại:**
```bash
N8N=$(docker exec n8n env | grep TELEGRAM_BRIDGE_SECRET | cut -d= -f2)
PORTAL=$(grep TELEGRAM_BRIDGE_SECRET /var/www/portal/.env.local | cut -d= -f2)
[ "$N8N" = "$PORTAL" ] && echo "OK" || echo "MISMATCH — bot sẽ lỗi!"
```

**Lý do lỗi hay lặp lại:** Các lần fix trước chỉ sửa secret trong container đang chạy (qua env override), không ghi vào file `.env`. Mỗi lần recreate container là mất fix đó. Fix đúng là phải `sed -i` vào file `.env` trước khi `docker compose up -d`. (Incident 2026-05-04, 2026-05-05)

### Session notes (2026-05-02) — incident recovery + bot UX fixes

#### Incident: n8n data loss + recovery (2026-05-02)
- Root cause: `docker compose up --force-recreate` tạo volume mới `n8n_n8n_data` (rỗng), data thật ở `n8n_n8n_data/.n8n/database.sqlite` (2.39 GB).
- Recovery: mount volume tại `/home/node` (không phải `/home/node/.n8n`) → n8n đọc `.n8n/` subdirectory đúng.
- Encryption key gốc: `ldXQwQUsQEZavpf0dzoQJc92GxbbAeBW` (từ `/data/.n8n/config`).
- **Bài học**: Luôn `docker inspect <container>` + `ls volume` TRƯỚC khi recreate bất kỳ stateful container.

#### n8n env vars bắt buộc (đã set trong `/var/www/portal/deploy/n8n/.env`)
- `N8N_ENCRYPTION_KEY=ldXQwQUsQEZavpf0dzoQJc92GxbbAeBW`
- `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` — bắt buộc để `$env.*` hoạt động trong **cả HTTP node expressions lẫn Code nodes**
- `NODE_FUNCTION_ALLOW_BUILTIN=crypto` — bắt buộc để `require('crypto')` hoạt động
- `TELEGRAM_BOT_TOKEN=...` — token bot (hardcode hoặc env)
- `TELEGRAM_BRIDGE_SECRET=42b777...` — phải khớp với portal `.env.local`
- `APP_URL=https://portal.veraglobal.vn` — để finalize URL đầy đủ
- `WEBHOOK_URL=https://n8n.veraglobal.vn/` — để Telegram Trigger activate đúng
- `N8N_PROXY_HOPS=1` — bắt buộc khi n8n chạy sau nginx proxy; thiếu sẽ gây `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` và webhook fail

#### n8n Docker network (quan trọng)
- Container n8n phải ở CẢ HAI networks: `tg_net` VÀ `n8n_default`
- `tg_net`: để gọi `telegram-bot-api` và `tg-file-server` by service name
- `n8n_default`: để có internet access (Supabase DNS, v.v.) — **thiếu network này thì Supabase không resolve được**
- Đã cố định trong `docker-compose.yml` tại `/var/www/portal/deploy/n8n/` (dùng `- default` trong networks list)
- `telegram-bot-api` container PHẢI được connect vào `tg_net`: `docker network connect tg_net telegram-bot-api`
  - Không persistent — nếu container recreate phải connect lại
  - Cần thêm `tg_net` vào `deploy/telegram-bot-api/docker-compose.yml` để tự động

#### telegram-bot-api (INFRA-005)
- Phải chạy với `TELEGRAM_LOCAL: "1"` để bypass giới hạn 20MB getFile
- `TELEGRAM_API_ID` và `TELEGRAM_API_HASH` bắt buộc trong `.env` (lấy từ my.telegram.org)
- `.env` file tại `/var/www/portal/deploy/telegram-bot-api/.env` — KHÔNG commit
- Volume: `telegram-bot-api_tg-bot-api-data` — shared với `tg-file-server`
- File-server serve tại `http://file-server:9000/<TOKEN>/<relative_path>`

#### Bot UX fixes (commit 81af926)
- `full_name` từ OCR được trả về API response và lưu vào session
- Confirmation message dùng `order_id` thay vì `job_type_en — company_name_en`
- Order button: `order_id (count/total)` thay vì job/company info
- Finalize: `sendPhoto` với avatar + caption khi có avatar_url, fallback `sendMessage`
- `HTTP: Send TG 7`: dynamic endpoint (`sendPhoto` vs `sendMessage`)

#### Passport media (T-2A-VPS-003)
- Files lưu tại: `/var/www/media/candidates/{order_id}/{id_ld}/passport_{ts}.jpg`
- URL build từ `NEXT_PUBLIC_APP_URL` (phải là HTTPS) trong portal `.env.local`
- Nginx phải serve `/media/` → `/var/www/media/` (xem `scripts/nginx-media.conf`)
- Setup script: `scripts/setup-vps-media.sh`

---

### Telegram Bot API infra (INFRA-005)
- Host port `8081` is occupied by another service on this VPS; telegram-bot-api binds host `127.0.0.1:8082 -> container:8081`.
- n8n calls telegram-bot-api via Docker network service name (`http://telegram-bot-api:8081`) inside `n8n_default` network.
- Public media serving uses `/tg-media/` with local file-server sidecar (`tg-file-server`, port `9000`) due incompatibilities observed with direct Bot API file endpoint in this environment.

### n8n workflow operational notes
- Candidate wizard workflow migrated to native Supabase nodes for `bot_sessions` persistence (no HTTP header env dependency).
- Deep-link candidate UX implemented for `/order/<id>?candidate=<id_ld>` with focus behavior.
- **`TELEGRAM_BOT_TOKEN`** phải được set trong `/var/www/portal/deploy/n8n/.env` — workflow dùng `$env.TELEGRAM_BOT_TOKEN` thay vì hardcode. Nếu thiếu, tất cả HTTP call Telegram API sẽ dùng URL `/bot[undefined]/...`.
- `TELEGRAM_BOT_API_BASE_URL` được đề cập trong docs cũ nhưng **KHÔNG được workflow đọc** — base URL đang hardcode `'http://telegram-bot-api:8081'` trực tiếp trong node URL.
- Fallback `|| 'https://api.telegram.org'` trong node URLs là dead code (string literal luôn truthy).

### n8n volume + mount (bài học quan trọng — 2026-05-02)
- Volume thật: `n8n_n8n_data` (project prefix `n8n` + volume name `n8n_data`)
- Cấu trúc bên trong volume: `(root)/.n8n/config` + `(root)/.n8n/database.sqlite` (2.2GB)
- **Mount đúng**: `n8n_data:/home/node` → n8n đọc `~/.n8n/` = `(root)/.n8n/` ✓
- **Mount SAI**: `n8n_data:/home/node/.n8n` → n8n đọc `(root)/config` (khác key) → crash
- `docker restart n8n` **KHÔNG reload env_file** — phải dùng `docker compose up -d`
- `docker compose up -d` (không `--force-recreate`) an toàn — không đụng volume

### Portal UI — Telegram link state (bug fix 2026-05-02)
- `preloadedAgentRef` trong `app/page.tsx` thiếu `telegram_user_id` ở cả 3 đường login
- Hậu quả: `setTelegramLinked(false)` luôn → banner "Connect Telegram" hiện dù đã link
- Fix (commit `f7e521a`): thêm `telegram_user_id` vào SELECT + preloadedAgentRef ở 3 nơi

### Database schema fact discovered
- In production `candidates` table, soft-delete columns expected by some app paths were inconsistent with runtime assumptions during this session.
- For telegram candidate API path, avoid introducing schema assumptions without checking live DB first.

### Bot wizard "An error occurred" — incident 2026-05-04

**Triệu chứng:** Bot trả "An error occurred. Please try again or type /cancel." mọi lúc.
**Nguyên nhân:** `TELEGRAM_BRIDGE_SECRET` mismatch giữa n8n và portal:
  - n8n `.env` có: `d5895243...` (64 ký tự)
  - Portal `.env.local` có: `42b777e8...` (64 ký tự)
  - n8n ký HMAC với secret sai → portal trả 401 `BAD_SIGNATURE` → wizard catch lỗi → gửi error message
**Fix:** Update `TELEGRAM_BRIDGE_SECRET` trong `/var/www/portal/deploy/n8n/.env` = giá trị của portal, rồi `docker compose up -d`
**Verify lệnh:**
  ```bash
  # So sánh 2 bên
  docker exec n8n env | grep TELEGRAM_BRIDGE_SECRET
  grep TELEGRAM_BRIDGE_SECRET /var/www/portal/.env.local
  # Phải giống nhau hoàn toàn
  ```
**HMAC format (đúng, không đổi):** `HMAC-SHA256(secret, "${timestamp}.${rawBody}")` — headers: `x-bridge-timestamp` + `x-bridge-signature`
**Bài học:** Khi thay đổi `.env.local` portal và rebuild, luôn kiểm tra secret khớp với n8n.

### Current rollback/stable reference used in this session
- Stable runtime commit used for recovery: `3e31a57`.
- This commit was used to restore portal health after failed deploy attempt.

### Remote deploy automation key (local machine)
- SSH deploy automation uses local key:
  - `/Users/apple/.ssh/sukien_bd2026_deploy`
