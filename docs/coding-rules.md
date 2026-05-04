# Coding Rules — Toàn bộ quy tắc chi tiết

> Đây là nguồn đầy đủ cho các quy tắc. CLAUDE.md chỉ giữ bản rút gọn.

---

## Quy trình làm việc

- **Không chạy trước khi có kế hoạch được duyệt.** DB migrations luôn cần xác nhận của người dùng trước. Bug nghiêm trọng (mất dữ liệu) có thể fix ngay nhưng phải thông báo trước.
- **Không cố với cùng một cách ≥ 3 lần.** Nếu thử 3 lần vẫn lỗi → dừng lại, so sánh định lượng các hướng khác, chọn hướng điểm cao nhất.
- **DB-before-deploy:** Mọi feature thêm cột DB mới PHẢI cung cấp đủ 3 thứ trước khi commit:
  1. `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`
  2. `SELECT` để xác nhận cột đã tồn tại
  3. `NOTIFY pgrst, 'reload schema';`
  
  Tất cả chạy trong Supabase SQL Editor **trước** khi merge vào main. Không bao giờ commit code tham chiếu cột chưa có trong production DB.

- **Chẩn đoán lỗi schema cache:** Khi thấy `Could not find the 'X' column of 'Y' in the schema cache` trên production, nguyên nhân **luôn luôn** là: cột có trong code / `lib/types.ts` nhưng **chưa có trong DB**. Fix ngay: `ALTER TABLE Y ADD COLUMN IF NOT EXISTS X TEXT; NOTIFY pgrst, 'reload schema';` — không cần redeploy. Trước khi fix, grep thêm tất cả cột khác trong cùng batch (ví dụ `en_*`) để add hết một lần.

---

## Data Safety

- **Luồng dữ liệu chuẩn:** Web ⟺ Supabase là chính. Lark sync (nếu có): Supabase ⟺ N8N ⟺ Lark. Không bao giờ để Lark là nguồn gốc — Supabase phải nhận data trước Lark.
- **Verify trước khi viết:** Kiểm tra FK constraints và sự tồn tại của cột trong DB trước khi viết join query hoặc insert. Test bằng REST API curl sau migrations.
- **Duplicate check:** Mọi form tạo mới phải kiểm tra trùng trước khi insert (ví dụ: company name + tax_code).
- **Soft delete only:** Dùng cột `deleted_at`. Giữ text data, xóa file Storage (ảnh/tài liệu).
- **CRUD complete:** Mọi entity phải có đủ Create / Read / Update / Delete trừ khi có lý do cụ thể.

---

## Code Quality

- **DB code phải test end-to-end.** Sau khi code xong feature đọc/ghi DB, phải verify thực tế với database thật (query check, UI check, data flow) trước khi đánh dấu xong.
- **Chạy `npx tsc --noEmit`** ngay sau mỗi phiên sửa — phải 0 lỗi.
- **Kiểm tra code thừa** sau khi sửa lớn (đọc cuối file để xác nhận không có orphaned code).
- **UI text vs data value:** Label/button/tiêu đề cứng = theo language rule. Giá trị từ DB = hiển thị nguyên bản, không dịch.
- **Không định nghĩa component trong render:** Định nghĩa function component bên trong render body của component khác làm React remount mỗi lần re-render, phá vỡ focus input. Phải đưa ra module scope hoặc dùng JSX inline.
- **Responsive bắt buộc:** Trước khi code bất kỳ page/UI mới, đảm bảo design hoạt động ở mobile (375px) và desktop (1280px). Dùng mobile cards + desktop tables. Touch targets phải `min-h-[44px] min-w-[44px]`.
- **Không `console.log` trong production code.** Chỉ dùng `console.error` tại API route boundaries. Không bao giờ log PII (họ tên, số hộ chiếu, ngày sinh).

---

## API Security

- Mọi API route phải gọi `getAuthenticatedUser()` hoặc `getAdminUser()` từ `lib/auth-helpers.ts`.
- Ngoại lệ được phép không auth: `/api/auth/*` và `/api/share/[id]`.
- `SUPABASE_SERVICE_ROLE_KEY` — chỉ dùng phía server, không bao giờ expose ra client hoặc log ra.
- Không dùng unauthenticated Supabase client trong API routes.

---

## Lưu ý từ lỗi thực tế đã gặp

| Lỗi | Fix |
|---|---|
| Agent ID có space (ví dụ "GTA 2026") làm `.contains()` sai | Dùng `.filter('agent_ids', 'cs', '{"GTA 2026"}')` thay vì `.contains()` |
| `data \|\| []` không bắt lỗi Supabase | Luôn check `res.error` trước khi dùng `res.data` |
| Hai push liên tiếp, Vercel bỏ qua push sau | Chờ deploy xong mới push tiếp, hoặc dùng empty commit để trigger lại |
| Column mới trong code nhưng chưa có trong DB | Chạy ALTER TABLE + NOTIFY pgrst trước khi deploy |
