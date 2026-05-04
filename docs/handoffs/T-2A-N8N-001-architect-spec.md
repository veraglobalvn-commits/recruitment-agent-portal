# Architect Spec — T-2A-N8N-001 v2 (Telegram Candidate Wizard Revision)

> **Author:** tech-lead-architect
> **Source handoff:** `docs/handoffs/T-2A-N8N-001-handoff.md`
> **Workflow file:** `n8n-workflows/T-2A-N8N-001-candidate-wizard.json` (1489 dòng, 36 nodes)
> **Backend:** `app/api/telegram/candidate/route.ts` (4 actions: list_orders, create_passport, finalize, delete_candidate)
> **Mục tiêu:** Cung cấp blueprint chi tiết để Builder code lên ≥ 80% confidence, không phải đoán mò.

> **Lưu ý phạm vi:** Chỉ sửa file workflow JSON. KHÔNG sửa Next.js backend, KHÔNG migration DB, KHÔNG đụng schema `bot_sessions` (jsonb `draft` đủ linh hoạt).

---

## Phần 1 — State diagram v2 đầy đủ

Liệt kê toàn bộ states v2 với transitions. Nguồn các state v1 đã trích từ `Code: State Engine` switch (xem <ref_snippet file="n8n-workflows/T-2A-N8N-001-candidate-wizard.json" lines="76-270" />).

| # | State | Trigger vào | Trigger ra | State đích | Ghi chú |
|---|---|---|---|---|---|
| 0 | (no row) → `IDLE` | Mặc định khi chưa có session row | text `/add` | `WAITING_ORDER_SELECTION` (ngầm — qua action_type=`list_orders`) | Bất kỳ text khác → bot nhắc "Type /add to start" |
| 1 | `WAITING_ORDER_SELECTION` | Sau khi `Code: Handle List Orders` upsert session với current_step này | callback_data `order_<uuid>` | `WAITING_PASSPORT_UPLOAD` | Text khác → "Please select an order…" |
| 2 | `WAITING_PASSPORT_UPLOAD` | Từ `WAITING_ORDER_SELECTION` (Yes order) hoặc từ `WAITING_PASSPORT_CONFIRM` (No retry) | photo message | `WAITING_PASSPORT_CONFIRM` (qua action `passport` → `Code: Handle Passport Resp`) | Non-photo → "Please send a photo of the passport" |
| 3 | `WAITING_PASSPORT_CONFIRM` | Sau `Code: Handle Passport Resp` upsert | `passport_confirm_yes` | **`WAITING_CONSENT_CHECKLIST`** ⭐ NEW | Thay vì state `Q1` cũ |
| 3a | (cùng state) | | `passport_confirm_no` | `WAITING_PASSPORT_UPLOAD` | Reset draft, giữ order_id |
| 4 | **`WAITING_CONSENT_CHECKLIST`** ⭐ | Từ `passport_confirm_yes` | callback_data `consent_toggle:qN` (N ∈ {1,2,3,4,5,7}) | (cùng state — chỉ edit reply markup) | Mỗi click flip 1 flag |
| 4a | (cùng state) | | Sau khi flip → tất cả 6 flags = true | `WAITING_HEIGHT` | Bot gửi message "All confirmed! Height (e.g. 5.5):" |
| 5 | `WAITING_HEIGHT` | Từ checklist all-done | message text parse float > 0 | `WAITING_WEIGHT` | Invalid → "Invalid input. Please enter a number…" |
| 6 | `WAITING_WEIGHT` | Từ height OK | message text parse float > 0 | `WAITING_AVATAR_UPLOAD` | Invalid → nhắc lại |
| 7 | `WAITING_AVATAR_UPLOAD` | Từ weight OK | photo message | `WAITING_VIDEO_UPLOAD` (qua action `avatar` → `Code: Build Avatar URL`) | Non-photo → nhắc lại |
| 8 | `WAITING_VIDEO_UPLOAD` | Sau `HTTP: Upsert Session 6` | video/document video message | (END — finalize → web link) | Non-video → "Please send a video file." |
| 9 | (any state) | | text `/cancel` | (END — delete session) | `need_delete=true` nếu `candidate_id` đã có |

**Flow biểu đồ:**

