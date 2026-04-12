# Agent Portal — Development Guide

> **Onboarding for AI:** Read this file + `lib/types.ts` to understand the full project. Only read individual page/component files when you need to edit them.

---

## Tech Stack
- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript (strict)
- **Styling:** Tailwind CSS 3.4
- **Auth:** Supabase Auth (`@supabase/ssr`)
- **Database:** Supabase PostgreSQL (primary read/write)
- **Storage:** Supabase Storage (`agent-media` bucket)
- **OCR:** OCR.space + OpenAI GPT-4o-mini (for business license scanning)
- **Charts:** Recharts (available but not heavily used yet)

---

## Commands
```bash
npm run dev       # Dev server on :3000
npm run build     # Production build
npm run lint      # ESLint (next/core-web-vitals)
npx tsc --noEmit  # TypeScript type check (always run after edits)
```

---

## Module Status

| Module | Route | Status | Description |
|--------|-------|--------|-------------|
| Agent Login & Dashboard | `/` | ✅ Done | Agent login, stats, orders list, candidate management |
| Order Detail | `/order/[id]` | ✅ Done | Protected by middleware, shows candidates per order |
| Admin Layout & Sidebar | `/admin/*` | ✅ Done | Sidebar nav (6 items), mobile drawer, admin auth guard |
| Admin Dashboard | `/admin` | ✅ Done | KPI cards, orders table, agent activity, quick-add FAB |
| Companies (VN) | `/admin/companies` | ✅ Done | List + search + mobile cards + desktop table |
| Company Detail | `/admin/companies/[id]` | ✅ Done | Edit form (auto-save), orders, payment, media, docs, soft delete |
| Add Company Modal | — | ✅ Done | 2-tab (manual + OCR scan), duplicate check |
| OCR API | `/api/ocr` | ✅ Done | OCR.space → GPT-4o-mini structured extraction |
| Passport Upload API | `/api/passport` | ✅ Done | OCR.space → GPT-4o-mini → Supabase DB → Storage → n8n/Lark |
| Orders Admin | `/admin/orders/[id]` | ✅ Done | Order list, detail, edit, candidates, payment |
| Candidates Admin | `/admin/candidates` | ✅ Done | List all candidates with filters, edit, delete |
| Agents Admin | `/admin/agents/[id]` | ✅ Done | Edit agent info, role, and labor percentage |
| Reports | `/admin/reports` | ❌ Not built | Nav item exists, page doesn't |

---

## File Map

```
app/
  layout.tsx                          # Root layout (server component, minimal)
  globals.css                         # Tailwind imports + body bg/font
  page.tsx                            # Agent portal: login → dashboard → orders
  error.tsx                           # Global error boundary
  order/[id]/page.tsx                 # Agent order detail + candidate cards
  admin/
    layout.tsx                        # Admin shell: sidebar + mobile drawer + auth guard
    page.tsx                          # Admin dashboard: KPIs, orders, agents, FAB
    companies/
      page.tsx                        # Company list: search, mobile cards, desktop table
      [id]/page.tsx                   # Company detail: info form, orders, payment, media, docs
    orders/
      page.tsx                        # Order list: search, filter, mobile cards, desktop table
      [id]/page.tsx                   # Order detail: edit info, agent, payment, docs, candidates
  api/
    ocr/route.ts                      # POST: base64 → OCR.space → GPT-4o-mini → parsed fields
    passport/route.ts                 # POST: base64 → OCR.space → GPT-4o-mini → Supabase DB → Storage → n8n/Lark

components/
  LoginForm.tsx                       # Agent login form (email + password)
  DashboardStats.tsx                  # Agent dashboard stat cards
  PaymentChart.tsx                    # Payment pie chart (Recharts)
  OrdersList.tsx                      # Agent orders list
  CandidateCard.tsx                   # Single candidate with upload/actions
  LoadingSkeleton.tsx                 # Animated pulse placeholders
  admin/
    CompanyFormModal.tsx              # Add company modal (manual + OCR scan tabs)
    AddOrderModal.tsx                 # Add order modal (company selector + form)
    ConfirmDeleteModal.tsx            # Confirm delete by typing "xoá"

lib/
  types.ts                            # All TypeScript interfaces (single source of truth)
  supabase.ts                         # Browser Supabase client singleton
  imageUtils.ts                       # compressImage, compressToBase64, fmtFileSize

middleware.ts                         # Auth guard: protects /order/* routes only
n8n/                                  # n8n workflow JSON files (sanitized, no secrets)
```

