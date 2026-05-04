# Auth & Data Architecture — Chi tiết

---

## Auth Pattern

### Browser (client components)
- Dùng `lib/supabase.ts` → `createSupabaseClient()` với **anon key**
- Gọi Supabase trực tiếp từ `useCallback` / `useEffect`
- Giới hạn bởi RLS (Row Level Security) của Supabase

### Server / API Routes
- Dùng `lib/auth-helpers.ts` → `getAdminClient()` với **service role key** (bypass RLS)
- `getAuthenticatedUser(req)` — xác minh Bearer token, trả về user hoặc 401
- `getAdminUser(req)` — như trên, thêm kiểm tra `role === 'admin'`, trả 403 nếu không phải admin
- **Mọi API route phải dùng một trong hai hàm này** — không có endpoint không xác thực

### Middleware (Edge Runtime)
- `middleware.ts` dùng `@supabase/ssr` + cookie để verify session
- Không round-trip DB — chỉ đọc JWT từ cookie
- Không kiểm tra role — role check do `app/admin/layout.tsx` đảm nhiệm (cần DB query)
- Unauthenticated → redirect về `/`

### Route Protection
| Route | Middleware | Layout/Page | API guard |
|---|---|---|---|
| `/order/*` | ✅ session | — | — |
| `/admin/*` | ✅ session | ✅ role=admin | — |
| `/profile`, `/agency`, `/team` | ✅ session | — | — |
| `/api/passport`, `/api/ocr` | — | — | `getAuthenticatedUser` |
| `/api/agents/create` | — | — | `getAdminUser` |
| `/api/admin/*` | — | — | `getAdminUser` |
| `/api/share/[id]` | — | — | **Public** (không cần auth) |
| `/api/auth/*` | — | — | **Public** |

---

## Supabase Tables

| Bảng | Cột quan trọng | Ghi chú |
|---|---|---|
| `users` | `id, supabase_uid, role, full_name, short_name, avatar_url, agency_id, status, permissions` | FK: `supabase_uid = auth.uid()`. 5 roles: admin / operator / read_only / agent / member |
| `agencies` | `id, company_name, license_no, doc_links, labor_percentage, status` | 1 agency → nhiều users |
| `orders` | `id(ORD-xxx), company_id, company_name, job_type, total_labor, labor_missing, status, agent_ids[], salary_usd, url_order, agent_order_status` | FK: `company_id → companies` |
| `order_agents` | `order_id, agent_id, assigned_labor_number, assigned_date` | Phân công agent cho đơn |
| `candidates` | `id_ld (PK = ppNo_cleanName), order_id, agent_id, full_name, pp_no, dob, visa_status, passport_link, video_link, interview_status` | Agent UPDATE được ứng viên của mình. Xóa chỉ khi không có file + chưa pass/fail |
| `companies` | `id, company_name, tax_code, legal_rep, address, company_media(JSONB[]), deleted_at, en_company_name` | Soft delete qua `deleted_at` |
| `recruitment_stats` | `agent_id, tong_lao_dong, trung_tuyen, con_thieu, tong_tien_*` | Stats tổng hợp agent |
| `recruitment_requests` | `id, order_id, status, pdf_url` | Theo dõi tạo YCTD async |
| `contract_requests` | `id, order_id, contract_type, status, pdf_url` | Theo dõi tạo hợp đồng async |
| `translation_requests` | `id, entity_type, entity_id, fields_to_translate[], status, translated_data` | Dịch thuật async |
| `finance_transactions` | `type, amount, category_id, description, date, user_id` | Thu chi |
| `finance_categories` | `id, name, type` | Danh mục tài chính |

---

## Supabase Storage

**Bucket:** `agent-media`

| Path | Nội dung |
|---|---|
| `candidates/{order_id}/passport_*.jpg` | Ảnh hộ chiếu ứng viên |
| `{order_id}/{candidate_id}/*.{mp4,webm,mov}` | Video ứng viên |
| `agents/{agent_id}/avatar_*.{ext}` | Avatar nhân viên |
| `companies/{id}/img_*.jpg` | Ảnh công ty |
| `companies/{id}/docs/*` | Tài liệu công ty |

**Lưu ý:** Tất cả ảnh được compress client-side trước khi upload (max 1500px, JPEG quality 0.8).

---

## Environment Variables

Xem file `.env.example` để biết đầy đủ. Các biến quan trọng:

| Biến | Dùng ở đâu | Phạm vi |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Mọi nơi | Browser + Server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser client | Browser (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | API routes | **Server-only — không bao giờ để lộ ra client** |
| `OCR_SPACE_API_KEY` | `/api/ocr`, `/api/passport` | Server |
| `OPENAI_API_KEY` | `/api/ocr`, `/api/passport` | Server |
| `NEXT_PUBLIC_N8N_UPLOAD_URL` | `/api/passport` | Server (gọi webhook Lark sync) |
| `NEXT_PUBLIC_N8N_VIDEO_UPDATE_URL` | Order page | Server (gọi webhook Lark video) |