```
IDLE ── /add ──► WAITING_ORDER_SELECTION ── pick order ──► WAITING_PASSPORT_UPLOAD
                                                                     │
                                                                  photo
                                                                     ▼
                                                      WAITING_PASSPORT_CONFIRM
                                                       Yes ─► WAITING_CONSENT_CHECKLIST ⭐
                                                       No  ─► WAITING_PASSPORT_UPLOAD
                                                                     │
                                                                  6 toggles ✅
                                                                     ▼
                                                              WAITING_HEIGHT
                                                                     ▼
                                                              WAITING_WEIGHT
                                                                     ▼
                                                          WAITING_AVATAR_UPLOAD
                                                                     ▼
                                                          WAITING_VIDEO_UPLOAD
                                                                     ▼
                                                              finalize → web link → END

(any state) ── /cancel ──► delete session → END
```

**States BỊ XÓA khỏi v2:** `Q1`, `Q2`, `Q3`, `Q4`, `Q5`, `Q6`, `WAITING_Q6_TEXT`, `Q7` (8 states).
**State MỚI thêm:** `WAITING_CONSENT_CHECKLIST` (1 state).
**States GIỮ NGUYÊN:** `IDLE`, `WAITING_ORDER_SELECTION`, `WAITING_PASSPORT_UPLOAD`, `WAITING_PASSPORT_CONFIRM`, `WAITING_HEIGHT`, `WAITING_WEIGHT`, `WAITING_AVATAR_UPLOAD`, `WAITING_VIDEO_UPLOAD`.

---

## Phần 2 — Diff Switch case trong `Code: State Engine`

Ref jsCode hiện tại: <ref_snippet file="n8n-workflows/T-2A-N8N-001-candidate-wizard.json" lines="84-270" />.

### Cases cần REMOVE

- `case 'Q1':` — thay bằng checklist (logic q1 chuyển vào toggle).
- `case 'Q2':` — thay bằng checklist.
- `case 'Q3':` — thay bằng checklist.
- `case 'Q4':` — thay bằng checklist.
- `case 'Q5':` — thay bằng checklist.
- `case 'Q6':` — UX bỏ phần "has questions" → default `false` / `'None'` ở finalize.
- `case 'WAITING_Q6_TEXT':` — bỏ luôn vì không hỏi nữa.
- `case 'Q7':` — thay bằng checklist (mapping `q7_confirms_penalty`).

### Cases cần KEEP nhưng SỬA

- `case 'WAITING_PASSPORT_CONFIRM':`
  - Khi `callback_data === 'passport_confirm_yes'`:
    - `out.new_state` đổi từ `'Q1'` → `'WAITING_CONSENT_CHECKLIST'`.
    - `out.new_data` khởi tạo thêm: `consent_flags: { q1:false, q2:false, q3:false, q4:false, q5:false, q7:false }` (giữ lại order_id, candidate_id, full_name, job_type_en, company_name_en).
    - `out.action_type` đổi từ `'session_and_message'` → **`'send_checklist'`** (route mới — vì cần lấy `message_id` từ Telegram response và upsert lại sau).
    - `out.telegram_message` đổi sang text checklist (xem mô tả entry message ở Phần 4).
    - `out.telegram_reply_markup` set inline_keyboard 3 hàng × 2 nút (state ban đầu toàn `☐`).
  - Khi `callback_data === 'passport_confirm_no'`: GIỮ NGUYÊN.
- `case 'WAITING_HEIGHT':`, `case 'WAITING_WEIGHT':`, `case 'WAITING_AVATAR_UPLOAD':`, `case 'WAITING_VIDEO_UPLOAD':` — GIỮ NGUYÊN logic, không đụng.

### Cases cần ADD

- `case 'WAITING_CONSENT_CHECKLIST':` — pseudo-code chi tiết ở Phần 4.

### Helper function cần ADD trong State Engine

- `buildConsentKeyboard(flags)`: nhận object `{q1,q2,q3,q4,q5,q7}` → trả về `{ inline_keyboard: [[...], [...], [...]] }` 3 hàng × 2 nút. Icon `☐` nếu false, `✅` nếu true. Format text: `"☐ Job Description"` / `"✅ Salary"`, callback_data: `consent_toggle:qN`.
- `allChecklistDone(flags)`: trả về `true` nếu tất cả 6 keys đều `=== true`.

### Tip giữ tương thích

- Đặt 2 helper trên ngay trên cùng State Engine, gần `ynKb` (giữ style).
- KHÔNG xóa khối `tg_body = JSON.stringify(...)` ở cuối — vẫn dùng cho `message_only` / `session_and_message` / `delete_end`.
- Khi `action_type === 'send_checklist'` hoặc `'consent_toggle'`, KHÔNG cần `tg_body` cũ — node mới sẽ tự build payload đặc thù từ `state_data` (xem Phần 5).

---

## Phần 3 — Diff `Switch: Action Type`

