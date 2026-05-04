# UI Patterns & Conventions

---

## Component Pattern

- Tất cả components dùng `'use client'` directive
- State: raw React hooks (`useState`, `useEffect`, `useCallback`) — không dùng thư viện state management
- Fetch dữ liệu: gọi Supabase client trực tiếp trong `useCallback` + `useEffect`
- Không dùng form library, không dùng UI component library, không dùng `clsx` / `cn`
- Import dùng alias `@/` (ví dụ: `import { supabase } from '@/lib/supabase'`)
- **Không định nghĩa component con bên trong render của component cha** — gây remount mỗi lần render, làm mất focus input. Phải đưa ra module scope hoặc dùng JSX inline.

---

## Modal Pattern

```
fixed overlay div với backdrop-blur-sm
  └── mobile: items-end (bottom-sheet từ dưới lên)
  └── desktop: sm:items-center (giữa màn hình)
  
Bo góc: rounded-t-3xl sm:rounded-2xl
Drag handle: w-10 h-1 bg-gray-300 rounded-full (chỉ hiện trên mobile)
```

---

## Responsive Pattern

| Loại | Class | Mô tả |
|---|---|---|
| Mobile cards | `md:hidden` | Hiện trên mobile, ẩn trên desktop |
| Desktop table | `hidden md:block` | Ẩn trên mobile, hiện trên desktop |
| Touch targets | `min-h-[44px] min-w-[44px]` | Bắt buộc cho mọi button/link có thể nhấn |
| Sidebar mobile | Hamburger menu | Dùng drawer |
| Sidebar desktop | `hidden md:flex w-56` | Fixed, luôn hiện |

**Bắt buộc:** Test tất cả UI ở 375px (mobile) và 1280px (desktop) trước khi coi là xong.

---

## CRUD Pattern

```typescript
// Read — luôn lọc deleted_at, sắp xếp mới nhất trước
supabase
  .from('table')
  .select()
  .is('deleted_at', null)
  .order('created_at', { ascending: false })

// Create — kiểm tra trùng trước khi insert
// Update — auto-save debounce 1.5s (company detail) hoặc nút Save thủ công
// Delete — soft delete: deleted_at = new Date(), xóa file Storage, giữ text data
```

---

## Styling Tokens (Tailwind)

| Thành phần | Classes |
|---|---|
| Card | `bg-white rounded-2xl shadow-sm border border-gray-100` |
| Button primary | `bg-blue-600 hover:bg-blue-700 text-white rounded-xl` |
| Input | `border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400` |
| Status pill | `text-xs px-2 py-0.5 rounded-full font-medium` + màu semantic |
| Section header | `text-sm font-semibold text-slate-700` trong `px-4 py-3 border-b border-gray-50` |
| Loading | `animate-pulse` skeleton divs |

---

## Conventions

- **Ngôn ngữ UI:** Text cứng (nhãn, nút, tiêu đề) → tiếng **Việt**. Giá trị từ DB → hiển thị nguyên bản, không dịch.
- **Sort order:** Danh sách mặc định mới nhất trước (`created_at DESC`)
- **UX tối giản:** Ưu tiên ít tap/click nhất. Tránh wizard nhiều bước.
- **Admin-only delete:** Xóa company/order chỉ role admin mới được làm.
- **Tailwind only:** Không viết custom CSS ngoài `globals.css`.
- Proactively đề xuất cải tiến UX nếu phát hiện flow không tối ưu.
