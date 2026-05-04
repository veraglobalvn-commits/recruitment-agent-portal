# Setup Telegram Bot Menu (BotFather)

> Mục đích: Khi user gõ `/` trong chat bot, Telegram tự hiện dropdown menu với danh sách lệnh có sẵn — user không phải nhớ.

## Chuẩn bị

- Tài khoản Telegram đang là **owner** của bot (người tạo bot ban đầu)
- Bot này: `@Bangladesh_Recruitment_Bot` (theo project-notes.md)

## Các bước (5 phút)

1. **Mở chat với `@BotFather`** trong Telegram (search tên đó nếu chưa add)

2. Gõ `/mybots` → BotFather list các bot → chọn `@Bangladesh_Recruitment_Bot`

3. Bấm **Edit Bot** → **Edit Commands**

4. BotFather sẽ hỏi gửi danh sách commands theo format `command - description` (mỗi dòng 1 lệnh, KHÔNG có `/` ở đầu). Paste nguyên khối sau:

   ```
   add - Start adding a new candidate
   cancel - Cancel current action and clear session
   reset - Same as cancel — clear session immediately
   help - Show command menu
   ```

5. BotFather reply `Success! Command list updated.` → done.

## Verify

- Mở chat với bot trong Telegram
- Gõ `/` → thấy dropdown 4 lệnh kèm mô tả
- Bấm 1 lệnh → tự fill vào input box

## Update khi thêm/xóa lệnh

Lặp lại các bước trên với danh sách mới. BotFather sẽ overwrite toàn bộ list cũ.

## Note

- Menu này là **client-side suggestion** của Telegram, không thay đổi cách bot xử lý lệnh. Workflow (`Code: State Engine` jsCode) vẫn handle lệnh y nguyên.
- Nếu user dùng client cũ không hỗ trợ menu, vẫn có thể gõ trực tiếp `/help` để xem list (đã implement ở Phase F).
- Setup này chỉ cần làm 1 lần. Nếu sau này thêm lệnh mới, phải update lại danh sách qua BotFather.