Action types v1 hiện có (đọc từ workflow lines 89-267 — có 7 outputs, mỗi rule có `outputKey`):

| Output index | outputKey | Routed to |
|---|---|---|
| 0 | `message_only` | `HTTP: Send TG 1` |
| 1 | `session_and_message` | `HTTP: Upsert Session 2` → `HTTP: Send TG 2` |
| 2 | `list_orders` | `Code: Sign List Orders` → … |
| 3 | `passport` | `HTTP: Get Passport File Info` → … |
| 4 | `delete_end` | `IF: Need Delete` → … |
| 5 | `avatar` | `HTTP: Get Avatar File Info` → … |
| 6 | `finalize` | `HTTP: Get Video File Info` → … |

### Routes cần ADD (v2)

| New output | outputKey | Routed to | Khi nào dùng |
|---|---|---|---|
| 7 | **`send_checklist`** | `HTTP: Send Checklist` → `HTTP: Save Checklist Session` | Lần đầu vào WAITING_CONSENT_CHECKLIST (cần `message_id` từ TG response để lưu cho lần edit sau) |
| 8 | **`consent_toggle`** | `HTTP: Edit Reply Markup` → `HTTP: Upsert Session Flags` | Mỗi lần agent click toggle button (chỉ edit keyboard, không gửi message mới) |
| 9 | **`advance_to_height`** | `HTTP: Upsert Session 2b` → `HTTP: Send TG 2b` (hoặc reuse 2/2b) | Khi all 6 flags = true. Có thể reuse `session_and_message` route nếu State Engine set đầy đủ `new_state`/`new_data`/`tg_body` — xem mô tả Phần 4 |

> **Quyết định kỹ thuật:** `advance_to_height` có thể **reuse `session_and_message`** (route 1) vì cùng pattern: upsert session với new_state + gửi 1 message text mới. State Engine chỉ cần set `out.action_type = 'session_and_message'`, `out.new_state = 'WAITING_HEIGHT'`, `out.new_data = {...sessionData, consent_flags: undefined}` (hoặc giữ flags), `out.telegram_message = 'All confirmed! Height (e.g. 5.5 for 5ft 5in):'`. ✅ **Kết luận: KHÔNG thêm route `advance_to_height` riêng — dùng lại `session_and_message`.**

### Switch v2 — final list

Tổng 8 routes (thay vì 7 hiện tại):

```
0: message_only
1: session_and_message       ← cũng dùng cho advance-to-height
2: list_orders
3: passport
4: delete_end
5: avatar
6: finalize
7: send_checklist            ← NEW
8: consent_toggle            ← NEW
```

---

## Phần 4 — Logic case `WAITING_CONSENT_CHECKLIST` (pseudo-code)

> **Lưu ý quan trọng:** Logic này nằm trong jsCode của `Code: State Engine`. Có 2 nhánh tùy theo input vừa đến: `update_type === 'callback_query'` với `callback_data` bắt đầu bằng `consent_toggle:` hoặc các trường hợp khác.

> **Ngoài ra**, transition `passport_confirm_yes → send_checklist` (entry vào state) đã handle ở `case 'WAITING_PASSPORT_CONFIRM'` (Phần 2), KHÔNG handle ở case này.

### Pseudo-code cho `case 'WAITING_CONSENT_CHECKLIST':`

```text
// Đọc consent_flags từ session (default toàn false nếu chưa có)
flags = sessionData.consent_flags ?? { q1:false, q2:false, q3:false, q4:false, q5:false, q7:false }
msgId = sessionData.consent_message_id  // số message_id đã lưu lúc gửi checklist lần đầu

if update_type === 'callback_query' AND callback_data startsWith 'consent_toggle:':
    qKey = callback_data.split(':')[1]                  // 'q1' / 'q2' / ... / 'q7'
    if qKey not in {q1,q2,q3,q4,q5,q7}:
        out.action_type = 'message_only'
        out.telegram_message = 'Invalid toggle.'
        break

    // Flip flag
    flags[qKey] = !flags[qKey]
    newData = {...sessionData, consent_flags: flags}

    if allChecklistDone(flags):
        // Tất cả 6 ✅ → advance sang WAITING_HEIGHT
        out.action_type     = 'session_and_message'
        out.new_state       = 'WAITING_HEIGHT'
        out.new_data        = newData                  // giữ flags để Sign Finalize đọc được
        out.telegram_message = 'All confirmed! Height (e.g. 5.5 for 5ft 5in):'
        // tg_body sẽ được build ở khối tail (chung)
    else:
        // Chỉ edit reply markup, không gửi message mới
        out.action_type            = 'consent_toggle'
        out.new_state              = 'WAITING_CONSENT_CHECKLIST'   // giữ nguyên state
        out.new_data               = newData
        out.telegram_reply_markup  = buildConsentKeyboard(flags)
        out.consent_message_id     = msgId             // truyền sang HTTP Edit node
        // KHÔNG set tg_body (route consent_toggle dùng payload riêng)

else:
    // Không phải callback toggle (text/photo/etc.) → nhắc nhẹ
    out.action_type = 'message_only'
    out.telegram_message = 'Please use the buttons below to confirm each item.'
break
```

