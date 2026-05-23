# Task List

> PM ownership — nguồn sự thật cho tasks

**Format:** `[ID] | [Title] | [Type] | [Agent] | [Status] | [Acceptance Criteria]`

---

## Chiến lược (cập nhật 2026-05-23)

**Ưu tiên mới: Website core trước → Telegram/Lark sau**

Tập trung hoàn thiện toàn bộ chức năng vận hành trên website (portal) trước khi phát triển thêm tính năng mở rộng trên Telegram / Lark. Telegram bot hiện tại giữ nguyên, không mở rộng thêm workflow mới cho đến khi website ổn định.

**Phân nhóm ưu tiên:**
1. **🔴 P1 — Core vận hành** (phải có để chạy thực tế)
2. **🟡 P2 — Cải thiện UX/Admin** (làm ngay sau P1)
3. **🟢 P3 — Mở rộng / nâng cao** (website)
4. **⬛ HOLD — Telegram / Lark mở rộng** (làm sau khi website xong)

---

## ⚠️ UAT Pending — Nhắc user test khi rảnh

> Giữ nguyên để nhắc nhở — không block task mới

### [UAT-001] Video Notification → Telegram Group
- [ ] TC1 — Admin upload video → Telegram group nhận tin
- [ ] TC2 — Agent upload video → Telegram group nhận tin
- [ ] TC3 — Bấm Pass/Fail inline keyboard → DB cập nhật
- [ ] TC4 — Edit candidate info → n8n update-candidate webhook

### [UAT-002] N8N-002 Idle Ping v2
- [ ] TC1 — Gõ `/add`, idle 10 phút → nhận ping "Still there?"
- [ ] TC2 — Gõ `/add`, idle 30 phút → session expired + row xóa
- [ ] TC3 — Không có session active → workflow chạy silent

### [UAT-003] Bot Wizard — Full flow (regression)
- [ ] TC1–TC7 theo spec cũ

### [UAT-004] Deep-link Telegram → Portal
- [ ] TC1 — Link finalize → candidate highlight + scroll
- [ ] TC2 — Edit modal tự mở sau 250ms

### [UAT-005] BotFather Menu
- [ ] TC1 — Gõ `/` → dropdown 4 lệnh song ngữ

---

## 🔴 P1 — Core vận hành (làm trước)

### [T-FIX-001] Chạy migration RLS cho member role — **⚠️ PENDING USER ACTION**
- Type: Bug/Migration
- Agent: User (cần DB password hoặc Supabase PAT)
- Status: **blocked** — migration file đã viết, chờ user chạy trên Supabase SQL Editor
- Description: 2 fix còn lại sau session 2026-05-23 không thể tự động hóa vì cần DB-level DDL access.

**File migration đã sẵn sàng:**
- `supabase/migrations/20260523000002_fix_member_rls_users_and_stats.sql`

**Cách chạy (1 phút):**
1. Vào Supabase Dashboard → SQL Editor
2. Copy toàn bộ nội dung file migration trên → Paste → Run

**Nội dung fix:**
- **Fix A:** Thêm policy `users_member_read_agency` — cho phép member SELECT users cùng agency (hiện tại member bị block bởi RLS, không tự query được; code đã có fallback qua `/api/agents/me` nhưng policy này vẫn cần cho defense-in-depth).
- **Fix B:** `GRANT SELECT ON recruitment_stats TO authenticated` — member thấy được stats dashboard (hiện tại stats = null vì view chưa grant).

**Sau khi chạy:**
- [ ] Member thấy stats (Applied/Passed/Remaining) trên dashboard
- [ ] Member query users cùng agency không bị empty result

**Để Devin tự chạy trong tương lai:** Thêm một trong hai vào `.env.local` trên VPS:
- `SUPABASE_DB_PASSWORD=...` (Dashboard → Settings → Database → Database password)
- `SUPABASE_ACCESS_TOKEN=...` (supabase.com → Account → Access Tokens)

---

### [T-WEB-001] Admin bulk move candidates — **🔜 READY TO BUILD**
- Type: Feature
- Agent: Devin
- Status: **planned** — spec confirmed 2026-05-02
- Description: Admin chọn nhiều ứng viên và chuyển sang order khác. Agent sở hữu được tự động thêm/cập nhật trong order mới.

**Scope:**
- 2 entry points: `/admin/candidates` và `/admin/orders/[id]`
- Bulk select (checkbox trên CandidateCard) + floating action bar
- Modal chọn order đích + confirm
- API: `POST /api/admin/candidates/change-order`

**Logic `assigned_labor_number` (đã confirm):**
- UPSERT `order_agents` SET `assigned_labor_number` = tổng candidates thực tế của agent trong order đích SAU MOVE
- Clamp: `min(new_count, remaining_quota)` nếu order có `total_labor`; warning nếu bị clamp

