# Task List

> PM ownership — nguồn sự thật cho tasks

**Format:** `[ID] | [Title] | [Type] | [Agent] | [Status] | [Acceptance Criteria]`

---

## Chiến lược (cập nhật 2026-05-31)

**Ưu tiên mới: Website core trước → Telegram/Lark sau**

Tập trung hoàn thiện toàn bộ chức năng vận hành trên website (portal) trước khi phát triển thêm tính năng mở rộng trên Telegram / Lark / n8n. Website phải là nơi thực hiện được đầy đủ nghiệp vụ trước; các hệ thống mở rộng chỉ bổ sung automation, notification, hoặc document generation sau khi workflow website đã chạy được.

**Nguyên tắc bắt buộc cho feature mới:**
- Mọi chức năng nghiệp vụ phải có website flow trước, rồi mới tích hợp Telegram/Lark/n8n nếu cần.
- Ví dụ: "thông báo khi có ứng viên mới" phải có notification/inbox/trạng thái xử lý trên website trước; Telegram chỉ là kênh push phụ sau đó.
- Với feature tạo entity DB mới hoặc thay đổi quan hệ nghiệp vụ, phải hỏi user để chốt business rules trước khi thiết kế schema/migration.

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

### [T-WEB-CORE-001] Audit core recruitment website flow — ✅ DONE (2026-05-31)
- Type: Audit/Verify
- Agent: Codex
- Status: **completed** — audit code-level, chưa chạy UAT browser bằng account thật trong phiên này
- Description: Xác nhận toàn bộ flow tuyển dụng chính chạy được trên website trước khi làm mở rộng.

**Scope:**
- Agent owner/member thấy đúng orders/candidates
- Agent owner/member upload ứng viên vào order
- Admin thấy ứng viên mới trên website
- Admin chấm Pass/Fail trên website hoặc qua flow hiện có, DB cập nhật đúng
- Xác định phần nào đang phụ thuộc Telegram/n8n mà website chưa có fallback đầy đủ

**Acceptance criteria:**
- [x] Liệt kê các route/API/component đã audit
- [x] Ghi rõ blocker nếu owner/member/admin chưa dùng được end-to-end trên website
- [x] Không build Telegram/Lark/n8n feature mới trong task này

**Audit result (2026-05-31):**
- Routes/components audited: `/` agent dashboard, `/order/[id]`, `/admin/candidates`, `/admin/orders/[id]`, `CandidateCard`, `OrdersList`, `ChangeOrderModal`.
- APIs audited: `/api/agents/me`, `/api/passport`, `/api/candidates/[id]`, `/api/admin/candidates/change-order`, `/api/admin/order-agents`, `/api/admin/orders/[id]`.
- Owner/member visibility: website flow uses `/api/agents/me` to resolve `owner_agent_id`; dashboard/order detail then query by effective owner agent id. This matches the production member fix.
- Candidate upload: website has manual add and OCR passport upload. OCR route writes candidate via service role and only syncs Lark/n8n fire-and-forget after DB write, so website DB write is primary.
- Admin visibility: `/admin/candidates` and `/admin/orders/[id]` load candidates directly from Supabase and expose filters/order links.
- Admin Pass/Fail: website UI exists in `/admin/candidates`; DB update is direct browser Supabase update, relying on admin RLS. This is usable if admin RLS is correct, but should be hardened later through an admin API route for consistency.
- Website fallback gap: candidate edit/photo/PCC/health/video update works on website DB/storage first, but Lark/n8n update remains fire-and-forget. No blocking dependency for website DB state.
- Blocker found: no website-native "new/unreviewed candidate" queue/state beyond filtering Pending and local-only `newVideoCandidates`; this remains `T-WEB-CORE-002`.
- Verification gap: no live browser UAT performed in this audit; recommend user test owner/member/admin accounts when convenient.

---

### [T-WEB-CORE-002] Website-first candidate notification — ✅ DECIDED (2026-05-31)
- Type: Feature
- Agent: Codex
- Status: **completed as UX decision** — dùng `/admin/candidates` filter Pending làm queue chấm ứng viên; chưa build inbox/dashboard riêng
- Description: Admin phải nhận biết có ứng viên mới ngay trong website trước; Telegram notification chỉ là kênh mở rộng sau.

**Acceptance criteria:**
- [x] Website admin có cơ chế nhận biết ứng viên mới/chưa xử lý
- [x] Admin có thể mở candidate/order liên quan từ website
- [x] Trạng thái đã xem/đã xử lý rõ ràng nếu nghiệp vụ yêu cầu
- [x] Sau khi website flow ổn mới xem xét push Telegram