### Entry message (gửi lần đầu khi vào state — nằm ở case `WAITING_PASSPORT_CONFIRM`)

```text
// Chỉ chạy khi callback_data === 'passport_confirm_yes'
out.action_type      = 'send_checklist'
out.new_state        = 'WAITING_CONSENT_CHECKLIST'
out.new_data         = {
    ...sessionData,
    consent_flags: { q1:false, q2:false, q3:false, q4:false, q5:false, q7:false }
}
fullName             = sessionData.full_name ?? '(unknown)'
jobType              = sessionData.job_type_en ?? ''
companyEn            = sessionData.company_name_en ?? ''
out.telegram_message =
    `Candidate: ${fullName}\n` +
    `Order: ${jobType} – ${companyEn}\n\n` +
    `Please confirm all items below:`
out.telegram_reply_markup = buildConsentKeyboard(out.new_data.consent_flags)
// tg_body KHÔNG cần ở route send_checklist (HTTP node tự build)
```

### `buildConsentKeyboard(flags)` spec

3 hàng × 2 cột, label cố định:

| Row | Col 1 (qKey, label) | Col 2 (qKey, label) |
|---|---|---|
| 1 | q1 — "Job Description" | q2 — "Salary" |
| 2 | q3 — "Overtime" | q4 — "Food" |
| 3 | q5 — "Prayer Policy" | q7 — "Penalty Policy" |

Format mỗi nút: `text = (flags[qKey] ? '✅ ' : '☐ ') + label`, `callback_data = 'consent_toggle:' + qKey`. Trả về `{ inline_keyboard: [[btn,btn],[btn,btn],[btn,btn]] }`.

### Mapping sang `candidate_confirmed` ở `Code: Sign Finalize`

Vì State Engine luôn lưu `consent_flags` vào `draft`, `Code: Sign Finalize` chỉ cần đọc `sd.consent_flags` thay vì `sd.q1_viewed_materials, sd.q2_agrees_terms, …`:

```text
flags = sd.consent_flags || {q1:false,q2:false,q3:false,q4:false,q5:false,q7:false}
candidate_confirmed = {
  q1_viewed_materials: !!flags.q1,
  q2_agrees_terms:     !!flags.q2,
  q3_agrees_overtime:  !!flags.q3,
  q4_accepts_food:     !!flags.q4,
  q5_agrees_prayer:    !!flags.q5,
  q6_has_questions:    false,         // không hỏi
  q6_questions_text:   'None',
  q7_confirms_penalty: !!flags.q7,
}
```

> **Phải sửa `Code: Sign Finalize`** để đọc `consent_flags` thay vì các keys phẳng cũ. Xem ref hiện tại: <ref_snippet file="n8n-workflows/T-2A-N8N-001-candidate-wizard.json" lines="988-1030" /> (jsCode khoảng line 988).

---

## Phần 5 — Node mới cần thêm vào workflow

