# Task List

> PM ownership — nguồn sự thật cho tasks

**Format:** `[ID] | [Title] | [Type] | [Agent] | [Status] | [Acceptance Criteria]`

---

## ⚠️ UAT Pending — Nhắc user test mỗi đầu session

> AI agent đọc section này → nhắc user test trước khi làm việc mới nếu chưa có dấu ✅

### [UAT-001] Video Notification → Telegram Group (fix 2026-05-02)
*Root cause đã fix: `NEXT_PUBLIC_N8N_VIDEO_NOTIFY_URL` thiếu + `VIDEO_UPDATE_URL` sai giá trị → rebuilt*

- [ ] **TC1** — Admin upload video từ `/admin/candidates` → Telegram group nhận tin nhắn có link video + tên ứng viên
- [ ] **TC2** — Agent upload video từ `/order/[id]` → Telegram group nhận tin nhắn (cùng workflow)
- [ ] **TC3** — Sau khi nhận tin nhắn group, bấm nút **Pass / Fail** inline keyboard → candidate `interview_status` cập nhật trong DB, nút disable
- [ ] **TC4** — Edit candidate info (tên, ngày sinh...) → n8n `update-candidate` webhook được gọi (kiểm tra n8n executions của workflow `[Portal API] Update Candidate`)

### [UAT-002] N8N-002 Idle Ping v2 (fix 2026-05-02)
*Root cause đã fix: HTTP nodes dùng `$env.SUPABASE_*` undefined → thay native Supabase + Telegram nodes*

- [ ] **TC1** — Gõ `/add` trong bot, chọn order, để idle **10 phút** → nhận tin "Still there? Type /cancel..."
- [ ] **TC2** — Gõ `/add`, để idle **30 phút** → nhận tin "Session expired..." + row trong `bot_sessions` bị xóa (verify Supabase)
- [ ] **TC3** — Không có session nào active → workflow chạy mỗi phút, không có lỗi, không gửi gì (kiểm tra n8n executions: 0 items sau Supabase Get = silent stop bình thường)

### [UAT-003] Bot Wizard — Full flow (regression)
*Sau các lần fix bot, cần test lại toàn bộ happy path*

- [ ] **TC1** — `/add` → chọn order → chụp/gửi ảnh passport → OCR trả về đúng tên + ngày sinh → hiện checklist 6 mục
- [ ] **TC2** — Tick đủ 6 ô checklist → nút Confirm xuất hiện → bấm Confirm → bước tiếp
- [ ] **TC3** — Upload avatar → bot nhận ảnh → tiến đến bước Finalize
- [ ] **TC4** — `/finalize` → bot gửi summary (ảnh avatar + tên + order + link portal) đúng định dạng
- [ ] **TC5** — Upload video **>20MB** → bot nhận file (không báo lỗi "too large") → video_link lưu vào DB
- [ ] **TC6** — `/reset` giữa chừng → session xóa → bot về trạng thái chờ lệnh mới
- [ ] **TC7** — `/help` → bot trả về danh sách 4 lệnh

### [UAT-004] Deep-link từ Telegram → Portal (T-2A-UI-008)
- [ ] **TC1** — Click link finalize từ Telegram (format `/order/[id]?candidate=[id_ld]`) → trang load đúng, candidate được highlight + scroll vào view
- [ ] **TC2** — Edit modal **tự mở** sau ~250ms (không cần click tay)

### [UAT-005] BotFather Menu
- [ ] **TC1** — Gõ `/` trong chat bot → thấy dropdown 4 lệnh với description song ngữ Anh + Bengali

---

## Active Tasks

### Phase 3A — Admin Portal Enhancements

