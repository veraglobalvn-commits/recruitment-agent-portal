# Ghi chú lỗi thường gặp — Tránh lặp lại

## 0. Lỗi quy trình (NGHIÊM TRỌNG)

### Thực thi khi chưa được duyệt plan
**Hiện tượng:** Sau khi user góp ý plan, tự ý chạy DB migration, fix code, thêm RLS policy mà không chờ user xác nhận "OK, làm đi".

**Quy tắc bắt buộc:**
- Planning Mode: KHÔNG chạy bất kỳ lệnh thay đổi hệ thống nào trước khi user approve plan
- Bug fix NGHIÊM TRỌNG (data loss) có thể thực thi ngay nhưng **phải thông báo rõ** trước khi chạy
- DB migration = luôn cần duyệt, không có ngoại lệ

---

### Không ngoan cố với 1 hướng giải pháp khi liên tục thất bại
**Hiện tượng:** Cùng 1 approach (vd: tìm free AI model) bị lỗi 5+ lần liên tiếp → vẫn tiếp tục thử biến thể nhỏ thay vì dừng lại benchmark lại.

**Quy tắc:**
- Nếu 1 hướng thất bại **≥ 3 lần**, DỪNG và benchmark đa chiều các giải pháp thay thế
- Benchmark phải **số hoá** các tiêu chí, không chỉ định tính:

| Tiêu chí | Trọng số | Mô tả |
|----------|---------|-------|
| Chi phí/call | 30% | Tính ra USD rõ ràng |
| Độ chính xác | 30% | Rating cho use case cụ thể |
| Độ tin cậy | 20% | Uptime, rate limit, stability |
| Setup complexity | 10% | Số bước, dependency |
| Tốc độ (latency) | 10% | p50 latency ms |

- Chọn giải pháp có **tổng điểm cao nhất**, không phải cái "quen tay" nhất.
- Ghi rõ lý do loại bỏ từng giải pháp thay thế.

---



## 1. Lỗi kỹ thuật code

### `replace_file_content` tạo ra code trùng lặp
**Hiện tượng:** Khi dùng `TargetContent` là một dòng ngắn (vd: `if (loading) return ...;`), tool prepend nội dung mới TRƯỚC targetContent thay vì THAY THẾ nó. Kết quả: có 2 `return (` trong cùng một function.

**Cách tránh:**
- TargetContent phải đủ dài và đặc thù để match đúng 1 đoạn.
- Với render section lớn, dùng `StartLine/EndLine` bao toàn bộ đoạn cần thay.
- Sau khi edit lớn, luôn check `tail -10` file để xác nhận không có dangling code.

---

### Python `urllib.request` vs `curl` — auth khác nhau
**Hiện tượng:** `curl -H "Authorization: Bearer ..."` hoạt động nhưng `urllib.request.Request` với cùng header trả về 403 Forbidden khi gọi Supabase Management API.

**Nguyên nhân:** urllib có thể thêm hoặc thiếu header không mong muốn. curl đáng tin hơn với bearer token auth.

**Cách tránh:** Với Supabase Management API, dùng `subprocess.run(['curl', ...])` thay vì urllib trực tiếp.

---

### RLS circular dependency khi dùng subquery trong policy
**Hiện tượng:** Policy `CREATE POLICY ... USING (auth.uid() IN (SELECT supabase_uid FROM agents WHERE role = 'admin'))` trên bảng `agents` tự tham chiếu chính mình → vòng lặp vô hạn / không trả về kết quả đúng.

**Cách tránh:** Luôn dùng `SECURITY DEFINER` function để bypass RLS trong subquery:
```sql
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN
LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM agents WHERE supabase_uid = auth.uid() AND role = 'admin')
$$;
-- Sau đó dùng: USING (is_admin())
```

---

### multi_replace với TargetContent có ký tự đặc biệt
**Hiện tượng:** TargetContent chứa `&`, `→`, `—`, quotes Vietnamese → không match được do encoding.

**Cách tránh:** Dùng đoạn TargetContent ngắn, chọn phần không có ký tự đặc biệt. Hoặc dùng `grep_search` trước để xác nhận chính xác nội dung.

---

