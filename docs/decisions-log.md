# Decisions Log

> PM ownership — log mọi quyết định kiến trúc/hệ thống

**Format:** `[YYYY-MM-DD] Quyết định / Lý do / Ảnh hưởng`

---

## 2026-04-30

### [Phase 2A] T-2A-INFRA-005: nginx proxy `/tg-media/<path>` thay vì copy file → Supabase Storage
- **Quyết định:** Self-host `telegram-bot-api` Docker `127.0.0.1:8081` + nginx proxy `https://portal.veraglobal.vn/tg-media/<file_path>` → upstream `localhost:8081/file/bot<TOKEN>/<file_path>`. BOT_TOKEN giấu trong nginx config (rewrite directive), URL public không lộ token.
- **Lý do:** User reject Supabase (free tier dung lượng hạn chế). VPS đã có domain + SSL + nginx sẵn → tận dụng. Bot API native pattern (HTTP `/file/bot<TOKEN>/<path>`) → workflow chỉ cần đổi base URL.
- **Ảnh hưởng:**
  - Code thay đổi: 15 URLs + 2 jsCode build URL trong workflow JSON dùng env `TELEGRAM_BOT_API_BASE_URL` (HTTP) + `TELEGRAM_PUBLIC_FILE_BASE` (URL public lưu DB). Fallback `api.telegram.org` nếu env chưa set → an toàn rollback.
  - File lưu trên VPS volume Docker (persistent), không phụ thuộc Supabase.
  - Risk: VPS down → web app 404 video. Cần monitor disk usage (~1MB × N candidates × video_count).
  - Bonus: Fix luôn lỗi token leak (URL cũ chứa BOT_TOKEN từ cloud `/file/bot<TOKEN>/...`).

### [Phase 2A] T-2A-INFRA-005: bỏ flag `TELEGRAM_LOCAL=1`, giữ default mode
- **Quyết định:** Không bật `--local` mode của telegram-bot-api server (file_path absolute filesystem). Dùng default mode (file_path relative + HTTP serve).
- **Lý do:** Giảm code workflow phải parse path. Pattern HTTP cloud-style → workflow chỉ đổi base URL, không cần xử lý path absolute. Performance penalty bandwidth nội bộ không đáng kể (file đi qua docker network localhost).
- **Ảnh hưởng:** Workflow sạch, dễ maintain. Sau này nếu cần tối ưu (vd 1000+ candidates) có thể bật `--local` + update jsCode parse absolute path.

### [Phase 2A] PM tự đóng vai Builder do subagent rate-limit
- **Quyết định:** Sau khi merge PR #1, PM gọi 2 background builders cho T-2A-N8N-002 + T-2A-UI-004 song song. Cả 2 fail rate-limit. User chỉ đạo "không cần gọi agent nữa" → PM tự implement cả 2 task (foreground edit + script Python build workflow JSON).
- **Lý do:** Rate-limit Windsurf account đã hit nhiều lần trong phiên dài, fallback PM tự làm là pattern an toàn (đã chứng minh ở phase Surveyor + Reviewer).
- **Ảnh hưởng:** Tốc độ giảm so với parallel subagents nhưng kết quả ổn định: PR #2 (UI-004) + PR #3 (N8N-002) đã push, mỗi PR 1 commit sạch, tự verify đầy đủ.

### [Phase 2A] Extend PR #1 với `/reset` + `/help` commands sau khi user test
- **Quyết định:** Extend PR #1 (cùng branch `devin/t-2a-n8n-001-candidate-wizard`) với 2 commits Phase E (`/reset` alias `/cancel`) + Phase F (`/help` liệt kê 4 lệnh) thay vì tạo PR thứ 2.
- **Lý do:** User test PR #1 phát hiện cần manual reset session + suggest commands cho user. Cả 2 thay đổi rất nhỏ (~20 dòng jsCode), cùng 1 file workflow JSON, cùng context — gộp vào 1 PR comprehensive thay vì split 2 PR.
- **Ảnh hưởng:** PR #1 giờ có 5 commits Phase A-F, scope rộng hơn nhưng vẫn nhất quán "v2 revision". Test plan thêm TC11-TC14 cho commands mới.

### [Phase 2A] Self-host `telegram-bot-api` cho video >20MB
- **Quyết định:** Tạo task `T-2A-INFRA-005` để setup binary `telegram-bot-api` self-host trên VPS, bypass giới hạn 20MB của Telegram cloud API.
- **Lý do:** User test phát hiện video 34MB fail với message "Video too large". Đây là giới hạn cứng của `api.telegram.org/getFile`, không phải bug. User chấp nhận setup self-host để hỗ trợ video lớn.
- **Ảnh hưởng:** Cần thêm 1 dịch vụ trên VPS (~500MB RAM, ~5-20GB disk cache), task riêng phụ thuộc user phối hợp setup.

