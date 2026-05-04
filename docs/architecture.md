# Architecture — Agent Portal

> Tài liệu này mô tả kiến trúc **thực tế** từ codebase (không phải thiết kế lý tưởng).

---

## Tổng quan hệ thống

Ứng dụng tuyển dụng lao động xuất khẩu gồm hai mặt giao diện:

- **Agent Portal** (`/`) — nhân viên/đại lý tuyển dụng: xem đơn hàng, quản lý ứng viên, upload hồ sơ
- **Admin Portal** (`/admin/*`) — quản trị viên: toàn quyền quản lý đơn hàng, công ty, agents, tài chính

---

## Stack thực tế

| Layer | Công nghệ | Version |
|---|---|---|
| Framework | Next.js App Router | 14.2.35 |
| Language | TypeScript strict | ^5 |
| Styling | Tailwind CSS | 3.4.1 |
| Auth | Supabase Auth + `@supabase/ssr` | 0.10.2 |
| Database | Supabase PostgreSQL | — |
| Storage | Supabase Storage (`agent-media` bucket) | — |
| OCR | OCR.space + OpenAI GPT-4o-mini | — |
| Async docs | n8n webhooks (YCTD, hợp đồng, dịch thuật) | — |
| Deploy | Vercel (auto từ `main`) | — |

---

## Cấu trúc thư mục

```
app/
├── page.tsx                     # Entry: login → agent dashboard
├── layout.tsx                   # Root layout (Server Component)
├── error.tsx                    # Global error boundary
├── order/[id]/page.tsx          # Agent: chi tiết đơn + quản lý ứng viên
├── profile/page.tsx             # Cập nhật hồ sơ cá nhân
├── agency/page.tsx              # Hồ sơ công ty môi giới
├── team/page.tsx                # Quản lý thành viên nhóm
├── auth/
│   ├── callback/route.ts        # OAuth redirect handler
│   ├── register/page.tsx        # Đăng ký tự do
│   ├── complete-profile/page.tsx
│   ├── pending/page.tsx         # Chờ admin duyệt
│   └── reset-password/page.tsx
├── admin/
│   ├── layout.tsx               # Admin shell + auth guard (role check)
│   ├── page.tsx                 # Admin dashboard: KPI, đơn hàng, agents
│   ├── orders/[id]/page.tsx     # Chi tiết đơn hàng (admin)
│   ├── companies/[id]/page.tsx  # Chi tiết công ty (admin)
│   ├── agencies/[id]/page.tsx   # Chi tiết đại lý (admin)
│   ├── agents/[id]/page.tsx     # Chi tiết nhân viên (admin)
│   ├── users/page.tsx           # Quản lý tài khoản
│   ├── candidates/page.tsx      # Toàn bộ ứng viên
│   ├── finance/page.tsx         # Theo dõi thu chi
│   ├── debt/page.tsx            # Công nợ
│   └── policy/page.tsx          # Chính sách
└── api/                         # (xem bảng API bên dưới)

components/
├── agent/                       # LoginForm, DashboardStats, OrdersList, CandidateCard
├── admin/                       # CompanyFormModal, AddOrderModal, AddAgentModal, ConfirmDeleteModal
└── ui/                          # StatusPill, ProgressBar, MediaViewer, VideoPlayer, LoadingSkeleton

lib/
├── types.ts                     # Tất cả interfaces (single source of truth)
├── supabase.ts                  # Browser client (anon key)
├── auth-helpers.ts              # Server-side: getAuthenticatedUser, getAdminUser, getAdminClient
├── permissions.ts               # RBAC: 5 roles, hasPermission(), ROLE_PERMISSIONS map
├── query-helpers.ts             # In-memory agent/agency cache (TTL 5 phút)
├── formatters.ts                # fmtVND, fmtUSD, fmtVndShort, fmtUsdShort
├── imageUtils.ts                # Client-side image compression (max 1500px, JPEG 0.8)
└── admin-context.tsx            # React Context cho admin portal (role, userId)
```