## 2. Lỗi tư duy / quy trình

### Không confirm yêu cầu ngôn ngữ trước khi build
**Hiện tượng:** Build admin UI bằng tiếng Anh, user sau đó đổi thành tiếng Việt → phải rewrite lại toàn bộ text.

**Cách tránh:** Với trang mới, hỏi trước: *"Giao diện tiếng Anh hay tiếng Việt?"* trước khi viết bất kỳ text nào.

---

### Translate data values khi không được yêu cầu
**Hiện tượng:** Tự ý translate "Đang tuyển" → "Recruiting" trong StatusPill mặc dù user chỉ nói UI labels bằng tiếng Anh.

**Nguyên tắc:** Data từ DB (status values, tên công ty, v.v.) → hiển thị nguyên bản. Chỉ translate UI chrome (labels, headings, buttons).

---

### Không phân biệt "UI text" vs "data value"
**Nguyên tắc rõ ràng:**
- **UI text** = hard-coded trong source code (labels, button text, placeholder, heading) → phải theo ngôn ngữ quy định
- **Data value** = đến từ API/database → hiển thị nguyên bản, không cần dịch

---

### Dùng `any` type khi map Supabase data
**Hiện tượng:** `agentsRaw.map((ag: any) => ...)` — vi phạm TypeScript strict mode.

**Cách tránh:** Định nghĩa interface type trước, hoặc dùng `as unknown as MyType[]` với cast rõ ràng.

---

### Luôn verify kết nối data trước khi triển khai
**Hiện tượng:** Code UI join bảng qua PostgREST (vd: `orders!orders_company_id_fkey`) nhưng FK không tồn tại → query fail, list rỗng. Hoặc insert field không có trong schema.

**Quy tắc bắt buộc:**
- Trước khi viết query join, **verify FK constraint tồn tại** trong DB: `SELECT constraint_name FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY'`
- Trước khi insert, **verify tất cả columns tồn tại**: `SELECT column_name FROM information_schema.columns WHERE table_name = '...'`
- Sau khi tạo FK hoặc thêm column bằng migration, **test trực tiếp bằng REST API curl** để confirm query hoạt động

---

### Kiểm tra logic trùng lặp dữ liệu
**Hiện tượng:** Thêm côngty trùng tên/MST không bị block → data rác.

**Quy tắc:** Với mọi form tạo mới, phải check trùng trước khi insert:
- Query DB trước: `SELECT id FROM companies WHERE company_name ILIKE '...' OR tax_code = '...'`
- Nếu trùng → hiện lỗi rõ ràng: "Công ty này đã tồn tại" + link đến công ty cũ

---

### Sắp xếp dữ liệu hiển thị hợp lý
**Quy tắc:**
- Danh sách mặc định sắp theo **mới nhất trước** (`created_at DESC`)
- Không để sắp theo alphabet khi mục đích chính là theo dõi hoạt động gần đây

---

### CRUD đầy đủ cho mọi dữ liệu
**Quy tắc:** Nếu không phải dữ liệu quá đặc biệt, phải có đầy đủ **Thêm / Sửa / Xoá**.

---

### Phân quyền xoá dữ liệu
**Quy tắc:**
- Dữ liệu có ràng buộc (companies, orders) → **chỉ admin mới xoá được**
- Agent có thể sửa/xoá dữ liệu **trực tiếp của họ thêm lên** nếu chưa có tương tác từ admin/operator
- Xoá = **xoá mềm** (`deleted_at` column), KHÔNG xoá cứng
- Khi xoá mềm: giữ nguyên text data, **xoá hết file/ảnh/video** khỏi Storage

---

## 3. Checklist trước khi push code mới

- [ ] `tsc --noEmit` ngay sau khi edit → 0 lỗi
- [ ] Kiểm tra `tail -20` file vừa edit để không có dangling code
- [ ] Responsive: test 375px (mobile) và 1280px (desktop) trong browser
- [ ] Ngôn ngữ: Tất cả hard-coded text phải nhất quán (VN hoặc EN tùy trang)
- [ ] Không có `any` type mới nào trong TypeScript strict
- [ ] Với Supabase DDL, dùng curl subprocess thay urllib Python
