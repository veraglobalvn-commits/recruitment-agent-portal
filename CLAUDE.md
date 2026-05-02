# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Đọc `.claude/CLAUDE.md` để có hướng dẫn đầy đủ về quy tắc làm việc hằng ngày, sensitive areas, và workflow đa agent.**

---

## Quy tắc bắt buộc (áp dụng mọi agent, mọi session)

- **TUYỆT ĐỐI KHÔNG** paste code, diff, nội dung file, hay output dài ra chat.
- Chỉ báo cáo: file nào đã đọc/sửa, làm gì, kết quả. Dùng `<ref_file />` / `<ref_snippet />` để tham chiếu.

---

## Dự án

Vera Global Agent Portal — cổng tuyển dụng lao động xuất khẩu, hai mặt giao diện:

- **Agent Portal** (`/`) — nhân viên/đại lý: xem đơn hàng, upload hồ sơ ứng viên, quản lý team
- **Admin Portal** (`/admin/*`) — quản trị toàn hệ thống

---

## Lệnh

```bash
npm run dev        # Dev server tại localhost:3000
npm run build      # Build production
npm run lint       # ESLint
npx tsc --noEmit   # TypeScript — PHẢI 0 lỗi sau mỗi thay đổi ≥ 2 file
```

---

## Kiến trúc

**Stack:** Next.js 14 App Router + TypeScript strict, Supabase (PostgreSQL + Auth + Storage), Tailwind CSS (không dùng component library), n8n webhooks, Vercel (auto-deploy từ `main`).

### Hai loại Supabase client

| Client | File | Key | Dùng ở đâu |
|---|---|---|---|
| Browser | `lib/supabase.ts` | anon key (theo RLS) | Client Components |
| Server | `lib/auth-helpers.ts` → `getAdminClient()` | service_role (bypass RLS) | API routes, Server Components |

`SUPABASE_SERVICE_ROLE_KEY` tuyệt đối không expose ra client.

### Luồng xác thực

```
Request → middleware.ts (Edge, đọc JWT từ cookie)
  ├── Unauthenticated → redirect /
  └── /admin/* → app/admin/layout.tsx kiểm tra agents.role = 'admin' từ DB
```

**5 roles** (`lib/permissions.ts`): `admin` → `operator` → `read_only` | `agent` → `member`.

**Mọi API route** phải gọi `getAuthenticatedUser()` hoặc `getAdminUser()`. Ngoại lệ duy nhất: `/api/share/[id]` và `/api/auth/*`.

### Cấu trúc thư mục chính

```
app/
├── page.tsx                    # Login → Agent dashboard
├── order/[id]/page.tsx         # Agent: chi tiết đơn + quản lý ứng viên
├── admin/                      # Admin portal (layout.tsx = auth guard)
│   ├── page.tsx                # KPI dashboard
│   └── orders|companies|agencies|agents|candidates|finance|users/
├── api/                        # Route handlers (đều cần auth trừ share + auth/*)
│   ├── passport/route.ts       # OCR hộ chiếu → upsert candidate → n8n
│   ├── admin/agents|agencies|orders|order-agents/
│   └── orders/yctd|contract/   # Trigger n8n async
└── auth/                       # register, callback, pending, reset-password

components/
├── agent/     # LoginForm, CandidateCard, OrdersList, DashboardStats
├── admin/     # CompanyFormModal, AddOrderModal, ConfirmDeleteModal…
└── ui/        # StatusPill, ProgressBar, MediaViewer, LoadingSkeleton

lib/
├── types.ts           # Tất cả interfaces — source of truth TypeScript
├── auth-helpers.ts    # getAuthenticatedUser, getAdminUser, getAdminClient
├── permissions.ts     # RBAC: hasPermission(), ROLE_PERMISSIONS map
├── supabase.ts        # Browser client
├── formatters.ts      # fmtVND, fmtUSD, fmtVndShort, fmtUsdShort
├── imageUtils.ts      # Client-side image compression (max 1500px, JPEG 0.8)
└── admin-context.tsx  # React Context cho admin portal (role, userId)
```

### Database (key tables)

| Bảng | Ghi chú |
|---|---|
| `users` | Agent/operator/admin, FK `supabase_uid = auth.uid()` |
| `agencies` | Công ty môi giới (1 agency → nhiều users) |
| `orders` | Đơn hàng tuyển dụng |
| `order_agents` | Phân công agent cho đơn (order_id, agent_id, assigned_labor_number) |
| `candidates` | Ứng viên — PK `id_ld = {ppNo}_{cleanName}` |
| `companies` | Công ty sử dụng lao động |
| `finance_transactions` | Giao dịch thu chi |

**Soft delete:** cột `deleted_at` — không xóa cứng bao giờ.  
**Thêm cột mới:** chạy `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...; NOTIFY pgrst, 'reload schema';` trong Supabase SQL Editor **trước** khi commit code.

### Storage paths (`agent-media` bucket)

```
candidates/{order_id}/passport_*.jpg
{order_id}/{candidate_id}/*.{mp4,webm}
agents/{agent_id}/avatar_*.{ext}
companies/{id}/img_*.jpg | docs/*
```

Đổi path = mất link file đã upload — không tự ý thay đổi.

### Async workflows (n8n)

`/api/passport`, `/api/orders/yctd`, `/api/orders/contract`, `/api/translate` → gọi n8n webhook (fire-and-forget).  
Kết quả đồng bộ lên Lark Bitable — Lark chỉ là bản sao, **Supabase là nguồn gốc**.

---

## Files nhạy cảm

| File | Rủi ro nếu sai |
|---|---|
| `middleware.ts` | Mất auth toàn hệ thống |
| `lib/auth-helpers.ts` | Lộ service role key |
| `app/admin/layout.tsx` | Lộ admin portal |
| `app/api/passport/route.ts` | Mất dữ liệu ứng viên |
| `lib/types.ts` | Lỗi TypeScript dây chuyền |

Bất kỳ thay đổi nào với các file trên → trình bày rõ sẽ sửa gì và vì sao trước khi bắt đầu.

---

## Đọc thêm

| Chủ đề | File |
|---|---|
| Architecture đầy đủ, API routes, known risks | `docs/architecture.md` |
| Auth patterns chi tiết, env vars, storage | `docs/auth-and-data.md` |
| UI patterns, responsive, Tailwind conventions | `docs/ui-patterns.md` |
| Quy tắc code chi tiết (process, data safety, security) | `docs/coding-rules.md` |
| Hướng dẫn làm việc hằng ngày, workflow đa agent | `.claude/CLAUDE.md` |