| # | Node name | type | Đặt giữa | Params summary |
|---|---|---|---|---|
| N1 | `HTTP: Send Checklist` | `n8n-nodes-base.httpRequest` | Switch route 7 (`send_checklist`) → … | POST `https://api.telegram.org/bot{TOKEN}/sendMessage`, contentType=raw JSON, body = `JSON.stringify({ chat_id, text: $('Code: State Engine').item.json.telegram_message, parse_mode:'HTML', reply_markup: $('Code: State Engine').item.json.telegram_reply_markup })`. **Phải bật `options.response.response.neverError = true`** để fallback nếu TG API fail. |
| N2 | `HTTP: Save Checklist Session` | `n8n-nodes-base.httpRequest` | Sau N1 | POST Supabase upsert `bot_sessions?on_conflict=chat_id` (giống `HTTP: Upsert Session 2`), nhưng `draft` = `{ ...$('Code: State Engine').item.json.new_data, consent_message_id: $json.result.message_id }`. `current_step = 'WAITING_CONSENT_CHECKLIST'`. Headers Supabase chuẩn (apikey/Authorization/Prefer như Upsert Session 2). |
| N3 | `HTTP: Edit Reply Markup` | `n8n-nodes-base.httpRequest` | Switch route 8 (`consent_toggle`) → … | POST `https://api.telegram.org/bot{TOKEN}/editMessageReplyMarkup`, body = `JSON.stringify({ chat_id, message_id: $('Code: State Engine').item.json.consent_message_id, reply_markup: $('Code: State Engine').item.json.telegram_reply_markup })`. Bật `neverError: true`. |
| N4 | `HTTP: Upsert Session Flags` | `n8n-nodes-base.httpRequest` | Sau N3 | POST Supabase upsert giống N2, nhưng giữ nguyên `consent_message_id` cũ (đọc từ session_data của State Engine), chỉ update `draft.consent_flags`. `current_step` giữ `WAITING_CONSENT_CHECKLIST`. |
| N5 | `HTTP: Answer Callback Query` (optional) | `n8n-nodes-base.httpRequest` | Sau N4 (parallel/serial tùy) | POST `…/answerCallbackQuery` với `{callback_query_id}` để Telegram xóa loading spinner trên nút. **Khuyến nghị nhưng không bắt buộc** — UX mượt hơn. Có thể gộp vào sau N3 cũng được. Bật `neverError: true`. |
| N6 | `IF: Video File OK` | `n8n-nodes-base.if` | Sau `Code: Sign Finalize`, trước `HTTP: Call Finalize` | Condition: `{{ $json.error }}` boolean false (tức là `error !== true` → main/0 đi tiếp). True path → main/1 đi sang N7. |
| N7 | `HTTP: Send Video Error` | `n8n-nodes-base.httpRequest` | IF main/1 (error path) | POST `…/sendMessage` với text fixed: `"Video file unavailable or too large (max 20MB). Please send a smaller video."`. Bật `neverError: true`. **KHÔNG xóa session** — agent có thể gửi lại video, state vẫn `WAITING_VIDEO_UPLOAD`. |

### Connections cần thêm

```
Switch: Action Type --[main/7 send_checklist]--> HTTP: Send Checklist
HTTP: Send Checklist --[main/0]--> HTTP: Save Checklist Session
(HTTP: Save Checklist Session: dead-end, không cần outgoing)

Switch: Action Type --[main/8 consent_toggle]--> HTTP: Edit Reply Markup
HTTP: Edit Reply Markup --[main/0]--> HTTP: Upsert Session Flags
HTTP: Upsert Session Flags --[main/0]--> HTTP: Answer Callback Query   (optional)

HTTP: Get Video File Info --[main/0]--> Code: Sign Finalize
Code: Sign Finalize --[main/0]--> IF: Video File OK
IF: Video File OK --[main/0 false]--> HTTP: Call Finalize        (happy path — đổi dòng cũ)
IF: Video File OK --[main/1 true]--> HTTP: Send Video Error      (error path)
```

### Pattern reuse từ node hiện có

- N1, N3, N7 dùng cùng template HTTP TG node (lấy header + URL pattern từ `HTTP: Send TG 1`, xem ref). Khác duy nhất ở `body` và `url` (sendMessage vs editMessageReplyMarkup).
- N2, N4 dùng cùng template Supabase upsert từ `HTTP: Upsert Session 2`. Khác ở body (compose `draft` field).

---

## Phần 6 — Bug fix video silent

Bug: khi Telegram trả lỗi (file_id không hợp lệ, video > 20MB → file_path null) hoặc network error, `HTTP: Get Video File Info` throw → toàn bộ chain dừng → bot im lặng. Surveyor xác nhận node này thiếu `neverError: true`.

### Bước 1 — Patch `HTTP: Get Video File Info` (line 958-977 workflow JSON)

Hiện tại `options: {}` rỗng. Sửa thành:

```text
options: {
  response: {
    response: {
      neverError: true
    }
  }
}
```

Kết quả: dù TG API trả 4xx/5xx hay timeout, n8n vẫn đưa response (kể cả error JSON) xuống node tiếp theo `Code: Sign Finalize` thay vì throw exception.

### Bước 2 — Patch `Code: Sign Finalize` (line ~988 workflow JSON)

Ref hiện tại: <ref_snippet file="n8n-workflows/T-2A-N8N-001-candidate-wizard.json" lines="988-1030" />.

Thêm khối **early-return error** ngay đầu jsCode (trước khi build payload):

