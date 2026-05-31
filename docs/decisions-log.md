# Decisions Log

> PM ownership — log mọi quyết định kiến trúc/hệ thống

**Format:** `[YYYY-MM-DD] Quyết định / Lý do / Ảnh hưởng`

---

## 2026-05-31 (session 8 — website-first operating plan)

### [2026-05-31] Deploy production commit `9866f10` và dọn dirty worktree

- **Quyết định:** Push và deploy commit `9866f10` lên production VPS `/var/www/portal`. Trước khi pull, stash toàn bộ dirty files cũ trên VPS vào `stash@{0}: codex-pre-9866f10-deploy`.
- **Lý do:** Local/docs đã ghi trạng thái bulk move candidates + job positions là implemented/migrated, nhưng production vẫn ở `e057427` và VPS có dirty code. Nếu không chốt bằng commit/deploy sạch, phiên sau dễ nhầm trạng thái giữa local, remote, và runtime.
- **Verify sau deploy:** `origin/main` = local = VPS đều ở `9866f10`; `npm run build` pass trên VPS; `systemctl restart portal` thành công; portal active trên port `3001`; health check `https://portal.veraglobal.vn/` trả 200; PostgREST check `job_positions`, `order_positions`, `candidates.position_id` đều trả 200; `TELEGRAM_BRIDGE_SECRET` giữa portal và n8n khớp.
- **Cảnh báo cho phiên sau:** Không drop stash `codex-pre-9866f10-deploy` khi chưa review vì trong đó có dirty VPS files trước deploy (`app/admin/orders/[id]/page.tsx`, `app/api/translate/route.ts`, `.env.local.bak_translate_20260531035542`, `deploy/telegram-bot-api/docker-compose.yml.bak`). Còn stash cũ `codex-pre-main-deploy` từ phiên 2026-05-30.
- **Cảnh báo không block deploy:** `npm ci` báo 7 vulnerabilities trong dependency tree hiện tại; `next build` có warning cache webpack transient nhưng build pass. Chưa xử lý dependency audit trong phiên này.

### [2026-05-31] Website phải hoàn chỉnh nghiệp vụ trước khi tích hợp Telegram/Lark/n8n mở rộng

- **Quyết định:** Mọi chức năng nghiệp vụ phải thực hiện được trên website portal trước. Telegram/Lark/n8n chỉ được tích hợp sau như kênh mở rộng, automation, notification, hoặc document generation.
- **Ví dụ áp dụng:** Với "thông báo khi có ứng viên mới", admin phải có cách nhận biết và xử lý ứng viên mới trên website trước; Telegram group notification là kênh push phụ, không phải workflow chính duy nhất.
- **Lý do:** Website là nền tảng vận hành chính cho agent owner, members và admin. Nếu phụ thuộc Telegram trước, core workflow dễ bị vỡ khi webhook/env/n8n lỗi và khó kiểm thử end-to-end.
- **Ảnh hưởng:** Task-list thêm `T-WEB-CORE-001`, `T-WEB-CORE-002`, `T-WEB-JOBPOS-001`. Các task document/n8n như Demand Letter, hợp đồng công ty Việt Nam, YCTD/contract nên gom thành phase sau core recruitment website.

### [2026-05-31] Job positions phải discovery nghiệp vụ trước khi thiết kế schema

- **Quyết định:** Không tạo migration/schema/UI cho job positions cho đến khi hỏi user và chốt business rules thực tế.
- **Câu hỏi bắt buộc:** position theo order hay danh mục chung; ai gán cho candidate; 1 candidate có mấy position; field tối thiểu; quota tính theo order/position/agent-position.
- **Lý do:** Đây là entity nghiệp vụ mới, nếu tự giả định sai sẽ kéo theo DB/API/UI/RLS/report sai.
- **Ảnh hưởng:** Phiên sau bắt đầu bằng `T-WEB-JOBPOS-001` nếu làm job positions, không nhảy thẳng vào code.

### [2026-05-31] Candidate queue dùng `/admin/candidates` Pending, không tạo inbox/dashboard riêng

