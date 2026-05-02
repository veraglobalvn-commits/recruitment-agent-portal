# AGENTS.md

## Quy tắc bắt buộc (BẮT BUỘC — áp dụng mọi session, mọi agent)

- **TUYỆT ĐỐI KHÔNG** paste code, diff, nội dung file, hay output dài ra chat.
- Chỉ báo cáo: file nào đã đọc/sửa, làm gì, kết quả ra sao.
- Nếu cần tham chiếu: dùng `<ref_file />` hoặc `<ref_snippet />`.
- Ngoại lệ duy nhất: user yêu cầu rõ ràng "cho tôi xem code/nội dung".

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

### Session notes (2026-05-02) — incident recovery + bot UX fixes

#### Incident: n8n data loss + recovery (2026-05-02)
- Root cause: `docker compose up --force-recreate` tạo volume mới `n8n_n8n_data` (rỗng), data thật ở `n8n_n8n_data/.n8n/database.sqlite` (2.39 GB).
- Recovery: mount volume tại `/home/node` (không phải `/home/node/.n8n`) → n8n đọc `.n8n/` subdirectory đúng.
- Encryption key gốc: `ldXQwQUsQEZavpf0dzoQJc92GxbbAeBW` (từ `/data/.n8n/config`).
- **Bài học**: Luôn `docker inspect <container>` + `ls volume` TRƯỚC khi recreate bất kỳ stateful container.

#### n8n env vars bắt buộc (đã set trong `/var/www/portal/deploy/n8n/.env`)
- `N8N_ENCRYPTION_KEY=ldXQwQUsQEZavpf0dzoQJc92GxbbAeBW`
- `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` — bắt buộc để `$env.*` hoạt động trong Code nodes
- `NODE_FUNCTION_ALLOW_BUILTIN=crypto` — bắt buộc để `require('crypto')` hoạt động
- `TELEGRAM_BOT_TOKEN=...` — token bot (hardcode hoặc env)
- `TELEGRAM_BRIDGE_SECRET=42b777...` — phải khớp với portal `.env.local`
- `APP_URL=https://portal.veraglobal.vn` — để finalize URL đầy đủ
- `WEBHOOK_URL=https://n8n.veraglobal.vn/` — để Telegram Trigger activate đúng

#### n8n Docker network (quan trọng)
- Container n8n phải ở CẢ HAI networks: `tg_net` VÀ `n8n_default`
- `tg_net`: để gọi `telegram-bot-api` và `tg-file-server` by service name
- `n8n_default`: để có internet access (Supabase DNS, v.v.)
- Đã cố định trong `docker-compose.yml` tại `/var/www/portal/deploy/n8n/`

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

### Database schema fact discovered
- In production `candidates` table, soft-delete columns expected by some app paths were inconsistent with runtime assumptions during this session.
- For telegram candidate API path, avoid introducing schema assumptions without checking live DB first.

### Current rollback/stable reference used in this session
- Stable runtime commit used for recovery: `3e31a57`.
- This commit was used to restore portal health after failed deploy attempt.

### Remote deploy automation key (local machine)
- SSH deploy automation uses local key:
  - `/Users/apple/.ssh/sukien_bd2026_deploy`
