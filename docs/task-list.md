# Task List

> PM ownership — nguồn sự thật cho tasks

**Format:** `[ID] | [Title] | [Type] | [Agent] | [Status] | [Acceptance Criteria]`

---

## Active Tasks

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

- **[T-2A-N8N-002]** Build n8n workflow: Wizard Idle Ping (cron) — **✅ DONE**
  - Type: Feature
  - Agent: **Claude PM**
  - Status: **completed** — 2026-05-02, file `n8n-workflows/T-2A-N8N-002-idle-ping.json`
  - Description: Cron mỗi 1 phút — ping sessions idle >10 phút, xóa sessions hết hạn >30 phút
  - Implementation: Schedule Trigger → Code: Compute Times → HTTP: Get Active Sessions → Code: Classify Sessions → IF: Is Expired → (expired) Send + Delete / (idle) Send Ping
  - Column names đúng: `current_step`, `last_activity_at`
  - Dùng local bot API: `http://telegram-bot-api:8081` (không hardcode token)
  - **Cần user import vào n8n và activate**

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

- **[T-2A-VPS-003]** Setup VPS media directory + Nginx — **⚠️ PENDING USER ACTION**
  - Nginx chưa serve `/media/` → passport link vẫn 404
  - Việc cần làm: chạy `scripts/setup-vps-media.sh` + add `scripts/nginx-media.conf` vào nginx

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

- **[T-2A-DOC-007]** Setup BotFather menu cho bot
  - Type: Doc / Config
  - Agent: User thực thi (5 phút trong Telegram, không cần code)
  - Status: Ready (xem `docs/setup-telegram-bot-menu.md`)
  - Description: Đăng ký 4 commands với BotFather (`/setcommands`) để Telegram client tự suggest menu khi user gõ `/`. Cải thiện UX, không cần code workflow.
  - Acceptance: User gõ `/` trong chat bot → thấy dropdown menu với 4 lệnh (`/add`, `/cancel`, `/reset`, `/help`)

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