```text
const fileResp = $input.item.json
const se       = $('Code: State Engine').item.json

// Early-return nếu TG getFile fail hoặc file_path rỗng
if (!fileResp || !fileResp.ok || !fileResp.result || !fileResp.result.file_path) {
    return [{ json: {
        error: true,
        error_type: 'video_unavailable',
        chat_id: se.chat_id,
        // KHÔNG cần payload/timestamp/signature ở error path
    }}]
}

// (logic cũ giữ nguyên: build videoUrl, candidate_confirmed, payload, sign HMAC)
```

Phần đọc `consent_flags` đã ghi ở Phần 4 (mapping mới).

### Bước 3 — Thêm IF + Send Error nodes (đã liệt kê N6, N7 ở Phần 5)

- `IF: Video File OK` check `$json.error === true` → branch true (error) gửi message lỗi, branch false (OK) đi tiếp `HTTP: Call Finalize`.
- `HTTP: Send Video Error`: text fixed `"Video file unavailable or too large (max 20MB). Please send a smaller video."`. **KHÔNG delete session** — `current_step` vẫn `WAITING_VIDEO_UPLOAD`, agent có thể thử gửi lại video nhỏ hơn.

### Risk note

- `HTTP: Get Passport File Info` và `HTTP: Get Avatar File Info` có cùng pattern thiếu `neverError`. Đây **không phải scope của task này** (handoff chỉ yêu cầu fix video), nhưng Builder nên ghi chú để PM tạo task riêng follow-up cho passport/avatar (silent failure tương tự sẽ xảy ra với passport > 10MB).

---

## Phần 7 — Migration `bot_sessions.draft` field

**Câu trả lời ngắn: KHÔNG cần migration DB.**

Lý do:
- `bot_sessions.draft` là `jsonb` schema-free (xem handoff section Session table). n8n đang upsert object tự do vào field này.
- Hai key mới chỉ là `consent_flags` (object 6 boolean) và `consent_message_id` (number). Cả hai đều nằm trong `draft` jsonb, không thêm column.
- Backend `route.ts` không đọc `bot_sessions.draft` ở action `finalize` — chỉ đọc `candidate_id` từ payload (xem <ref_snippet file="app/api/telegram/candidate/route.ts" lines="384-465" />). Nên không cần thay đổi backend.

**Cleanup nice-to-have (không bắt buộc):** Khi advance từ checklist sang `WAITING_HEIGHT`, có thể strip `consent_message_id` ra khỏi `draft` để gọn (giữ `consent_flags` để `Code: Sign Finalize` đọc). Builder có thể chọn giữ hoặc strip — không ảnh hưởng functional.

---

## Phần 8 — Acceptance test (chi tiết)

> Builder phải verify đủ các test case dưới đây sau khi import workflow JSON vào n8n 1.110.1. Nên test trên Telegram thật với 1 chat_id, kiểm tra Supabase `bot_sessions` row sau mỗi step (qua Supabase Studio).