### [Phase 2A] BotFather menu cho UX gõ `/` thấy commands
- **Quyết định:** Tạo task `T-2A-DOC-007` + file hướng dẫn `docs/setup-telegram-bot-menu.md`. User tự setup qua @BotFather (5 phút, không cần code).
- **Lý do:** UX best practice — Telegram client tự suggest commands khi user gõ `/`, không bắt user nhớ.
- **Ảnh hưởng:** Cần user thực thi 1 lần qua Telegram. Workflow KHÔNG đổi (`/help` đã có là backup).

### [Phase 2A] Architect viết spec chi tiết cho T-2A-N8N-001 v2 trước khi Builder vào việc
- **Quyết định:** PM gọi Surveyor → phát hiện confidence T-2A-N8N-001 rớt từ 85% xuống 65% (logic Q1-Q7 ẩn trong jsCode `Code: State Engine` ~10KB, không chỉ xóa nodes ngoài). PM gọi Architect viết blueprint 9 phần (~456 dòng) trước khi giao Builder.
- **Lý do:** Tránh Builder mò code state engine + refactor switch case mà sai semantic, gây regression flow đang chạy.
- **Ảnh hưởng:** Builder T-2A-N8N-001 bám theo `docs/handoffs/T-2A-N8N-001-architect-spec.md` (Phase A→B→C→D), confidence quay lại 85%+. Pattern này sẽ áp dụng cho mọi task Phase 2A có rủi ro tương tự.

### [Phase 2A] Fix bug column name trong handoff T-2A-N8N-002
- **Quyết định:** Đổi `state=neq.IDLE` → `current_step=neq.IDLE` và `updated_at` → `last_activity_at` trong handoff 002.
- **Lý do:** Surveyor xác nhận từ workflow v1 (Code State Engine line 84 đọc `session.current_step`, các Upsert body line 333/472/657/926 ghi `current_step` và `last_activity_at`). Bảng `bot_sessions` được tạo thủ công ngoài migrations, không có file SQL trong repo để đối chiếu — workflow v1 đã chạy production nên column name đúng phải là cái workflow đang dùng.
- **Ảnh hưởng:** Builder T-2A-N8N-002 dùng đúng column name từ đầu, tránh debug 1 round-trip vô ích.

---

## 2026-04-28

### [Boot] Tạo docs structure chuẩn AGENTS.md v1.2
- **Quyết định:** Di chuyển `ARCHITECTURE.md` → `docs/architecture.md`, tạo mới `project-notes.md`, `task-list.md`, `decisions-log.md`
- **Lý do:** Dự án thiếu Context Boot files bắt buộc theo AGENTS.md v1.2
- **Ảnh hưởng:** PM agent giờ có đầy đủ docs để điều phối, dễ onboard agent mới

---

## 2026-04-14

### [OpenClaw] Query Supabase qua MCP server thay vì n8n proxy
- **Quyết định:** Dùng `@modelcontextprotocol/server-postgres` làm MCP server cho OpenClaw bot
- **Lý do:** Đơn giản hơn n8n proxy, read-only tự động (BEGIN TRANSACTION READ ONLY), tool native trong bot
- **Ảnh hưởng:** OpenClaw bot có tool `supabase__query` gọi trực tiếp PostgreSQL, trả lời câu hỏi linh hoạt

### [VPS] Wrapper script `/usr/local/bin/mcp-pg-vera` cho MCP server
- **Quyết định:** Tạo wrapper bash script bake env var `NODE_TLS_REJECT_UNAUTHORIZED=0`
- **Lý do:** Supabase dùng self-signed SSL cert; OpenClaw không truyền `env` field từ MCP config
- **Ảnh hưởng:** MCP server connect được Supabase, không cần patch OpenClaw code

### [OpenClaw] Add bot thứ 2 vào Telegram group
- **Quyết định:** Disable Group Privacy qua @BotFather, add bot vào nhóm "Tuyển dụng Bangladesh"
- **Lý do:** Bot cần nghe mention trong nhóm (không phải private chat)
- **Ảnh hưởng:** Nhóm có 2 bots: @Bangladesh_Recruitment_Bot (n8n notify) + AI assistant (OpenClaw)

---

## 2026-04-13