- **[T-ADM-001]** Admin đổi order cho ứng viên (bulk) — **🔜 READY TO BUILD**
  - Type: Feature
  - Agent: Devin
  - Status: **planned** — spec confirmed 2026-05-02
  - Description: Admin có thể chọn nhiều ứng viên (từ trang candidates hoặc order detail) và chuyển sang order khác. Agent sở hữu ứng viên được tự động thêm/cập nhật trong order mới.

  **Scope:**
  - 2 entry points: `/admin/candidates` và `/admin/orders/[id]`
  - Bulk select (checkbox trên CandidateCard) + floating action bar
  - Modal chọn order đích + confirm
  - API: `POST /api/admin/candidates/change-order`

  **Logic `assigned_labor_number` (đã confirm):**
  - Sau mỗi lần move, UPSERT `order_agents` SET `assigned_labor_number` = tổng candidates thực tế của agent trong order đích SAU MOVE
  - Áp dụng với cả agent đã có sẵn lẫn chưa có trong order → luôn phản ánh thực tế
  - Clamp: `min(new_count, remaining_quota)` nếu order có `total_labor`; warning nếu bị clamp
  - Nhất quán khi move 1 hay nhiều ứng viên cùng lúc

  **Files:**
  - `app/api/admin/candidates/change-order/route.ts` — tạo mới
  - `components/admin/ChangeOrderModal.tsx` — tạo mới (dùng chung 2 trang)
  - `app/admin/candidates/page.tsx` — sửa (checkbox + floating bar + modal)
  - `app/admin/orders/[id]/page.tsx` — sửa (tận dụng `selectedCandidates` state có sẵn + floating bar + modal; sau move xóa khỏi local state)
  - `components/agent/CandidateCard.tsx` — sửa (thêm optional props `selectable / selected / onToggleSelect`)

  **Acceptance criteria:**
  - [ ] Chọn ≥1 ứng viên → floating bar hiện
  - [ ] Modal dropdown order đích, exclude order hiện tại
  - [ ] API move thành công: `candidates.order_id` được cập nhật
  - [ ] Agent chưa có trong order mới → auto INSERT vào `order_agents` với count thực tế
  - [ ] Agent đã có trong order mới → UPDATE `assigned_labor_number` = count thực tế (clamped)
  - [ ] Warning hiện nếu bị clamp do vượt quota
  - [ ] Move từng ứng viên hay bulk → kết quả `assigned_labor_number` như nhau
  - [ ] `/admin/orders/[id]`: ứng viên đã move biến khỏi danh sách ngay (local state update)
  - [ ] TypeScript 0 lỗi, không ảnh hưởng agent portal

---

### Phase 2A — Telegram Candidate Wizard (Devin đến 2026-05-06)

- **[T-2A-N8N-001]** Build n8n workflow: Candidate Wizard v2 (revision) — **✅ DONE**
  - Type: Feature
  - Agent: **Devin/senior_dev**
  - Status: **completed** — PR #1 merged 2026-04-30 (commit `905f532`)
  - Branch: `devin/t-2a-n8n-001-candidate-wizard` (deleted after merge)
  - Description: Revision v2 — đổi UX Q1-Q7 thành checklist 1 màn hình + fix bug video silent + thêm `/reset` + `/help` commands + fix Merge node bug (Phase G).
  - User test verdict (2026-04-30): /add, /help, /reset, /cancel đều OK. Video >20MB vẫn báo "max 20MB" (đúng — Telegram cloud limit, sẽ giải quyết bằng T-2A-INFRA-005).
  - Context files (đọc theo thứ tự):
    1. `docs/handoffs/T-2A-N8N-001-handoff.md` — yêu cầu PM
    2. `docs/handoffs/T-2A-N8N-001-architect-spec.md` — **blueprint chi tiết, BẮT BUỘC bám theo**
    3. `n8n-workflows/T-2A-N8N-001-candidate-wizard.json` — workflow v1 cần sửa
    4. `app/api/telegram/candidate/route.ts` + `lib/telegram-auth.ts` — backend reference
  - Acceptance criteria: theo Phần 8 của architect-spec (15 test cases TC01-TC15)
  - Implementation order: theo Phần 9 architect-spec — Phase A (bug fix video, isolated) → B (refactor State Engine) → C (add nodes) → D (E2E test)
  - Scope boundary: Không sửa Next.js code, không chạy DB migration, không push main
  - Confidence min: 85% (sau khi đã có architect-spec)
  - **⚠️ BẮT BUỘC**: n8n version đã xác nhận 1.110.1. Test import workflow JSON trước khi báo done.