---

## Auth & Phân quyền

### Hai loại Supabase client

```
Browser (client components)
  └── lib/supabase.ts → createSupabaseClient() [anon key, theo RLS]

Server / API routes
  └── lib/auth-helpers.ts → getAdminClient() [service_role key, bypass RLS]
```

### Luồng xác thực

```
Request → middleware.ts (Edge Runtime)
  ├── Đọc JWT từ cookie (không round-trip DB)
  ├── Unauthenticated → redirect /
  └── Authenticated → tiếp tục

app/admin/layout.tsx (Server Component)
  └── Đọc agents.role từ DB
      ├── role != admin → redirect /
      └── role = admin → render admin shell
```

### 5 Roles (lib/permissions.ts)

| Role | Phạm vi |
|---|---|
| `admin` | Toàn quyền |
| `operator` | Admin portal, không xóa được |
| `read_only` | Chỉ xem admin portal |
| `agent` | Chủ đại lý: quản lý team + đơn hàng |
| `member` | Thành viên team: thêm ứng viên |

### Bảo vệ route thực tế

| Route | Middleware | Layout/Page | API guard |
|---|---|---|---|
| `/order/*` | ✅ session | — | — |
| `/admin/*` | ✅ session | ✅ role=admin | — |
| `/profile`, `/agency`, `/team` | ✅ session | — | — |
| `/api/passport`, `/api/ocr` | — | — | `getAuthenticatedUser` |
| `/api/agents/create` | — | — | `getAdminUser` |
| `/api/admin/*` | — | — | `getAdminUser` |
| `/api/share/[id]` | — | — | Public (không auth) |

---

## Database — Bảng thực tế

| Bảng | Dùng để làm gì |
|---|---|
| `users` | Hồ sơ agent/operator/admin (FK: `supabase_uid = auth.uid()`) |
| `agencies` | Công ty môi giới (1 agency → nhiều users) |
| `orders` | Đơn hàng tuyển dụng (FK: `company_id → companies`) |
| `order_agents` | Phân công agent cho đơn (`order_id, agent_id, assigned_labor_number`) |
| `candidates` | Ứng viên (PK: `id_ld = {ppNo}_{cleanName}`) |
| `companies` | Công ty sử dụng lao động |
| `recruitment_stats` | Stats tổng hợp của agent (view hoặc materialized) |
| `recruitment_requests` | Theo dõi tạo YCTD async (n8n) |
| `contract_requests` | Theo dõi tạo hợp đồng async (n8n) |
| `translation_requests` | Theo dõi dịch thuật async (n8n) |
| `finance_transactions` | Giao dịch thu chi |
| `finance_categories` | Danh mục tài chính |

---

## Storage Paths (agent-media bucket)

```
candidates/{order_id}/passport_*.jpg     # Ảnh hộ chiếu
{order_id}/{candidate_id}/*.{mp4,webm}   # Video ứng viên
agents/{agent_id}/avatar_*.{ext}         # Avatar agent
companies/{id}/img_*.jpg                 # Ảnh công ty
companies/{id}/docs/*                    # Tài liệu công ty
```

---

## Luồng dữ liệu chính

```
                    ┌──────────────────────────────┐
                    │         Browser               │
                    │  (Supabase client, anon key)  │
                    └──────────┬───────────────────┘
                               │ direct queries (RLS)
                    ┌──────────▼───────────────────┐
                    │      Supabase PostgreSQL      │◄──── API routes (service role)
                    │      + Storage bucket        │
                    └──────────┬───────────────────┘
                               │ row data
                    ┌──────────▼───────────────────┐
                    │     n8n Webhooks (async)      │
                    │  YCTD / Hợp đồng / Translate │
                    └──────────┬───────────────────┘
                               │
                    ┌──────────▼───────────────────┐
                    │       Lark Bitable            │
                    │  (external record keeping)   │
                    └──────────────────────────────┘
```