**Decision note (2026-05-31):**
- Không đặt danh sách/KPI ứng viên chờ xử lý trên `/admin` dashboard vì lượng ứng viên cần chấm sẽ lớn, UX không phù hợp.
- User duyệt hướng dùng filter Pending hiện có trên `/admin/candidates` làm queue chính để admin chấm ứng viên.
- Nếu cần cải thiện sau: đổi nhãn Pending thành "Chờ chấm", sort mới nhất lên đầu, thêm count theo filter, và link từ order detail sang candidates đã filter theo order + pending.

---

### [T-WEB-JOBPOS-001] Discovery job positions business rules — ✅ DONE (2026-05-31)
- Type: Discovery
- Agent: Codex
- Status: **completed** — user confirmed business rules; code/schema audit found no existing dedicated position entity
- Description: Hỏi user để chốt nghiệp vụ job positions trước khi thiết kế DB/API/UI.

**Business rules confirmed (2026-05-31):**
- Job positions là danh mục dùng chung toàn hệ thống, được nhóm theo ngành nghề song ngữ.
- Admin và agent đều được gán position cho candidate, nhưng chỉ sau khi candidate đã passed.
- Mỗi candidate chỉ có 1 position.
- Field danh mục position: tên vị trí VI/EN, tỷ trọng mặc định %, không có số lượng.
- Ngành nghề cần quản lý song ngữ VI/EN; không tiếp tục phụ thuộc dịch tự động mỗi lần thêm order/company.
- Mỗi order chọn một phần hoặc toàn bộ positions thuộc ngành nghề đã chọn thủ công trên order.
- Quota tổng vẫn tính theo order. Mỗi order-position có số lượng tuyển dụng riêng, admin fill số lượng tại order đó.
- Tỷ trọng mặc định tính theo `orders.total_labor`, dùng để tham khảo khi assign và warning nếu số ứng viên đã assign vượt tỷ trọng default.
- UI phải hiển thị số lượng ứng viên khả dụng còn có thể assign cho mỗi vị trí trong order.

**Audit result:**
- Code hiện có dùng `orders.job_type`/`job_type_en` dạng text tự do để mô tả loại lao động/vị trí trên order.
- `lib/types.ts` chưa có type/table dedicated cho job positions.
- Không thấy bảng migration hiện có cho position catalog, order-position quota, hoặc candidate-position assignment.
- Không thấy candidate field hiện có để gán position riêng.

**Acceptance criteria:**
- [x] User confirm business rules
- [x] Audit schema/code hiện có để tránh tạo trùng concept
- [x] Chỉ sau đó mới viết task build/migration cụ thể

---

### [T-WEB-JOBPOS-002] Build website job positions flow — NEEDS UX REWORK (2026-05-31)
- Type: Feature/DB
- Agent: Codex
- Status: **deployed but UX rejected; rework plan approved for next session** — production ở commit `9866f10`; migration đã chạy trên Supabase; cần rework UX/schema theo plan mới
- Description: Thêm danh mục vị trí toàn hệ thống, cấu hình số lượng vị trí theo từng order, và gán 1 vị trí cho candidate sau khi candidate passed.

**Approved rework plan (2026-05-31):**
- Tạo page riêng `/admin/job-positions`, menu label **Vị trí tuyển dụng**.
- Quản lý danh mục ngành nghề song ngữ VI/EN.
- Quản lý danh mục position song ngữ VI/EN theo ngành nghề.
- Position catalog có `default_weight_percent` dạng %, không có số lượng tuyển dụng.
- Order chọn thủ công ngành nghề.
- Trong order detail, admin chọn một phần hoặc toàn bộ positions thuộc ngành nghề đã chọn và nhập số lượng tuyển dụng riêng cho từng order-position.
- Tỷ trọng mặc định tính theo `orders.total_labor`, dùng để tham khảo khi assign candidate và warning nếu assigned count vượt ngưỡng default.
- Khi tính ngưỡng từ %, xử lý làm tròn tương đối theo tổng và phân bổ thực tế; không áp dụng làm tròn tuyệt đối cứng gây lệch tổng hoặc warning sai.
- UI hiển thị số lượng ứng viên khả dụng còn có thể assign cho mỗi vị trí trong order.
- Candidate passed được gán 1 position trong list position đã chọn của order.
- Không implement UI mới nếu chưa trình UX/UI chi tiết và được user duyệt lại.