- **Quyết định:** Dùng filter Pending hiện có trên `/admin/candidates` làm queue chính để admin chấm ứng viên.
- **Lý do:** Chấm ứng viên là workflow danh sách có volume lớn; đặt trong candidates list đúng hơn dashboard card hoặc inbox riêng.
- **Ảnh hưởng:** `T-WEB-CORE-002` đóng ở mức UX decision. Nếu cần cải thiện sau thì làm ngay trong `/admin/candidates`: nhãn "Chờ chấm", sort mới nhất, count theo filter, link từ order detail sang pending candidates.

### [2026-05-31] Business rules cho job positions

- **Quyết định:** Job positions là danh mục dùng chung toàn hệ thống, được phân theo ngành nghề của order. Mỗi order có số lượng riêng cho từng position do admin nhập.
- **Quy tắc gán:** Admin và agent đều gán được position cho candidate, nhưng chỉ sau khi candidate đã passed. Mỗi candidate chỉ có 1 position.
- **Field tối thiểu:** Tên vị trí và số lượng.
- **Quota:** Quota tổng vẫn theo order; position quota là phân bổ số lượng trong từng order, không thay thế quota order.
- **Audit:** Code hiện có chỉ có `orders.job_type`/`job_type_en` dạng text tự do; chưa có position catalog, order-position quota, hoặc candidate-position assignment.
- **Ảnh hưởng:** `T-WEB-JOBPOS-001` hoàn tất discovery. Task build tiếp theo là `T-WEB-JOBPOS-002`, có DB migration nên phải trình bày SQL và chờ user xác nhận trước khi chạy.

### [2026-05-31] Job positions implementation dùng catalog + order quota + candidate assignment

- **Quyết định:** Implement bằng `job_positions` catalog theo ngành nghề, `order_positions` cho quota theo từng order, và `candidates.position_id` cho assignment 1 vị trí/ứng viên.
- **Lý do:** Giữ `orders.job_type` làm mô tả text hiện hữu, không phá workflow tài liệu/dịch thuật cũ; position mới phục vụ phân bổ sau khi candidate đã Passed.
- **Guardrail:** Cấu hình quota position chỉ admin làm. Gán position đi qua API server-side và chỉ cho candidate `Passed`; agent/member chỉ gán được candidate thuộc owner/effective agent của mình.
- **Ảnh hưởng:** Trước deploy phải chạy migration `20260531000001_add_job_positions.sql` trên Supabase và reload schema, nếu không code tham chiếu bảng/cột mới sẽ lỗi schema cache.

---

## 2026-05-30 (session 7 — member owner production fix)

### [2026-05-30] Khép lại bug member không thấy order của owner agent

- **Triệu chứng:** `MEMBER_TEST_2` thuộc agency/owner `DUONGTRANHD90` (`duongtranhd90@gmail.com`) login nhưng không thấy order.
- **Điều tra:** DB/RLS sau migration cho thấy member session đã đọc được 2 order của owner (`NICE_042026`, `GOM_SON_DONG_042026`). Production `/api/agents/me` lại trả `owner_agent_id = null`.
- **Root cause:** VPS production đang chạy commit cũ trên branch `devin/t-2a-infra-005-telegram-bot-api`, chưa có code fix 2026-05-23 (`/api/agents/me` resolve owner_agent_id bằng service_role, dashboard dùng owner id cho member).
- **Fix đã làm:**
  - Chạy 2 migration RLS bằng `supabase db query --linked --file`.
  - Push chuỗi commit fix member/owner lên `origin/main`.
  - Trên VPS: stash file dirty `app/api/telegram/candidate/route.ts`, checkout/pull `main`, `npm ci`, `npm run build`, copy `.next/static` vào standalone, restart `portal`.
  - Theo checklist deploy: phát hiện `TELEGRAM_BRIDGE_SECRET` mismatch, sync secret từ portal `.env.local` vào `/var/www/portal/deploy/n8n/.env`, `docker compose up -d`, verify OK.
- **Verify:** production `/api/agents/me` với session `MEMBER_TEST_2` trả `owner_agent_id = DUONGTRANHD90`; member query thấy 2 order; user xác nhận member đã thấy order trong UI.
- **Lưu ý VPS:** còn `stash@{0}: codex-pre-main-deploy` giữ thay đổi cũ ở `app/api/telegram/candidate/route.ts`; còn file untracked `deploy/telegram-bot-api/docker-compose.yml.bak`. Không tự xóa khi chưa review.

---

## 2026-05-23 (session 6 — member/session bug fixes)