- **[T-2A-N8N-002]** Build n8n workflow: Wizard Idle Ping (cron) — **✅ DONE** (v2 fix 2026-05-02)
  - Type: Feature
  - Agent: **Claude PM**
  - Status: **completed** — v2 fix 2026-05-02, file `n8n-workflows/T-2A-N8N-002-idle-ping.json`
  - Description: Cron mỗi 1 phút — ping sessions idle >10 phút, xóa sessions hết hạn >30 phút
  - **v1 bug:** HTTP nodes dùng `$env.SUPABASE_ANON_KEY` / `$env.SUPABASE_SERVICE_ROLE_KEY` → `[undefined]` → 401 "No API key" → `neverError: true` nuốt lỗi → workflow silent fail
  - **v2 fix:** Thay toàn bộ HTTP nodes bằng native nodes:
    - `HTTP: Get Active Sessions` → `Supabase: Get Active Sessions` (native, dùng credential "Supabase account")
    - `HTTP: Send Expired TG` → `Telegram: Send Expired` (native, dùng credential "Telegram Bot")
    - `HTTP: Delete Session` → `Supabase: Delete Session` (native)
    - `HTTP: Send Idle Ping TG` → `Telegram: Send Idle Ping` (native)
    - `Code: Classify Sessions`: sửa từ array-loop sang per-item (native Supabase getAll trả 1 item/row)
  - Column names đúng: `current_step`, `last_activity_at`
  - **Cần user import v2 vào n8n, verify credentials, activate — xóa v1 cũ**

- **[T-2A-VPS-003]** Setup VPS media directory + Nginx config
  - Type: Infra
  - Agent: **Devin/senior_dev** (chỉ hướng dẫn, user thực thi)
  - Status: **ready** — scripts đã có tại `scripts/`
  - Description: Chạy `setup-vps-media.sh`, thêm `nginx-media.conf` vào nginx config, set `TELEGRAM_BRIDGE_SECRET`
  - Acceptance criteria: `https://{domain}/media/` trả file tĩnh; Next.js write được vào `/var/www/media/`

- **[T-2A-UI-004]** CandidateCard UI — Multi-video strip + Consent display — **✅ DONE**
  - Type: Feature (UI)
  - Agent: **Claude PM**
  - Status: **completed** — 2026-05-02, file `components/agent/CandidateCard.tsx`
  - Description: Multi-video strip + consent badge
  - Implementation:
    - `video_links[]`: hiển thị "▶ Video 1", "▶ Video 2"... khi có nhiều URL; fallback về `video_link` đơn nếu null/empty
    - Badge "Commitment Confirmed / Not Confirmed" (simplified per T-2A-UI-008 scope decision)
    - TypeScript 0 lỗi ✓
  - Q1-Q7 detail không triển khai — đã quyết định bỏ (chỉ badge per T-2A-UI-008)

---

### Bugs pending (Claude team)

- **[T-SEC-001]** Fix race condition trong register API — **✅ DONE**
  - Type: Bug Fix (Security)
  - Agent: Claude PM
  - Status: **completed** — 2026-05-02
  - Description: Bỏ `listUsers()` scan (bị giới hạn 100 user đầu, có TOCTOU race). Dùng `createUser` trực tiếp — Supabase tự xử lý duplicate email, lỗi "already registered" đã được catch tại authErr handler.
  - Fix: `app/api/auth/register/route.ts` — removed L46-50 (listUsers check)

- **[T-API-002]** Validate assigned_labor_number không vượt total_labor — **✅ DONE**
  - Type: Bug Fix (Validation)
  - Agent: Claude PM
  - Status: **completed** — đã có trong code (verified 2026-05-02)
  - Description: Validation đã tồn tại: check `newValue > totalLabor` và `currentSum + newValue > totalLabor`
  - File: `app/api/admin/order-agents/route.ts` L30-48

- **[T-API-003]** Cascade agency soft-delete sang users — **✅ DONE**
  - Type: Bug Fix (Data Integrity)
  - Agent: Claude PM
  - Status: **completed** — đã có trong code (verified 2026-05-02)
  - Description: DELETE handler đã cascade: set agency inactive → set tất cả users của agency đó inactive
  - File: `app/api/admin/agencies/[id]/route.ts` L90-97

