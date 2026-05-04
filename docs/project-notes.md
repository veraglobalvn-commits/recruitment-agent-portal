# Project Notes — Recruitment Agent Portal

> PM workspace — ghi chú tổng quan, mục tiêu, đặc thù domain

---

## Tổng quan

**Tên dự án:** Agent Portal (Vera Recruitment)  
**Loại:** Ứng dụng web tuyển dụng lao động xuất khẩu  
**Người dùng chính:**
- Agent/đại lý tuyển dụng (xem đơn hàng, quản lý ứng viên, upload hồ sơ)
- Admin (toàn quyền quản lý đơn hàng, công ty, agents, tài chính)

**Ngôn ngữ UI:** Tiếng Việt (text cứng), giá trị từ DB hiển thị nguyên bản

---

## Stack

- Next.js 14 App Router + TypeScript strict
- Tailwind CSS (không custom CSS ngoài globals.css)
- Supabase Auth + PostgreSQL + Storage
- Deploy: Vercel (auto từ `main`)
- OCR: OCR.space + OpenAI GPT-4o-mini
- Async docs: n8n webhooks (YCTD, hợp đồng, dịch thuật)
- Telegram bots: notification + AI assistant (OpenClaw)

---

## Mục tiêu giai đoạn hiện tại

- Duy trì production stability
- Fix bugs khi phát hiện
- Cải tiến UX dựa trên phản hồi user
- Đảm bảo data safety (Supabase là nguồn chân lý)

---

## Đặc thù domain

### Vai trò (roles)
- `admin` — toàn quyền
- `operator` — admin portal, không xóa
- `read_only` — chỉ xem admin portal
- `agent` — chủ đại lý, quản lý team + đơn hàng
- `member` — thành viên team, thêm ứng viên

### Luồng chính
1. Admin tạo đơn hàng (order) + phân công agent
2. Agent upload hồ sơ ứng viên (passport OCR → candidate)
3. Agent upload video phỏng vấn → Telegram notify
4. Manager bấm Pass/Fail trong Telegram → cập nhật Supabase
5. Admin theo dõi tiến độ, tài chính, công nợ

### Data model quan trọng
- `order.agent_ids[]` — mảng agent được assign
- `candidates.id_ld = ppNo_cleanName` — PK composite
- Soft delete: `deleted_at` (giữ text, xóa file Storage)

---

## Lưu ý kỹ thuật

- **DB-before-deploy:** Cột mới phải `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` + `NOTIFY pgrst, 'reload schema'` trước khi commit code
- **Schema cache error:** `Could not find column` → cột chưa có trong DB, không phải cache bug
- **Auth:** Browser dùng anon key (RLS), API routes dùng service role (bypass RLS)
- **FK check:** Verify FK constraints trước khi join/insert
- **TypeScript:** `npx tsc --noEmit` phải 0 lỗi trước commit

---

## Môi trường

- **Production:** Vercel, auto-deploy từ `main`
- **VPS:** 72.60.40.232 (n8n, OpenClaw, Telegram bots)
- **Supabase:** Project `fpesidoqwxyyutgvalsp`
- **Telegram group:** "Tuyển dụng Bangladesh" (chat ID: `-5163098733`)

---

## Tài liệu liên quan

- <ref_file file="/Users/apple/Coding/recruitment-agent-portal/docs/architecture.md" />
- <ref_file file="/Users/apple/Coding/recruitment-agent-portal/docs/coding-rules.md" />
- <ref_file file="/Users/apple/Coding/recruitment-agent-portal/docs/auth-and-data.md" />
- <ref_file file="/Users/apple/Coding/recruitment-agent-portal/docs/ui-patterns.md" />