### [2026-05-23] Fix 5 bugs member/owner_agent_id + session stale

**Bugs đã fix (code, committed):**
- **BUG-2** `e86812b`: member truy cập `/order/[id]` direct URL trước khi dashboard load → `agency_id` thiếu → 0 candidates. Fix: fallback fetch qua `/api/agents/me` (service_role, bypass RLS).
- **BUG-3** `e86812b`: `sessionStorage` không clear khi logout → stale cache. Fix: thêm `sessionStorage.clear()` vào `handleLogout`.
- **BUG-4** `e86812b`: `localStorage` stale khi session expire tự nhiên. Fix: xóa trong `onAuthStateChange` else branch.
- **BUG-5** `8997b7b` (critical): member bị RLS block khi query `users` table bằng browser client → `owner_agent_id` không fetch được → 0 orders/candidates dù RLS đã fix trước đó. Fix: `/api/agents/me` trả về `owner_agent_id` server-side (service_role), `fetchDashboardData` dùng API thay vì `supabase.from('users')`.

**Bugs pending — cần user chạy migration (T-FIX-001):**
- **BUG-1**: `recruitment_stats` view chưa grant SELECT cho `authenticated` → member stats = null.
- **BUG-5 defense-in-depth**: `users_member_read_agency` policy chưa có → member không query được users cùng agency qua browser client trực tiếp.
- **Migration file:** `supabase/migrations/20260523000002_fix_member_rls_users_and_stats.sql`

**Lý do không tự động hóa được:**
- Supabase REST API (PostgREST) không cho phép DDL.
- Management API cần Personal Access Token (không phải service_role key).
- DB direct connection (`psql`) cần DB password — chỉ có trong Supabase Dashboard.
- **Để session sau Devin tự chạy:** thêm `SUPABASE_DB_PASSWORD` hoặc `SUPABASE_ACCESS_TOKEN` vào `.env.local` trên VPS.

### [2026-05-23] Pattern: dùng /api/agents/me thay vì browser client query users table

- **Quyết định:** Mọi chỗ cần fetch thông tin user khác (kể cả owner của member) phải đi qua server-side API route dùng `getAdminClient()` (service_role), không dùng browser supabase client.
- **Lý do:** Browser client bị RLS `users_read_self` — chỉ đọc được bản thân. Đây là silent failure — không có error, chỉ có null/empty result.
- **Ảnh hưởng:** `/api/agents/me` đã được mở rộng trả về `owner_agent_id` cho member. Pattern này áp dụng cho mọi cross-user lookup trong tương lai.

---

## 2026-05-23 (session 5 — master plan restructure)

### [2026-05-23] Đổi chiến lược: website core trước, Telegram/Lark sau
- **Quyết định:** Tái cơ cấu task-list theo 4 nhóm ưu tiên: P1 (core vận hành) → P2 (UX/Admin) → P3 (mở rộng website) → HOLD (Telegram/Lark). Mọi task Telegram/Lark mới bị freeze cho đến khi website P1+P2 hoàn thành.
- **Lý do:** Phản hồi từ user — tập trung hoàn thiện chức năng vận hành thực tế (tuyển dụng, agents, in document, sắp xếp lao động, tài chính) trước khi mở rộng sang kênh phụ trợ.
- **Ảnh hưởng:**
  - T-WEB-001 (bulk move candidates) giữ nguyên priority cao nhất, READY TO BUILD.
  - T-WEB-002 (In Demand Letter) được thêm mới vào P1 — chưa có UI + API + n8n workflow.
  - T-WEB-003 (verify YCTD/Contract n8n) cần user kiểm tra thực tế.
  - T-TELE-C, T-TELE-D, T-LARK-A, T-BOT-EXT chuyển sang HOLD.
  - UAT 5 nhóm giữ nguyên nhưng không block task mới.

---

## 2026-05-04 (session 4 — bot incident + UAT + planning)

### [2026-05-04] Bot wizard "An error occurred" — TELEGRAM_BRIDGE_SECRET mismatch
- **Quyết định:** Sync `TELEGRAM_BRIDGE_SECRET` giữa n8n và portal — luôn dùng giá trị từ portal `.env.local` làm chuẩn.
- **Lý do (điều tra thực tế):**
  1. Tất cả n8n executions đều `success` → lỗi nằm trong flow, không phải n8n crash
  2. Verify portal API thủ công → trả `401 BAD_SIGNATURE`
  3. Compare 2 secrets: n8n=`d5895243...`, portal=`42b777e8...` → **mismatch**
  4. n8n sign HMAC bằng secret sai → portal reject → wizard catch → gửi "An error occurred"