---

## Data Architecture

### Supabase Tables

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `agents` | `id, supabase_uid, role(admin/agent), full_name, short_name, avatar_url, labor_percentage` | Auth mapped via `supabase_uid = auth.uid()`. `labor_percentage` for multi-agent orders (0-100, manually set by admin) |
| `companies` | `id, company_name, short_name, tax_code, legal_rep, legal_rep_title, address, phone, email, industry, business_reg_authority, business_reg_date, company_media(JSONB[]), avatar_url, video_url, doc_links(JSONB[]), deleted_at, en_company_name, en_legal_rep, en_address, en_title` | Soft delete via `deleted_at` |
| `orders` | `id(ORD-xxx), company_id(FK→companies), company_name, job_type, job_type_en, total_labor, labor_missing, status, total_fee_vn, payment_status_vn, service_fee_per_person, agent_id, url_demand_letter, salary_usd, url_order, legal_status, meal, dormitory, recruitment_info` | FK: `orders_company_id_fkey` |
| `candidates` | `id_ld, order_id, agent_id, full_name, pp_no, dob, pp_doi, pp_doe, pob, address, phone, visa_status, passport_link, video_link, photo_link, height_ft, weight_kg, pcc_link, health_cert_link, interview_status` | Agent can UPDATE own candidates. Delete only when no files + no pass/fail. |

### Supabase Storage
- **Bucket:** `agent-media`
- **Paths:** `companies/{id}/img_*.jpg`, `companies/{id}/docs/*`, `candidates/{id_ld}/*`
- All images compressed client-side before upload (max 1500px, JPEG 0.8)

### Auth Flow
- **Agent:** Login → `supabase.auth.signInWithPassword` → session check → dashboard
- **Admin:** Same login → check `agents.role = 'admin'` via `supabase_uid` → redirect if not admin
- **Middleware:** Only guards `/order/*` routes. Admin routes guarded client-side in `app/admin/layout.tsx`

---

## Key Patterns (follow these)

### Component Pattern
- All components use `'use client'` directive
- State: raw React hooks (`useState`, `useEffect`, `useCallback`) — no state library
- Data fetching: direct Supabase client calls in `useCallback` + `useEffect`
- Modals: fixed overlay divs with `backdrop-blur-sm`, mobile bottom-sheet (`items-end sm:items-center`, `rounded-t-3xl sm:rounded-2xl`, drag handle `w-10 h-1 bg-gray-300 rounded-full`)
- Loading: `animate-pulse` skeleton divs
- No form library, no UI component library, no `clsx`/`cn` utility

### CRUD Pattern
- **Create:** Duplicate check before insert (name + tax_code for companies)
- **Read:** `supabase.from('table').select().is('deleted_at', null).order('created_at', { ascending: false })`
- **Update:** Auto-save with debounce (1.5s) on company detail; manual save button elsewhere
- **Delete:** Soft delete only (`deleted_at = new Date()`), remove Storage files, keep text data

### Responsive Pattern
- Mobile: card layouts (`md:hidden`)
- Desktop: tables (`hidden md:block`)
- Touch targets: `min-h-[44px] min-w-[44px]`
- Sidebar: hamburger on mobile, fixed on desktop (`hidden md:flex w-56`)

### Styling Tokens
- Cards: `bg-white rounded-2xl shadow-sm border border-gray-100`
- Buttons primary: `bg-blue-600 hover:bg-blue-700 text-white rounded-xl`
- Inputs: `border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400`
- Status pills: `text-xs px-2 py-0.5 rounded-full font-medium` with semantic colors
- Section headers: `text-sm font-semibold text-slate-700` in `px-4 py-3 border-b border-gray-50`

---

## Conventions
- Use `@/` path alias for imports
- TypeScript strict mode — no `any` types in new code (existing `any` casts are acceptable)
- Tailwind utility classes only — no custom CSS except `globals.css`
- **Responsive design is mandatory** — test at 375px and 1280px
- **Language rule:** Admin UI text is in **Vietnamese**. Data values from DB display as-is.
- **UX advisory:** Proactively advise on UI/UX. Push back on suboptimal flows.
- **Minimal-flow UX:** Prefer fewest taps/clicks. Avoid multi-step wizards.
- **Sort order:** Lists default to newest first (`created_at DESC`)
- **Admin-only delete:** Companies/orders can only be deleted by admin role