### [n8n] Telegram Pass/Fail handler với anti-double-tap
- **Quyết định:** IF node "Đã xử lý?" kiểm tra `callback_data='done'` trước khi update DB
- **Lý do:** Tránh user ấn lại nút sau khi đã xử lý
- **Ảnh hưởng:** Nút đã ấn → popup "⚠️ Đã được xử lý rồi!", không cập nhật DB 2 lần

### [n8n] PCC & Health Cert Daily Report — chỉ gửi khi có data
- **Quyết định:** IF node check `items.length > 0` trước khi gửi Telegram
- **Lý do:** Tránh spam nhóm khi không có ứng viên nộp chứng từ
- **Ảnh hưởng:** Telegram chỉ nhận báo cáo khi thực sự có PCC/Health Cert mới

### [VPS] Cài OpenClaw + 9Router trên host (không Docker)
- **Quyết định:** Node.js 24 trên host, OpenClaw user service, 9Router systemd service
- **Lý do:** Dễ debug hơn Docker, tài nguyên VPS hạn chế (7.8GB RAM, đã chạy nhiều container)
- **Ảnh hưởng:** OpenClaw port 18789, 9Router port 20128, auto-start qua systemd + linger=yes

---

## 2026-04 (trước 13/04)

### [Deploy] VPS self-host với Nginx bind IP
- **Commit:** `9650e59` fix(deploy): bind nginx to VPS IP 72.60.40.232
- **Lý do:** Fix SSL cert mismatch
- **Ảnh hưởng:** Nginx config bind đúng VPS IP

### [Auth] Middleware dùng `getSession()` thay vì DB round-trip
- **Commit:** `af7d683` perf: eliminate auth server round-trip
- **Lý do:** Giảm latency, middleware Edge Runtime không cần query DB
- **Ảnh hưởng:** Middleware chỉ verify JWT từ cookie, role check do layout

### [API] Route ALL order writes qua admin API (service role)
- **Commit:** `11c6fa6` fix: route ALL order writes through admin API
- **Lý do:** Bypass RLS, tránh permission denied khi browser client ghi
- **Ảnh hưởng:** Mọi order/order_agents write phải qua `/api/admin/*` endpoint

### [Finance] Admin Công nợ + Tài chính module
- **Commit:** `6ca4ad8` feat: admin Công nợ CRUD + Tài chính module
- **Lý do:** Theo dõi thu chi, công nợ agent
- **Ảnh hưởng:** Admin portal có `/admin/debt`, `/admin/finance`

### [Share] Public share page cho orders
- **Commit:** `ffe4674` feat: add public share page
- **Lý do:** Chia sẻ đơn hàng không cần login
- **Ảnh hưởng:** Route `/api/share/[id]` public, không auth

---

## Bài học từ lỗi thực tế (từ coding-rules.md)

### Agent ID có space → `.contains()` sai
- **Lỗi:** `agent_ids` chứa `["GTA 2026"]`, `.contains()` không match
- **Fix:** Dùng `.filter('agent_ids', 'cs', '{"GTA 2026"}')` thay vì `.contains()`
- **Ảnh hưởng:** Query agent_ids mảng phải dùng containment syntax đúng

### `data || []` không bắt lỗi Supabase
- **Lỗi:** `res.data || []` vẫn trả `[]` khi `res.error` tồn tại
- **Fix:** Luôn check `res.error` trước khi dùng `res.data`
- **Ảnh hưởng:** Mọi Supabase query phải check error trước

### Column mới trong code nhưng chưa có trong DB
- **Lỗi:** `Could not find the 'X' column in schema cache`
- **Fix:** Chạy `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` + `NOTIFY pgrst, 'reload schema'` trước deploy
- **Ảnh hưởng:** DB-before-deploy rule bắt buộc

---

## Notes

- PM cập nhật log này sau mỗi quyết định kiến trúc/hệ thống quan trọng
- Format ngày: `YYYY-MM-DD` (ISO 8601)
- Luôn ghi rõ: Quyết định gì / Tại sao / Ảnh hưởng gì

### [2026-05-02] telegram-bot-api bắt buộc dùng --local mode để bypass 20MB limit
- **Quyết định:** Bật `TELEGRAM_LOCAL: "1"` trong docker-compose telegram-bot-api. Đảo ngược quyết định cũ "KHÔNG set TELEGRAM_LOCAL=1".
- **Lý do:** Default mode chỉ proxy qua Telegram Cloud → vẫn bị giới hạn 20MB getFile. `--local` mode mới thực sự lưu file local và bypass limit. Workflow đã có sẵn code normalize absolute path.
- **Ảnh hưởng:** `file_path` từ getFile là absolute (`/var/lib/telegram-bot-api/TOKEN/...`), workflow normalize về relative để file-server serve đúng.