**Files:**
- `app/api/admin/candidates/change-order/route.ts` — tạo mới
- `components/admin/ChangeOrderModal.tsx` — tạo mới
- `app/admin/candidates/page.tsx` — sửa (checkbox + floating bar + modal)
- `app/admin/orders/[id]/page.tsx` — sửa (tận dụng `selectedCandidates` state có sẵn)
- `components/agent/CandidateCard.tsx` — sửa (optional props `selectable/selected/onToggleSelect`)

**Acceptance criteria:**
- [ ] Chọn ≥1 ứng viên → floating bar hiện
- [ ] Modal dropdown order đích, exclude order hiện tại
- [ ] API move thành công: `candidates.order_id` cập nhật
- [ ] Agent chưa có trong order mới → auto INSERT `order_agents` với count thực tế
- [ ] Agent đã có → UPDATE `assigned_labor_number` = count thực tế (clamped)
- [ ] Warning nếu bị clamp do vượt quota
- [ ] `/admin/orders/[id]`: ứng viên đã move biến khỏi danh sách ngay
- [ ] TypeScript 0 lỗi

---

### [T-WEB-002] In Demand Letter (từ portal) — **🆕 CHƯA CÓ**
- Type: Feature
- Agent: Devin
- Status: **backlog P1** — chưa có UI + API + n8n workflow
- Description: Admin tạo/in Demand Letter cho từng đơn hàng. Tương tự YCTD nhưng là document gửi cho phía Bangladesh/đối tác nước ngoài.

**Scope:**
- UI trong admin order detail: section "Demand Letter" tương tự section YCTD hiện có
- API: `POST /api/orders/demand-letter` — tạo request, trigger n8n
- n8n workflow: sinh PDF từ Google Docs template, trả về `pdf_url` + `edit_url`
- Lưu vào `doc_links` (type: `'demand_letter'`)

**Acceptance criteria:**
- [ ] Nút "Tạo Demand Letter" trong order detail
- [ ] API tạo request + trigger n8n thành công
- [ ] Sau khi n8n xử lý: hiển thị link PDF + link Docs để edit
- [ ] Có thể tạo lại (↻ regenerate)

---

### [T-WEB-003] Kiểm tra + fix n8n YCTD & Hợp đồng — **🔍 CẦN VERIFY**
- Type: Bug/Verify
- Agent: User (với hướng dẫn từ PM)
- Status: **pending verify** — UI đã có, n8n workflow chưa xác nhận hoạt động
- Description: API YCTD (`/api/orders/yctd`) và Hợp đồng (`/api/orders/contract`) đã có trong portal. Cần xác nhận n8n workflow có đang chạy đúng không.

**Acceptance criteria:**
- [ ] Bấm "Tạo YCTD" trên admin order detail → n8n execution xuất hiện
- [ ] Sau 30-60s → PDF link hiện trong portal
- [ ] Tương tự cho "Tạo hợp đồng" (loại 1 và 2)
- [ ] Nếu n8n workflow thiếu/lỗi → ghi nhận để build mới

---

## 🟡 P2 — Cải thiện UX/Admin

### [T-WEB-004] Agent portal — Hiển thị quota rõ ràng hơn
- Type: UX
- Agent: Devin
- Status: **backlog P2**
- Description: Agent hiện thấy số ứng viên đã upload nhưng không thấy rõ quota được giao (assigned_labor_number). Cần hiển thị "X / Y lao động" rõ ràng trong order view của agent.

**Acceptance criteria:**
- [ ] `app/order/[id]/page.tsx`: hiển thị "Đã có: X / Được giao: Y lao động" trong header
- [ ] Màu cảnh báo khi X > Y (vượt quota)

---

### [T-WEB-005] Admin candidates — Export danh sách
- Type: Feature
- Agent: Devin
- Status: **backlog P2**
- Description: Admin cần export danh sách ứng viên (theo order hoặc theo trạng thái) ra CSV/Excel để báo cáo.

**Acceptance criteria:**
- [ ] Nút "Export CSV" trên `/admin/candidates`
- [ ] Export đúng filter đang áp dụng (order, status, agent)
- [ ] Các cột: id_ld, full_name, pp_no, dob, order_id, agent, interview_status, created_at

---

### [T-WEB-006] Admin orders — Filter nâng cao + sort
- Type: UX
- Agent: Devin
- Status: **backlog P2**
- Description: `/admin/orders` hiện thiếu filter theo company, sort theo ngày, filter theo trạng thái tuyển dụng.

**Acceptance criteria:**
- [ ] Filter theo: company, status, agent
- [ ] Sort theo: created_at, total_labor, labor_missing
- [ ] State persist khi navigate back