**Expected scope:**
- DB: industry catalog song ngữ, position catalog song ngữ theo industry kèm default weight %, order-position quota, candidate position assignment.
- Admin: quản lý position catalog; fill số lượng từng position trong order.
- Admin/Agent: gán position cho candidate đã passed.
- Validation: không cho gán position cho candidate chưa passed; mỗi candidate tối đa 1 position.
- Reporting: hiển thị số lượng từng position trong order và số đã gán.

**Acceptance criteria:**
- [x] Có migration SQL được tạo và đã chạy sau khi user xác nhận
- [x] Admin cấu hình được position quota theo order
- [x] Admin/agent gán được 1 position cho candidate đã passed
- [x] Candidate chưa passed không gán được position
- [x] Order detail hiển thị quota từng position và count đã gán
- [x] TypeScript 0 lỗi

**Implementation result (2026-05-31):**
- Migration tạo `job_positions`, `order_positions`, và thêm `candidates.position_id`.
- API đọc/cấu hình position theo order, tạo catalog position theo ngành nghề, và gán position cho candidate qua server-side auth.
- Admin order detail có section "Vị trí tuyển dụng" để thêm position và set số lượng từng order.
- Agent/admin CandidateCard có dropdown gán position cho candidate Passed.
- Agent order detail hiển thị quota/assigned count theo position.
- Migration run: `supabase/migrations/20260531000001_add_job_positions.sql`.
- Verify: PostgREST trả 200 cho `job_positions`, `order_positions`, và `candidates.position_id`.
- Deploy verify: VPS `/var/www/portal` chạy commit `9866f10`; `npm run build` pass; portal service active; health check trả 200; `TELEGRAM_BRIDGE_SECRET` khớp n8n.
- Pending: UAT admin/agent bằng tài khoản thật.
- Rework note: UX hiện tại trong order detail không đúng ý user vì trộn quản lý catalog với cấu hình order. Phiên sau cần refactor theo approved rework plan ở trên.

---

### [T-FIX-001] Chạy migration RLS cho member role — ✅ DONE (2026-05-30)
- Type: Bug/Migration
- Status: **completed** — Codex chạy trực tiếp 2 migration qua `supabase db query --linked --file`
- Fix A: policy `users_member_read_agency` trên `users` table ✅
- Fix B: `GRANT SELECT ON recruitment_stats TO authenticated` ✅
- Verify: member role xuất hiện trong policies liên quan (`orders`, `candidates`, `companies`, `order_agents`, `users`, `recruitment_stats`); `authenticated` có SELECT trên `recruitment_stats` ✅

---

### [T-WEB-001] Admin bulk move candidates — ✅ DONE (2026-05-30)
- Type: Feature
- Agent: Devin
- Status: **completed** — implemented by Codex, user verified move flow works
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
- [x] Chọn ≥1 ứng viên → floating bar hiện
- [x] Modal dropdown order đích, exclude order hiện tại
- [x] API move thành công: `candidates.order_id` cập nhật
- [x] Agent chưa có trong order mới → auto INSERT `order_agents` với count thực tế
- [x] Agent đã có → UPDATE `assigned_labor_number` = count thực tế (clamped)
- [x] Warning nếu bị clamp do vượt quota
- [x] `/admin/orders/[id]`: ứng viên đã move biến khỏi danh sách ngay
- [x] TypeScript 0 lỗi

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

### [T-WEB-JOBPOS-003] Rework delete UX for order job positions — ✅ DONE (2026-06-02)

- Context: Admin order detail supports configuring recruitment positions per order, auto-calculating quantities from default position weights, showing total/difference, compacting the UI, and placing the module directly above candidates.
- Result: order detail now separates available catalog positions from selected order positions. The visible list renders selected `order_positions` only, with an explicit add/select flow for catalog positions.
- Delete UX: deleting a position saves quantity `0` through the existing API path, backend removes the `order_positions` row and clears affected candidate assignments, then UI removes the row from the selected list immediately.
- Quantity edit UX: row quantity inputs no longer auto-save on blur. Admin can edit multiple rows locally, then use `Lưu thay đổi` or `Huỷ thay đổi`. `Tính lại theo tỷ trọng` now updates local pending quantities only.
- Verification: user UAT passed; `npx tsc --noEmit` passed after implementation. Candidate assignment dropdown remains limited to selected positions with quantity > 0; totals/difference use selected positions only; recalculation does not re-add removed positions.
