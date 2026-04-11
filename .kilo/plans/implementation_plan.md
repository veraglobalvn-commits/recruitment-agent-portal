# Module Công ty VN — Plan FINAL

## Bug đã fix (agent portal)
- ✅ **Thêm `UPDATE` policy** vào bảng `candidates` cho agent — fix lỗi F5 mất ảnh/video
- ✅ **Error handling** trong `CandidateCard.uploadFile` và `handleStatusChange` — lỗi Supabase giờ hiện ra thay vì im lặng
- ✅ **n8n sync** đổi sang fire-and-forget (không block UI khi n8n chậm)

---

## Schema đã cập nhật — bảng `companies`

Các cột mới đã chạy migration:

| Cột | Kiểu | Mục đích |
|-----|------|---------|
| `company_media` | JSONB `[]` | Array URL ảnh cơ sở vật chất |
| `avatar_url` | TEXT | Ảnh đại diện (null = lấy ảnh đầu trong media) |
| `video_url` | TEXT | Link YouTube/GDrive video cơ sở (không upload trực tiếp) |
| `doc_links` | JSONB `[]` | Array `{name, url, type}` link tài liệu |

> [!IMPORTANT]
> **Nén trước khi upload — bắt buộc với MỌI ảnh:**  
> Client-side compress bằng Canvas API: resize về max 1500px, JPEG quality 0.8 → ~300–600KB.  
> Áp dụng cho: ảnh cơ sở vật chất, ảnh ĐKKD (trước khi gửi OCR), avatar công ty.  
> Video không upload trực tiếp — dùng link YouTube/GDrive.

---

## Quyết định thiết kế (đã chốt)

| Vấn đề | Quyết định |
|--------|-----------|
| Cột tiếng Anh | Ẩn khỏi form; auto-dịch on-demand khi in tài liệu |
| Video | Nhập link YouTube/GDrive (không upload — tránh hết quota) |
| Ảnh cơ sở | Upload Supabase Storage, compress client-side trước |
| Avatar | Ảnh đầu tiên trong media array, hoặc chọn thủ công |
| Tài liệu công ty | Upload file → Supabase Storage + có thể paste link GDrive |
| "Actions" column | Xóa — cả hàng/card là link clickable, gọn hơn |
| Thêm đơn từ công ty | Nút "+ Thêm đơn hàng" ngay trong section đơn trên trang detail |
| Media section vị trí | Cuối trang, sau phần thông tin chính |
| n8n sync Lark | **Bỏ qua** — chưa có webhook; Supabase only |

---

## Route structure

```
/admin/companies           ← Danh sách + search + thêm mới
/admin/companies/[id]      ← Chi tiết + sửa + media + đơn hàng + thanh toán
```

---

## [NEW] `app/admin/companies/page.tsx`

**Mobile:** Card list — Avatar | Tên | MST | Badge "N đơn active"  
**Desktop:** Table — Avatar | Tên công ty | MST | Người ĐD | Đơn active | Doanh thu

**UX:**
- Search live theo tên hoặc MST
- Toàn bộ card/row clickable → `/admin/companies/[id]`
- FAB hoặc nút header **+ Thêm công ty** → modal

---

## [NEW] `app/admin/companies/[id]/page.tsx`

**Sticky top bar:** `[←]  Tên công ty  [Lưu *]`  
(`*` = badge dirty khi có thay đổi chưa save)

**Các section (cuộn dọc):**

```
1. THÔNG TIN CƠ BẢN
   Tên | MST | Người ĐD | Chức vụ | Địa chỉ | SĐT | Email | Ngành | Cơ quan cấp | Ngày cấp

2. ĐƠN TUYỂN DỤNG  [+ Thêm đơn]
   Mỗi đơn: Mã | Vị trí | Tiến độ bar | Trạng thái
   
3. THANH TOÁN
   Tổng: XXX | Đã thu: XXX | Còn lại: XXX
   Table breakdown theo từng đơn

4. CƠ SỞ VẬT CHẤT & TÀI LIỆU
   Ảnh: [Avatar] [img] [img] [+ Thêm ảnh]
   Video: [________________ link]  
   Tài liệu: [📄 ĐKKD] [📄 Hợp đồng] [+ Upload / Paste link]
```

**Thêm đơn hàng:**  
Nút `+ Thêm đơn` mở modal nhanh với form: Vị trí | Số LĐ | Lương | Agent phụ trách  
→ Save → xuất hiện ngay trong list đơn của công ty

---

## [NEW] Modal — Thêm công ty mới

**2 tab: Nhập thủ công | Scan ĐKKD**

**Tab Nhập thủ công:** Form một màn, các trường quan trọng nhất:
- Tên công ty *(required)*
- MST | Người ĐD + Chức vụ
- Địa chỉ | SĐT | Email
→ `[Lưu & thêm đơn ngay]` hoặc `[Chỉ lưu]`

**Tab Scan ĐKKD:**
```
[📷 Chụp / Chọn ảnh]
  ↓ compress (canvas 1500px JPEG 0.8 → ~400KB)
  ↓ POST /api/ocr (server-only, ẩn API key)  
  ↓ ocr.space engine=2 language=vie
  ↓ regex → pre-fill form
Admin review + sửa → [Xác nhận & Lưu]
```

---

## [NEW] `app/api/ocr/route.ts`

```ts
// POST { imageBase64: string }
// → ocr.space (engine=2, language=vie)
// → regex extract: taxCode, companyName, legalRep, address
// → return { parsed, rawText }
// API key: process.env.OCR_SPACE_API_KEY = "K85129140788957"
```

---

## Tài liệu công ty — hướng xử lý

**Upload file (PDF, DOCX, ảnh):**  
→ Supabase Storage bucket `company-docs/{company_id}/`  
→ Lưu `{name, url, type, uploaded_at}` vào `doc_links` JSONB

**Paste link Google Drive:**  
→ Text input, lưu trực tiếp vào `doc_links`  
→ Hiển thị link clickable, có thể embed preview (`drive.google.com/file/d/ID/preview`) trong iframe

**UX:** Không cần phân biệt 2 loại — cùng 1 danh sách tài liệu, mỗi item có icon loại.

---

## Files cần tạo

| File | Ghi chú |
|------|---------|
| `app/admin/companies/page.tsx` | List |
| `app/admin/companies/[id]/page.tsx` | Detail + edit |
| `app/api/ocr/route.ts` | OCR server handler |
| `components/admin/CompanyFormModal.tsx` | Add modal |
| `components/admin/QuickAddOrderModal.tsx` | Thêm đơn nhanh từ trang công ty |

---

## Env cần thêm vào `.env.local`

```env
OCR_SPACE_API_KEY=K85129140788957
```

---

## Verification
1. Danh sách load, search lọc đúng
2. Thêm thủ công → xuất hiện ngay
3. Scan OCR → pre-fill ít nhất MST + Tên
4. Sửa thông tin → lưu đúng → reload không mất
5. Upload ảnh → hiển thị gallery → avatar = ảnh đầu
6. Video link → clickable  
7. Upload tài liệu → xuất hiện trong list
8. Đơn hàng section → đúng theo công ty + tiến độ đúng
9. Thanh toán → tổng + breakdown đúng
10. Mobile: tất cả section cuộn được, modal là bottom sheet