---

## API Routes

| Endpoint | Method | Auth | Mô tả |
|---|---|---|---|
| `/api/auth/register` | POST | Public | Đăng ký agent mới (tạo user + agency) |
| `/api/auth/forgot-password` | POST | Public | Gửi reset password email |
| `/api/agents/me` | GET | Bearer | Hồ sơ agent hiện tại + agency |
| `/api/agents/team` | GET/POST/PATCH | Bearer | Thành viên team |
| `/api/agents/create` | POST | Bearer (admin) | Admin tạo agent |
| `/api/candidates/[id]` | DELETE | Bearer | Xóa ứng viên (chặn nếu Passed) |
| `/api/admin/agents` | GET | Bearer (admin) | Danh sách agents |
| `/api/admin/agents/[id]` | GET/PATCH/DELETE | Bearer (admin) | Sửa/vô hiệu agent |
| `/api/admin/agencies` | GET/POST | Bearer (admin) | Danh sách / tạo đại lý |
| `/api/admin/agencies/[id]` | GET/PATCH/DELETE | Bearer (admin) | Sửa / vô hiệu đại lý |
| `/api/admin/orders/[id]` | PATCH | Bearer (admin) | Cập nhật đơn hàng |
| `/api/admin/order-agents` | POST/DELETE | Bearer (admin) | Phân công / gỡ agent |
| `/api/company/[id]` | GET | Bearer | Media công ty |
| `/api/orders/yctd` | POST/GET | Bearer (admin) | Tạo/kiểm tra YCTD (n8n) |
| `/api/orders/contract` | POST/GET | Bearer (admin) | Tạo/kiểm tra hợp đồng (n8n) |
| `/api/ocr` | POST | Bearer | OCR đăng ký kinh doanh → GPT → JSON |
| `/api/passport` | POST | Bearer | OCR hộ chiếu → GPT → upsert candidate |
| `/api/translate` | POST/GET | Bearer (admin) | Dịch trường dữ liệu (n8n) |
| `/api/share/[id]` | GET | Public | Dữ liệu đơn hàng cho link chia sẻ |

---

## Rủi ro & Điểm yếu thực tế

### Nghiêm trọng

| # | Vấn đề | File | Rủi ro |
|---|---|---|---|
| 1 | `PATCH /api/admin/orders/[id]` thiếu auth check | `app/api/admin/orders/[id]/route.ts` | Bất kỳ user có session đều có thể sửa đơn hàng |
| 2 | N8N webhook fire-and-forget, không retry | `api/passport`, `api/orders/yctd` | Lark không nhận data, không có thông báo lỗi |
| 3 | Race condition đăng ký (check-then-create) | `api/auth/register/route.ts` | Tạo user trùng, agency orphaned nếu insert thất bại |

### Trung bình

| # | Vấn đề | Ghi chú |
|---|---|---|
| 4 | Xóa ứng viên không kiểm tra agency ownership | Member có thể xóa ứng viên của team khác |
| 5 | `assigned_labor_number` không có upper bound | Có thể vượt `total_labor` của đơn hàng |
| 6 | Agency soft-delete không cascade users | Users vẫn giữ `agency_id` trỏ vào agency inactive |
| 7 | Storage path dùng `order_id` raw (có thể chứa ký tự đặc biệt) | Tiềm ẩn lỗi path encoding |

### Nhất quán

| Vấn đề | Ghi chú |
|---|---|
| Mixed lang error messages | Một số API trả lỗi tiếng Việt, một số tiếng Anh |
| Candidate ID generation khác nhau | `passport/route.ts` dùng `ppNo_cleanName`; `agents/create` dùng NFD normalization |
| Admin client creation không nhất quán | Một số route tạo trước khi auth check, một số sau |