---

- **[T-2A-BOT-009]** Bot UX fixes (2026-05-02) — **✅ DONE**
  - full_name OCR hiển thị đúng (có space)
  - Confirmation dùng order_id thay job_type/company
  - Order button: `order_id (count/total)`
  - Finalize summary: sendPhoto + caption (avatar + name + order + link)
  - Commit: `81af926`

- **[T-2A-VPS-003]** Setup VPS media directory + Nginx — **✅ DONE** (2026-05-02)
  - `/var/www/media/candidates` đã tạo, owner root, chmod 755
  - Nginx serve `/media/` → `/var/www/media/` tại `portal.veraglobal.vn.ssl.conf`
  - Verify: `curl https://portal.veraglobal.vn/media/` → 403 ✓

---

## Backlog

### Phase 2A follow-ups (từ PR #1 review, 2026-04-30)

- **[T-2A-N8N-FOLLOWUP-1]** Lưu `job_type_en`/`company_name_en` vào draft khi user chọn order — **✅ DONE**
  - Type: Feature (UX cosmetic)
  - Agent: Claude PM
  - Status: **completed** — 2026-05-02
  - Description: `Code: Handle List Orders` lưu `order_meta` map (orderID → job/company) vào session. `Code: State Engine` trong case `WAITING_ORDER_SELECTION` extract metadata từ `sessionData.order_meta` khi user chọn order, lưu `job_type_en` + `company_name_en` vào draft.
  - Fix: `n8n-workflows/T-2A-N8N-001-candidate-wizard.json` — 2 nodes updated

- **[T-2A-N8N-FOLLOWUP-2]** Thêm `neverError: true` cho HTTP Get Passport/Avatar File Info — **✅ DONE**
  - Type: Bug Fix (consistency)
  - Agent: Claude PM
  - Status: **completed** — 2026-05-02
  - Description: Thêm `options.response.response.neverError: true` vào `HTTP: Get Passport File Info` và `HTTP: Get Avatar File Info`. Bot sẽ không im lặng khi Telegram trả lỗi cho passport/avatar >20MB.
  - Fix: `n8n-workflows/T-2A-N8N-001-candidate-wizard.json` — 2 HTTP nodes updated

- **[T-2A-N8N-FOLLOWUP-3]** Optimistic locking cho race condition checklist toggle
  - Type: Enhancement
  - Agent: TBD
  - Status: Backlog (optional)
  - Description: Khi agent tap nhanh 6 toggle <1s, n8n executions có thể overlap → lost update. Thêm column `version` vào `bot_sessions` + CAS update trong workflow.
  - Acceptance: Không lost update khi tap 6 toggle nhanh; agent thấy keyboard update đúng
  - Risk priority: Low-Medium (chỉ xảy ra với tap nhanh)

- **[T-2A-INFRA-005]** Self-host `telegram-bot-api` server trên VPS
  - Type: Infra
  - Agent: Devin (PM/Architect/Builder) + User (deploy)
  - Status: **✅ DONE** (2026-05-02) — ổn định, local mode active, video >20MB hoạt động
  - Description: Docker compose `aiogram/telegram-bot-api:latest` trên VPS port 127.0.0.1:8081. Nginx proxy `/tg-media/<path>` ẩn BOT_TOKEN server-side. Workflow update 15 URLs + 2 jsCode build URL dùng env `TELEGRAM_BOT_API_BASE_URL` (HTTP API call) + `TELEGRAM_PUBLIC_FILE_BASE` (URL public lưu DB). Fallback giữ `api.telegram.org` nếu env chưa set → workflow vẫn chạy được khi rollback.
  - Files:
    - `deploy/telegram-bot-api/docker-compose.yml`, `.env.example`, `setup.sh`, `nginx-tg-media.conf`
    - `docs/handoffs/T-2A-INFRA-005-runbook.md` (9 step deploy guide)
    - `n8n-workflows/T-2A-N8N-001-candidate-wizard.json` (updated)
  - Acceptance:
    - Container chạy stable (Docker, auto-restart, healthcheck)
    - Workflow gọi qua local URL, video 50MB+ upload thành công
    - Public URL agent portal `https://portal.veraglobal.vn/tg-media/<path>` load được
    - URL không lộ BOT_TOKEN client-side
    - RAM usage <500MB, disk cache <20GB
  - Risk priority: Medium (tốn ~30-45 phút deploy, downtime bot ~5 phút)
  - Triggered by: User test PR #1 phát hiện video 34MB fail (2026-04-30)
  - Migration risks (one-way trong 10 phút):
    - logOut khỏi cloud → bot KHÔNG quay lại cloud trong window này
    - Webhook cũ mất → phải setWebhook lại với URL local server
  - Session update (2026-05-01):
    - Đã migrate bot sang local server, webhook local hoạt động.
    - Đã thêm file-server sidecar phục vụ media và route `/tg-media/` ổn định.
    - Đã phát hiện issue production chunk 404 khi chạy standalone runtime nếu thiếu sync static.
    - Baseline recovery commit đã dùng: `3e31a57` (portal health 200).
    - Quy trình deploy hiện tại bắt buộc: `next build` + `rsync .next/static -> .next/standalone/.next/static` + start `node .next/standalone/server.js` port 3001.