- **HMAC protocol đúng (không thay đổi):** `HMAC-SHA256(secret, "${timestamp}.${rawBody}")`, headers `x-bridge-timestamp` + `x-bridge-signature`
- **Fix:** Cập nhật `/var/www/portal/deploy/n8n/.env`, `docker compose up -d` — không cần rebuild portal
- **Bài học:** Khi rebuild portal (thay đổi `.env.local`), phải verify `TELEGRAM_BRIDGE_SECRET` khớp với n8n. Thêm vào checklist deploy.
- **Commit:** Chỉ thay đổi trên VPS, không có code thay đổi cần commit.

### [2026-05-04] Video notification không hoạt động — 2 env vars sai trong portal
- **Quyết định:** Fix `NEXT_PUBLIC_N8N_VIDEO_NOTIFY_URL` (thiếu) và `NEXT_PUBLIC_N8N_VIDEO_UPDATE_URL` (value=key name) trong VPS `.env.local`. Rebuild portal.
- **Lý do:** Portal code check `if (notifyUrl)` → falsy → không gọi webhook → n8n Video Notification workflow không có execution. PCC Daily Report (cron) vẫn chạy bình thường → vấn đề không liên quan đến bot migration hay workflow.
- **Webhook URLs xác nhận từ n8n DB:**
  - `NEXT_PUBLIC_N8N_VIDEO_NOTIFY_URL` = `https://n8n.veraglobal.vn/webhook/telegram-video-notify`
  - `NEXT_PUBLIC_N8N_VIDEO_UPDATE_URL` = `https://n8n.veraglobal.vn/webhook/update-candidate`
- **Bài học:** `NEXT_PUBLIC_*` vars được bake vào bundle lúc build → sai value không báo lỗi runtime.

---

## 2026-05-02 (session 3 — T-ADM-001 planning)

### [T-ADM-001] assigned_labor_number tự động track theo thực tế khi move ứng viên
- **Quyết định:** Sau mỗi lần move candidates sang order mới, UPSERT `order_agents` SET `assigned_labor_number` = tổng candidates thực tế của agent trong order đó SAU MOVE. Áp dụng cả khi agent đã có lẫn chưa có trong order_agents.
- **Lý do:** Đảm bảo nhất quán — move 1 ứng viên hay bulk 10 ứng viên cùng lúc đều cho kết quả `assigned_labor_number` như nhau. Nếu chỉ set lúc "lần đầu thêm agent", move từng ứng viên sẽ khiến số bị lệch thực tế.
- **Ảnh hưởng:** Admin không cần tự tính/cập nhật quota sau khi move. Nếu muốn set quota riêng khác thực tế, vào order detail điều chỉnh thủ công sau. Có clamp `min(count, remaining_quota)` + warning nếu vượt `total_labor`.

### [T-ADM-001] Tính năng đổi order có ở 2 entry points
- **Quyết định:** `/admin/candidates` (chọn từ nhiều order) + `/admin/orders/[id]` (chọn trong order hiện tại → chuyển đi). Dùng chung `ChangeOrderModal` component và cùng 1 API endpoint.
- **Lý do:** Tránh duplicate logic, đảm bảo UX nhất quán. Order detail đã có `selectedCandidates` state → tận dụng.
- **Ảnh hưởng:** Cần tạo `components/admin/ChangeOrderModal.tsx` dùng chung. CandidateCard thêm optional props `selectable/selected/onToggleSelect` không breaking existing usages.

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

## 2026-05-02 (session 2 — n8n recovery + bot fix)

### [2026-05-02] N8N_BLOCK_ENV_ACCESS_IN_NODE=false bắt buộc cho HTTP node expressions
- **Quyết định:** Thêm `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` vào `/var/www/portal/deploy/n8n/.env`.
- **Lý do:** Không chỉ Code nodes mà **HTTP Request node URL expressions** (`{{ $env.TOKEN }}`) cũng cần setting này. Thiếu → `$env.*` trả `undefined` → URL `/bot[undefined]/...`.
- **Ảnh hưởng:** Bắt buộc có trước khi workflow chạy được.