---

### [T-WEB-007] Finance — Liên kết payment với order
- Type: Feature
- Agent: Devin
- Status: **backlog P2**
- Description: `finance_transactions` hiện tách biệt hoàn toàn với `order_payments`. Cần hiển thị trong Finance page các giao dịch có `order_payment_id` kèm link đến order liên quan.

**Acceptance criteria:**
- [ ] Finance transaction row có `order_payment_id` → hiển thị link "→ Order [id]"
- [ ] Tổng thu từ order payments được include vào KPI tổng

---

### [T-WEB-008] Admin dashboard KPI — Cải thiện
- Type: UX
- Agent: Devin
- Status: **backlog P2**
- Description: KPI dashboard `/admin` hiện cơ bản. Cần thêm: tiến độ tuyển dụng theo order (bar chart đơn giản), top agent, orders sắp đến hạn.

**Acceptance criteria:**
- [ ] Danh sách top 5 orders đang tuyển (% hoàn thành)
- [ ] Danh sách top agents theo số ứng viên
- [ ] Tổng số ứng viên Pass/Fail trong 30 ngày

---

## 🟢 P3 — Mở rộng website

### [T-WEB-009] Agent portal — Upload nhiều passport cùng lúc (batch)
- Type: Feature
- Agent: TBD
- Status: **backlog P3**
- Description: Agent hiện upload từng passport. Cho phép chọn nhiều ảnh cùng lúc, OCR xử lý tuần tự.

---

### [T-WEB-010] Admin — Quản lý handover batch từ danh sách candidates
- Type: Feature
- Agent: TBD
- Status: **backlog P3**
- Description: Hiện handover batch được tạo thủ công. Cho phép admin chọn candidates → tạo batch handover trực tiếp từ danh sách.

---

### [T-WEB-011] Công nợ — Nhắc nhở tự động trong portal
- Type: Feature
- Agent: TBD
- Status: **backlog P3**
- Description: Dashboard admin hiển thị banner/badge cảnh báo khi có order có payment quá hạn (dựa theo payment_date).

---

## ⬛ HOLD — Telegram / Lark mở rộng (làm sau website xong)

> Các tính năng dưới đây bị freeze. Bot wizard hiện tại giữ nguyên, không mở rộng.

- **[T-TELE-C]** Báo cáo tuần Telegram (scheduled) — **HOLD**
- **[T-TELE-D]** Nhắc nhở thanh toán Telegram (daily cron) — **HOLD**
- **[T-LARK-A]** Lark Bitable sync nâng cao (hai chiều) — **HOLD**
- **[T-BOT-EXT]** Mở rộng bot wizard thêm lệnh/workflow — **HOLD**
- **[T-2A-N8N-FOLLOWUP-3]** Optimistic locking checklist toggle — **HOLD**

---

## Completed

### Phase 2A — Telegram Candidate Wizard ✅

- **[T-2A-N8N-001]** Candidate Wizard v2 — ✅ DONE (2026-04-30)
- **[T-2A-N8N-002]** Wizard Idle Ping v2 — ✅ DONE (2026-05-02)
- **[T-2A-VPS-003]** VPS media directory + Nginx — ✅ DONE (2026-05-02)
- **[T-2A-UI-004]** CandidateCard multi-video + consent badge — ✅ DONE (2026-05-02)
- **[T-2A-INFRA-005]** Self-host telegram-bot-api — ✅ DONE (2026-05-02)
- **[T-2A-UI-008]** Deep-link candidate UX — ✅ DONE (2026-05-02)
- **[T-2A-DOC-007]** BotFather menu EN+Bengali — ✅ DONE (2026-05-02)
- **[T-2A-BOT-009]** Bot UX fixes — ✅ DONE (2026-05-02)

### Phase 1 ✅

- **[T-SEC-001]** Fix race condition register API — ✅ DONE
- **[T-API-002]** Validate assigned_labor_number — ✅ DONE
- **[T-API-003]** Cascade agency soft-delete — ✅ DONE

### Phase 1A–1G ✅ (2026-04-13–14)
- Video Notification + Pass/Fail handler
- PCC & Health Cert Daily Report
- OpenClaw + 9Router trên VPS
- OpenClaw query Supabase qua MCP
- OpenClaw bot vào Telegram group

---

## Notes

- Task mới → PM thêm vào P1/P2/P3 theo độ ưu tiên vận hành
- Format ID: `T-{CATEGORY}-{SEQ}` (T-WEB-*, T-TELE-*, T-LARK-*)
- Telegram/Lark chỉ nhận task mới khi toàn bộ P1 hoàn thành và P2 cơ bản ổn định