- **[T-2A-UI-008]** Deep-link candidate UX từ Telegram finalize link
  - Type: Feature (UI/UX)
  - Agent: Claude PM
  - Status: **✅ DONE** (2026-05-02)
  - Scope đã làm:
    - Focus + highlight candidate theo query param ✓
    - Scroll to candidate (120ms delay) ✓
    - Banner trạng thái nếu candidate có/không tồn tại ✓
    - Avatar ở edit modal ✓
    - Commitment badge (simplified) ✓
  - **Bug đang fix**: auto-open edit modal không hoạt động — đã patch (250ms delay trong useEffect `[autoOpenEdit]`), cần UAT xác nhận
  - Cần user test: mở link `/order/<id>?candidate=<id_ld>` từ Telegram → xác nhận modal tự mở

- **[T-2A-DOC-007]** Setup BotFather menu cho bot — **✅ DONE** (2026-05-02)
  - Type: Doc / Config
  - Status: **completed** — user đã setup qua BotFather, menu song ngữ EN + Bengali
  - Commands: `/add`, `/cancel`, `/reset`, `/help` với description tiếng Anh + gợi ý Bengali

---

### From PROGRESS.md

- **[T-TELE-C]** n8n Telebot — Báo cáo tuần (scheduled)
  - Type: Feature
  - Agent: TBD
  - Status: Backlog
  - Description: Mỗi thứ 2 8:00 SGT gửi báo cáo tuần vào Telegram group
  - Acceptance: Cron `0 1 * * 1`, gửi stats (LD mới, Pass/Fail, tiến độ đơn hàng)

- **[T-TELE-D]** n8n Telebot — Nhắc nhở thanh toán
  - Type: Feature
  - Agent: TBD
  - Status: Backlog
  - Description: Check daily, nhắc khi đến hạn mốc thanh toán/thủ tục
  - Acceptance: Cron `0 1 * * *`, query orders có `payment_status_vn` chưa hoàn thành

---

## Completed

### Phase 1A: Telegram Video Notification + Pass/Fail — ✅ 13/04/2026
- Workflow 1: Video Notification (webhook)
- Workflow 2: Pass/Fail Handler (callback_query)

### Phase 1B: Telegram PCC & Health Cert Daily Report — ✅ 13/04/2026
- Workflow 3: Daily report (Cron 8PM SGT)

### Phase 1E: OpenClaw + 9Router trên VPS — ✅ 13/04/2026
- Node.js 24, OpenClaw v2026.4.11, 9Router v0.3.85

### Phase 1F: OpenClaw Query Supabase — ✅ 14/04/2026
- MCP server: `mcp-server-postgres` read-only

### Phase 1G: Add OpenClaw bot vào Telegram group — ✅ 14/04/2026
- Bot 2 trả lời mention, query Supabase qua MCP

---

## Notes

- Task mới sẽ được PM thêm vào khi nhận yêu cầu từ user
- Format ID: `T-{CATEGORY}-{SEQ}` (ví dụ: T-API-001, T-UI-002)