### [2026-05-02] n8n phải ở 2 networks: tg_net + n8n_default
- **Quyết định:** n8n container join cả `tg_net` (để gọi telegram-bot-api) VÀ `n8n_default` (để có internet/DNS).
- **Lý do:** `tg_net` không có NAT/internet routing → DNS fail → không resolve Supabase. `n8n_default` có internet đầy đủ và cũng chứa telegram-bot-api container.
- **Ảnh hưởng:** docker-compose n8n đã cố định cả 2 networks.

### [2026-05-02] NODE_FUNCTION_ALLOW_BUILTIN=crypto bắt buộc trong n8n env
- **Quyết định:** Thêm `NODE_FUNCTION_ALLOW_BUILTIN=crypto` vào n8n `.env`.
- **Lý do:** n8n mặc định block tất cả Node.js built-in modules trong Code nodes (vm2 sandbox). `require('crypto')` fail nếu không whitelist.
- **Ảnh hưởng:** Mọi Code node dùng `require('crypto')` cần setting này. Phải có trong `.env` trước khi recreate container.

### [2026-05-02] Bot UX: order_id thay vì job_type/company trong mọi nơi
- **Quyết định:** Hiển thị `order_id` (NICE_042026) thay vì `job_type_en — company_name_en` trong button chọn order và trong confirmation message.
- **Lý do:** Agent đã biết order nào mình phụ trách. Order ID đủ để nhận ra. Job/company text dài, gây lộn xộn UI.
- **Ảnh hưởng:** `Code: Handle List Orders` và `Code: State Engine` (WAITING_PASSPORT_CONFIRM) đã update.

### [2026-05-02] Fix portal down + n8n TELEGRAM_BOT_TOKEN (incident post-mortem)
- **Quyết định:** Chuyển portal process management từ manual sang **systemd service** (`portal.service`). Đồng thời set `TELEGRAM_BOT_TOKEN` trong `/var/www/portal/deploy/n8n/.env` thay vì hardcode trong workflow JSON.
- **Lý do:** Claude session trước deploy code mới lên VPS nhưng không restart portal → Next.js process chết → Nginx 502 → n8n nhận 502 HTML thay vì JSON → `Code: Handle List Orders` rơi vào `else` branch → bot gửi "An error occurred." Cùng lúc đó, workflow mới đổi hardcoded token sang `$env.TELEGRAM_BOT_TOKEN` nhưng env var chưa được set trong n8n → URL `/bot[undefined]/...`.
- **Ảnh hưởng:** Portal tự restart nếu crash (systemd `Restart=always`), tự start sau reboot (`enabled`). Workflow sạch hơn (không hardcode secret). Quy trình deploy sau này **bắt buộc** phải chạy `systemctl restart portal` sau khi build thay vì start manual.

### [2026-05-01] Session infra/runtime learnings (production)
- **Quyết định:** Chuẩn hoá deploy/start runtime Next.js bằng standalone server trên port 3001 (`node .next/standalone/server.js`) và bắt buộc sync `.next/static` -> `.next/standalone/.next/static` sau mỗi build.
- **Lý do:** Đã gặp lỗi chunk 404 gây màn hình trắng khi static assets không đồng bộ với standalone runtime.
- **Ảnh hưởng:** Checklist deploy production phải có bước rsync static + verify chunk/health.

### [2026-05-01] Telegram media serving adjustment
- **Quyết định:** Dùng file-server sidecar (`tg-file-server`) để phục vụ media từ volume telegram-bot-api và expose qua nginx `/tg-media/`.
- **Lý do:** Trong môi trường hiện tại, endpoint tải file trực tiếp từ telegram-bot-api cho nhiều trường hợp trả 404 dù file đã có trong volume.
- **Ảnh hưởng:** Pipeline media ổn định hơn, nhưng cần giữ compose/nginx đồng bộ (port 9000 local + route `/tg-media/`).

### [2026-05-01] Recovery baseline
- **Quyết định:** Rollback production runtime về commit `3e31a57` khi deploy mới gây 502.
- **Lý do:** Khôi phục dịch vụ nhanh để giảm downtime, sau đó tiếp tục cải tiến theo nhánh riêng.
- **Ảnh hưởng:** Trạng thái production ổn định tại baseline đã biết, các thay đổi UX mới cần rollout thận trọng.