---

## Rules (from past mistakes — must follow)

### Process
- **Don't execute before plan is approved.** DB migrations always need user confirmation first. Critical bug fixes (data loss) can run immediately but must notify first.
- **Don't persist with failing approach ≥3 times.** Stop, benchmark alternatives quantitatively, pick highest scoring solution.

### Data Safety
- **Data flow principle:** Web <=> Supabase is the default. Lark sync (if any): Supabase <=> N8N <=> Lark. Never let Lark be the primary data source — Supabase must always receive data before Lark.
- **Verify before writing:** Check FK constraints and column existence in DB before writing join queries or inserts. Test with REST API curl after migrations.
- **Duplicate check:** Every create form must check for duplicates before insert (e.g., company name + tax_code).
- **Soft delete only:** Use `deleted_at` column. Keep text data, remove Storage files (images/docs).
- **CRUD complete:** All data entities must have Create / Read / Update / Delete unless there's a specific reason not to.

### Code Quality
- **DB-related code must be tested end-to-end.** After coding any feature that reads/writes to DB, verify it actually works against the real database (query check, UI check, data flow) before marking done.
- **Run `npx tsc --noEmit`** immediately after every edit session — must be 0 errors.
- **Check for dangling code** after large edits (read end of file to confirm no orphaned code).
- **UI text vs data value:** Hard-coded labels/buttons/headings = follow language rule. DB values (status, names) = display as-is, never translate.
- **Never define components inside render:** Defining a component (function) inside another component's render body causes React to remount it on every re-render, breaking input focus. Move to module scope or use inline JSX instead.
- **Responsive is mandatory for all UI work:** Before coding any new page or UI-related task, ensure the design works on mobile (375px) and desktop (1280px). Use mobile cards + desktop tables pattern. Touch targets must be `min-h-[44px] min-w-[44px]`.

---

## Environment Variables
See `.env.example`. Key vars:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key for server-side API routes (bypass RLS)
- `OCR_SPACE_API_KEY` — OCR.space API
- `OPENAI_API_KEY` — GPT-4o-mini for OCR field extraction

---

## Recent Changes (2026-04)

### Agent Portal Updates
- **Hidden fields for agents:** Order status, job file, PaymentChart, and visa status are now hidden from agent view
- **Job Type display:** Uses `job_type_en` (English) instead of `job_type` for better readability
- **Pass/Fail status:** Display-only for agents (badge), admin still has action buttons
- **Passport upload:** New `/api/passport` route handles OCR (OCR.space) → AI parse (GPT-4o-mini) → Supabase DB → Storage → n8n/Lark sync
- **Candidate editing:** Agents can edit passport info fields (name, PP No, DOB, dates, POB, address, phone)
- **Candidate deletion:** Agents can delete candidates only when no files uploaded + no pass/fail status
- **Auto-save measurements:** Height/weight auto-save with 1.5s debounce, no manual save button
- **Empty field highlighting:** All empty fields display in red to indicate missing data
- **PCC & Health Cert split:** Separated into two distinct upload buttons with consistent color coding (red=missing, green=uploaded, yellow=uploading)
- **Video upload fix:** Fixed spinning button issue when user cancels file dialog
- **Agent avatar upload:** Agents can now upload their own avatar from the dashboard header
- **Recruitment efficiency:** Added progress bar showing hired candidates vs total labor on order detail page
- **Order detail enhancements:** Added Meal, Dormitory, and Recruitment Info fields to order detail page
- **Multi-agent labor division:** Added per-agent progress bars for orders with 2+ agents. Admin can set labor_percentage (0-100) for each agent. Progress calculated as passed candidates / allocated labor. Shows error if percentages don't sum to 100% or if any agent has null percentage.

### Database Schema Changes Required
- **orders table:** Add column `job_type_en` (text, nullable) for English job type display
- **candidates table:**
  - Rename column `pcc_health_cert_link` → `pcc_link`
  - Add column `health_cert_link` (text, nullable)
- **agents table:** Add column `avatar_url` (text, nullable) for agent avatar
- **agents table:** Add column `labor_percentage` (integer, nullable) for multi-agent labor division
- **orders table:** Add columns `meal` (text, nullable), `dormitory` (text, nullable), `recruitment_info` (text, nullable)