| TC | Test | Expected | Mục đích |
|---|---|---|---|
| TC01 | Import file JSON v2 vào n8n 1.110.1 | Không lỗi parse, 36 + ~6 nodes hiển thị, expressions resolve OK | Sanity check |
| TC02 | Fresh state: chat_id chưa có row → gõ `/add` | Bot trả về list orders inline buttons | Flow đầu chạy đúng |
| TC03 | Click 1 order → upload passport jpg → bot trả "Name: X. Correct?" với Yes/No | Passport flow giữ nguyên hoạt động | Regression check |
| TC04 | Click "Yes" ở passport_confirm | Bot gửi **1 message duy nhất** với text "Candidate: …\nOrder: …\n\nPlease confirm all items below:" + 6 buttons toàn `☐` | Entry checklist OK |
| TC05 | DB check sau TC04 | `bot_sessions.draft.consent_flags = {q1:false, …, q7:false}` và `draft.consent_message_id = <số>`, `current_step = 'WAITING_CONSENT_CHECKLIST'` | Save message_id work |
| TC06 | Click button "Job Description" (q1) | Cùng message bot được **edit**: nút q1 đổi từ `☐` → `✅`, các nút khác giữ nguyên `☐`. KHÔNG có message mới | editMessageReplyMarkup OK |
| TC07 | DB check sau TC06 | `draft.consent_flags.q1 = true`, các flag khác `false` | Toggle persist |
| TC08 | Click lại "Job Description" lần nữa | Nút đổi `✅` → `☐`. DB `q1 = false` | Toggle off OK |
| TC09 | Click lần lượt q1, q2, q3, q4, q5 → state chỉ edit reply markup mỗi lần | DB sau 5 click: 5 keys true, q7 false, vẫn `WAITING_CONSENT_CHECKLIST` | Partial done không advance |
| TC10 | Click q7 (button thứ 6) | Bot gửi message MỚI: "All confirmed! Height (e.g. 5.5 for 5ft 5in):". DB `current_step = 'WAITING_HEIGHT'`, `draft.consent_flags.q7 = true` (giữ flags), `consent_message_id` có thể giữ hoặc xóa tùy implementation | All-done detect & advance OK |
| TC11 | Gõ `5.5` (height) | Bot hỏi "Weight in kg (e.g. 55):". DB `draft.height_ft = 5.5`, state `WAITING_WEIGHT` | Height giữ nguyên hoạt động |
| TC12 | Gõ `55` (weight) → upload avatar photo → upload **video < 20MB** | Bot gửi web link `/order/{order_id}?candidate={id_ld}`. DB candidate row có `candidate_confirmed.q1_viewed_materials = true, …, q7_confirms_penalty = true, q6_has_questions = false, q6_questions_text = 'None'` | Happy path video OK |
| TC13 | (lặp đến `WAITING_VIDEO_UPLOAD`) → upload video > 20MB hoặc fake bad file_id | Bot gửi message: "Video file unavailable or too large (max 20MB). Please send a smaller video." DB session vẫn `WAITING_VIDEO_UPLOAD`, candidate KHÔNG bị finalize | Bug fix video error path |
| TC14 | Sau TC13 → upload video hợp lệ | Finalize thành công, bot gửi web link | Retry sau lỗi OK |
| TC15 | Gõ `/cancel` ở mỗi state (ORDER_SELECTION, PASSPORT_UPLOAD, PASSPORT_CONFIRM, CONSENT_CHECKLIST, HEIGHT, WEIGHT, AVATAR, VIDEO) | Mỗi lần: bot trả "Cancelled.", DB session row bị xóa, candidate row có `deleted_at` set (nếu `candidate_id` đã tồn tại) | Cancel global hoạt động ở mọi state |
| TC16 | Gõ text bậy ở `WAITING_CONSENT_CHECKLIST` (vd "abc") | Bot trả "Please use the buttons below to confirm each item." (1 message), state không đổi | Robust input handling |
| TC17 | (Cho task sau — idle ping) Sau khi finalize, gõ `/add` lại | Bot bắt đầu flow mới với order list | Idempotent (chuẩn bị cho task 002) |
| TC18 | Click nhanh 6 toggle liên tiếp (race condition test) | Mỗi click flip đúng 1 flag, no lost update | Concurrency basic |
| TC19 | HMAC sign verify: `Code: Sign Finalize` produce `x-bridge-signature` header → backend `verifyBridgeSignature` accept | `HTTP: Call Finalize` trả 200 (không 401 BAD_SIGNATURE) | HMAC giữ nguyên hoạt động |
| TC20 | Backend trả 401 (do timestamp drift > 300s) hoặc 5xx | `HTTP: Call Finalize` (đã có `neverError: true`) không throw, `Code: Handle Finalize` xử lý error path nếu cần | Resilience — đã có sẵn, chỉ verify |

> **Tip cho Builder:** Sau mỗi commit, xuất workflow ra JSON và diff với baseline để chắc chắn không vô tình xóa node không liên quan.

---

## Phần 9 — Implementation order (phased)

> Mục tiêu: giảm rủi ro break working flow. Mỗi phase = 1 commit độc lập, có thể test riêng trước khi merge phase sau.

### Phase A — Bug fix video silent (low risk, isolated)

**Commit 1:** `fix(workflow): video upload silent failure`

- Patch `HTTP: Get Video File Info` thêm `options.response.response.neverError = true`.
- Patch `Code: Sign Finalize` thêm early-return error block (xem Phần 6 bước 2). **Lưu ý**: ở phase này GIỮ NGUYÊN logic mapping cũ (`sd.q1_viewed_materials, …`) — chưa đổi sang `consent_flags`. Vì state machine v1 vẫn còn các keys cũ, không break gì.
- Thêm node `IF: Video File OK` + `HTTP: Send Video Error`.
- Update connections: `Code: Sign Finalize → IF → (true) Send Video Error / (false) HTTP: Call Finalize`.

**Test sau commit 1:** chạy full v1 flow (Q1-Q7) với video > 20MB → bot phải nhắn lỗi (không im lặng). Happy path < 20MB vẫn finalize OK. **TC13, TC14 phải pass.**

### Phase B — Refactor State Engine: xóa Q1-Q7, sửa PASSPORT_CONFIRM, thêm CONSENT_CHECKLIST entry