### [2026-05-02] N8N_PROXY_HOPS=1 bắt buộc khi n8n sau nginx
- **Quyết định:** Thêm `N8N_PROXY_HOPS=1` vào n8n `.env`.
- **Lý do:** n8n dùng express-rate-limit; khi nginx forward request có `X-Forwarded-For` header mà Express chưa trust proxy → `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` → webhook request bị reject.
- **Ảnh hưởng:** Sau khi set, webhook processing hoạt động bình thường qua nginx.

### [2026-05-02] n8n volume mount path phải là /home/node (không phải /home/node/.n8n)
- **Quyết định:** `docker-compose.yml` n8n dùng `n8n_data:/home/node` thay vì `n8n_data:/home/node/.n8n`.
- **Lý do:** Volume `n8n_n8n_data` có cấu trúc `(root)/.n8n/config` (từ recovery cũ mount tại `/home/node`). Khi mount tại `/home/node/.n8n`, n8n đọc `(root)/config` — file này có encryption key khác → crash với "Mismatching encryption keys".
- **Ảnh hưởng:** `docker compose up -d` (không force-recreate) đủ để apply thay đổi này an toàn.

### [2026-05-02] telegram-bot-api + n8n kết nối qua n8n_default — tg_net không cần thiết
- **Quyết định:** `deploy/telegram-bot-api/docker-compose.yml` đặt `telegram-bot-api` (và `tg-file-server`) vào network `n8n_default` (external). Commit `f7e521a` đồng thời add n8n vào `n8n_default` → cả 2 service cùng network, resolve hostname được.
- **Lý do:** Gap ban đầu ("cần connect tg_net") đã được resolve theo cách khác: chia sẻ `n8n_default` thay vì `tg_net`. n8n gọi `http://telegram-bot-api:8081` qua n8n_default — hoạt động ổn định.
- **Ảnh hưởng:** Không cần manual `docker network connect tg_net telegram-bot-api` nữa. Việc add `tg_net` vào telegram-bot-api compose không cần làm.

### [2026-05-02] Portal UI — telegram_user_id thiếu trong preloaded agent data
- **Quyết định:** Thêm `telegram_user_id` vào SELECT query và `preloadedAgentRef` ở 3 đường login trong `app/page.tsx`.
- **Lý do:** `preloadedAgentRef` được dùng để skip DB round-trip, nhưng thiếu `telegram_user_id` → `setTelegramLinked(false)` luôn → banner "Connect Telegram" hiện dù agent đã link.
- **Ảnh hưởng:** Fix commit `f7e521a`, deploy thành công 2026-05-02.

### [2026-05-02] deploy.sh next: not found — transient npm TAR error
- **Quyết định:** Không thay đổi deploy.sh. Vấn đề là transient TAR extraction error trong `npm ci` gây `next` binary không được extract đúng.
- **Lý do:** Disk space đủ (74GB free), `next` binary tồn tại sau deploy thất bại. Re-trigger deploy pass bình thường.
- **Ảnh hưởng:** Nếu lặp lại, manual fix: `cd /var/www/portal && rm -rf node_modules && npm ci`.

---

### [2026-05-02] TELEGRAM_LOCAL=1 — confirmed active, synced vào compose file
- **Quyết định:** Bật `TELEGRAM_LOCAL: "1"` trong `docker-compose.yml` telegram-bot-api để bypass giới hạn 20MB getFile.
- **Lý do:** Xác nhận qua `docker inspect`: container đang chạy với `TELEGRAM_LOCAL=1` (set thủ công trong session 2026-05-02, không qua compose file). Nếu container bị recreate mà compose file không có var này → mất local mode.
- **Fix (2026-05-02):** Sync vào `deploy/telegram-bot-api/docker-compose.yml` (git + VPS). Commit `91059cd`.
- **Lưu ý kỹ thuật:** `file_path` từ getFile ở local mode là absolute path (`/var/lib/telegram-bot-api/TOKEN/...`). Workflow normalize về relative trước khi file-server serve.
- **Healthcheck:** Fix cùng commit — healthcheck cũ test `wget /` → 404 → "unhealthy" giả. Fix: check exit code ≠ 4 (connection refused) thay vì exit 0 (200 OK).

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