**Commit 2:** `refactor(state-engine): replace sequential Q1-Q7 with checklist case`

- Trong `Code: State Engine` jsCode:
  - REMOVE 8 cases: Q1, Q2, Q3, Q4, Q5, Q6, WAITING_Q6_TEXT, Q7.
  - SỬA `case 'WAITING_PASSPORT_CONFIRM':` nhánh `passport_confirm_yes` → set `action_type='send_checklist'`, `new_state='WAITING_CONSENT_CHECKLIST'`, init `consent_flags`, message text + reply_markup.
  - ADD `case 'WAITING_CONSENT_CHECKLIST':` (logic Phần 4).
  - ADD 2 helpers `buildConsentKeyboard` + `allChecklistDone`.
- Cập nhật `Code: Sign Finalize`: đọc `sd.consent_flags` thay vì keys phẳng, mapping sang `candidate_confirmed`.

**Test sau commit 2:** Workflow vẫn chạy được tới `passport_confirm_yes`, nhưng route `send_checklist` chưa có node receive → sẽ rớt vào error route hoặc hiện lỗi "no matching rule". Đây là **expected** vì commit 3 mới add node. ⚠️ **Nên gộp commit 2 + 3 thành 1 nếu muốn workflow chạy được sau mỗi commit.** Khuyến nghị: làm commit 2 + 3 trên 1 branch, test cùng nhau, push lên remote 1 lần.

### Phase C — Add nodes & Switch routes cho checklist UX

**Commit 3:** `feat(workflow): add consent checklist toggle nodes`

- Mở rộng `Switch: Action Type` thêm 2 rules: `send_checklist`, `consent_toggle` (route 7, 8).
- Thêm 4 (hoặc 5) nodes mới: `HTTP: Send Checklist`, `HTTP: Save Checklist Session`, `HTTP: Edit Reply Markup`, `HTTP: Upsert Session Flags`, optional `HTTP: Answer Callback Query`.
- Connect: Switch route 7 → Send Checklist → Save Checklist Session. Switch route 8 → Edit Reply Markup → Upsert Session Flags (→ Answer Callback Query).

**Test sau commit 3:** Toàn bộ TC04 → TC10 phải pass.

### Phase D — End-to-end smoke test

**Commit 4 (nếu cần fix gì sau test):** `test(workflow): pass full e2e`

- Run TC01 → TC20 trên Telegram thật.
- Verify Supabase rows ở mỗi state.
- Nếu phát hiện bug (vd race condition, message_id không lưu), commit fix nhỏ.

### Phase E — Cleanup (optional)

- Strip dead code/comments trong jsCode.
- Update `name` field workflow nếu cần (ví dụ thêm "v2" suffix).

---

## Tham chiếu nhanh

- HMAC spec: <ref_snippet file="lib/telegram-auth.ts" lines="13-46" /> (`createHmac('sha256', secret).update(timestamp + '.' + rawBody).digest('hex')`).
- `Code: State Engine` switch hiện tại: <ref_snippet file="n8n-workflows/T-2A-N8N-001-candidate-wizard.json" lines="84-270" />.
- `Switch: Action Type` rules (7 routes v1): <ref_snippet file="n8n-workflows/T-2A-N8N-001-candidate-wizard.json" lines="89-265" />.
- `HTTP: Get Video File Info` (thiếu neverError): <ref_snippet file="n8n-workflows/T-2A-N8N-001-candidate-wizard.json" lines="958-977" />.
- `Code: Sign Finalize` (cần sửa): <ref_snippet file="n8n-workflows/T-2A-N8N-001-candidate-wizard.json" lines="988-1030" />.
- Backend finalize handler: <ref_snippet file="app/api/telegram/candidate/route.ts" lines="384-465" />.

---

## Confidence note

- **Architect confidence: 88%** — đã đọc full jsCode State Engine + Sign Finalize + signature pattern + tất cả 36 nodes + 7 action_type rules. Vendor lock-in n8n 1.110.1 expression syntax đã verify trong handoff.
- **Phần chưa chắc 100%:** behavior chính xác của `editMessageReplyMarkup` khi `message_id` cũ đã expire (>48h trên Telegram) — Builder nên test edge case này hoặc fall back gửi message mới. Tuy nhiên với flow agent thường dùng < vài phút giữa upload passport và done checklist, rủi ro thấp.
- **Khuyến nghị PM:** sau khi Builder code xong, chạy parallel review (logic + workflow JSON validity + DB schema impact) qua `senior-code-reviewer`.
