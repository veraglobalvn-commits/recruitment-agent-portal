# Handoff — T-2A-N8N-001: Telegram Candidate Wizard (v2 — Revision)

> PM: Claude | Agent: Devin/senior_dev | Branch: `devin/t-2a-n8n-001-candidate-wizard`
> **n8n version đã xác nhận: 1.110.1 self-hosted**

---

## [TASK]

**Đây là revision của workflow hiện tại** (`n8n-workflows/T-2A-N8N-001-candidate-wizard.json`).
Có 2 thay đổi bắt buộc:

1. **UX Change**: Thay sequential Q1-Q7 bằng checklist 1 màn hình (toggle buttons)
2. **Bug Fix**: Video upload xong → bot im lặng (fix neverError + handle empty file_path)

---

## [CONTEXT_FILES]

- `n8n-workflows/T-2A-N8N-001-candidate-wizard.json` — file cần sửa
- `app/api/telegram/candidate/route.ts` — Next.js API backend
- `lib/telegram-auth.ts` — HMAC signing spec

---

## [EXPECTED_OUTPUT]

File sửa: `n8n-workflows/T-2A-N8N-001-candidate-wizard.json`

Import được vào n8n 1.110.1 không lỗi, implement đúng state machine v2.

---

## [ACCEPTANCE_CRITERIA]

1. Import workflow JSON vào n8n 1.110.1 → không lỗi
2. `/add` → chọn order → upload passport → confirm tên → hoạt động như cũ
3. Sau khi confirm passport: bot gửi **1 message duy nhất** với 6 toggle buttons (không hỏi lần lượt từng câu nữa)
4. Agent click từng button → bot **edit message** (không gửi tin mới) để toggle ☐/✅
5. Khi đủ 6 items checked → bot hỏi height/weight → avatar → video → finalize → link web
6. Nếu gửi video và Telegram trả lỗi → bot phải gửi message thông báo lỗi (không im lặng)
7. Nếu gửi video và file_path rỗng (video quá lớn) → bot nhắn "Video too large. Please send a video under 20MB."
8. `/cancel` bất kỳ bước nào → xóa session, reset về IDLE

---

## [SCOPE_BOUNDARY]

- Chỉ sửa `n8n-workflows/T-2A-N8N-001-candidate-wizard.json`
- Không sửa file Next.js, không chạy DB migration, không push main

---

## [CONFIDENCE_MIN]

85%

---

## Technical Spec

### n8n version: 1.110.1

Node types đã xác nhận hoạt động trên 1.110.1:
- `n8n-nodes-base.telegramTrigger`
- `n8n-nodes-base.httpRequest`
- `n8n-nodes-base.code`
- `n8n-nodes-base.switch`
- `n8n-nodes-base.if`
- `n8n-nodes-base.merge`

Expression syntax trong 1.110.1:
- `={{ $json.field }}` — expression cho toàn bộ value
- `=https://url/{{ $json.field }}` — string interpolation
- `$('NodeName').item.json.field` — reference node khác trong cùng execution

---

### Session — Supabase `bot_sessions` table

**Column names thực tế (khớp với workflow hiện tại):**

| Column | Type | Mô tả |
|---|---|---|
| `chat_id` | bigint PK | Telegram chat_id |
| `current_step` | text | State hiện tại (đọc/ghi field này) |
| `draft` | jsonb | Dữ liệu session (order_id, candidate_id, v.v.) |
| `last_activity_at` | timestamptz | Cập nhật mỗi action |
| `telegram_user_id` | bigint | Telegram user ID |

**Upsert pattern (đang dùng trong workflow):**
```
POST /rest/v1/bot_sessions?on_conflict=chat_id
Prefer: resolution=merge-duplicates,return=representation
Body: { chat_id, telegram_user_id, current_step, draft, last_activity_at }
```

---

### State Machine v2

```
IDLE
 └─ /add ──────────────────────────► WAITING_ORDER_SELECTION
                                          │ (user picks order)
                                          ▼
                                   WAITING_PASSPORT_UPLOAD
                                          │ (user sends photo)
                                          ▼
                                  WAITING_PASSPORT_CONFIRM
                                    "Name: {full_name}. Correct?"
                                     Yes ──► WAITING_CONSENT_CHECKLIST  ← NEW
                                     No  ──► WAITING_PASSPORT_UPLOAD (retry)
                                          │
                                          ▼
                              [agent toggles all 6 items ✅]
                                          │
                                          ▼
                                  WAITING_HEIGHT        ← (đổi tên từ inline trong Q7)
                                          │
                                          ▼
                                  WAITING_WEIGHT
                                          │
                                          ▼
                                  WAITING_AVATAR_UPLOAD
                                          │
                                          ▼
                                  WAITING_VIDEO_UPLOAD
                                          │
                                          ▼
                                      finalize → send web link → END
```

**At any state:** `/cancel` → delete session → "Cancelled."

**States bị XÓA khỏi workflow**: Q1, Q2, Q3, Q4, Q5, Q6, Q6_TEXT, Q7

---

### THAY ĐỔI 1 — WAITING_CONSENT_CHECKLIST (New State)

#### Trigger khi nào
Sau khi agent bấm "Yes" ở WAITING_PASSPORT_CONFIRM.

#### Bot gửi gì (entry message)
```
Candidate: {full_name}
Order: {job_type_en} – {company_name_en}

Please confirm all items below:
```
Kèm inline keyboard 3 hàng × 2 nút:
```
[ ☐ Job Description ]  [ ☐ Salary         ]
[ ☐ Overtime        ]  [ ☐ Food           ]
[ ☐ Prayer Policy   ]  [ ☐ Penalty Policy ]
```

**Sau khi gửi message**: đọc response từ Telegram (`result.message_id`) → lưu vào `draft.consent_message_id`. Cần thêm 1 node Upsert sau khi gửi message để lưu `consent_message_id`.

#### Callback data format
| Button | callback_data |
|---|---|
| Job Description | `consent_toggle:q1` |
| Salary | `consent_toggle:q2` |
| Overtime | `consent_toggle:q3` |
| Food | `consent_toggle:q4` |
| Prayer Policy | `consent_toggle:q5` |
| Penalty Policy | `consent_toggle:q7` |

#### Khi agent click một button (action_type: `consent_toggle`)
1. Toggle flag trong `draft.consent_flags` (đọc session từ DB, flip giá trị)
2. Rebuild inline keyboard với icon đúng (☐ nếu false, ✅ nếu true)
3. Gọi `editMessageReplyMarkup` để cập nhật message (không gửi message mới)
4. Upsert session với `draft.consent_flags` đã cập nhật
5. **Check if all done**: nếu tất cả 6 flags = true → đổi state sang `WAITING_HEIGHT`, gửi message: `"All confirmed! Height (e.g. 5.5 for 5ft 5in):"`

#### editMessageReplyMarkup call
```
POST https://api.telegram.org/bot{TOKEN}/editMessageReplyMarkup
Body: {
  "chat_id": {chat_id},
  "message_id": {draft.consent_message_id},
  "reply_markup": { "inline_keyboard": [...rebuilt keyboard...] }
}
```

#### Session data khi ở WAITING_CONSENT_CHECKLIST
```json
{
  "order_id": "...",
  "candidate_id": "...",
  "full_name": "...",
  "job_type_en": "...",
  "company_name_en": "...",
  "consent_message_id": 12345,
  "consent_flags": {
    "q1": false,
    "q2": false,
    "q3": false,
    "q4": false,
    "q5": false,
    "q7": false
  }
}
```

#### Mapping sang CandidateConfirmed khi finalize
```javascript
candidate_confirmed: {
  q1_viewed_materials: draft.consent_flags.q1,
  q2_agrees_terms:     draft.consent_flags.q2,
  q3_agrees_overtime:  draft.consent_flags.q3,
  q4_accepts_food:     draft.consent_flags.q4,
  q5_agrees_prayer:    draft.consent_flags.q5,
  q6_has_questions:    false,          // không hỏi — default false
  q6_questions_text:   'None',         // default
  q7_confirms_penalty: draft.consent_flags.q7,
}
```

---

### THAY ĐỔI 2 — Bug Fix: Video → Finalize Chain

#### Root cause
`HTTP: Get Video File Info` không có `neverError: true`. Khi Telegram trả lỗi (video quá lớn, file_id không hợp lệ, network timeout), n8n throw exception → toàn bộ chain dừng → bot im lặng.

#### Fix

**Node `HTTP: Get Video File Info`**: Thêm option:
```json
"options": {
  "response": {
    "response": {
      "neverError": true
    }
  }
}
```

**Node `Code: Sign Finalize`**: Thêm check đầu tiên:
```javascript
const fileResp = $input.item.json;

// Handle Telegram API error or empty file_path
if (!fileResp.ok || !fileResp.result || !fileResp.result.file_path) {
  return [{ json: {
    error: true,
    error_type: 'video_unavailable',
    chat_id: $('Code: State Engine').item.json.chat_id,
  }}];
}
// ... tiếp tục logic bình thường
```

**Thêm IF node sau `Code: Sign Finalize`**:
- Nếu `$json.error === true` → gửi Telegram message: `"Video file unavailable or too large (max 20MB). Please send a smaller video."` → END (không delete session, để agent gửi lại)
- Nếu `$json.error !== true` → tiếp tục flow cũ sang `HTTP: Call Finalize`

---

### Height/Weight (giữ nguyên logic cũ)

- State `WAITING_HEIGHT`: bot hỏi `"Height (e.g. 5.5 for 5ft 5in):"` → nhận text → parse float → save → advance `WAITING_WEIGHT`
- State `WAITING_WEIGHT`: bot hỏi `"Weight in kg (e.g. 55):"` → nhận text → parse float → save → advance `WAITING_AVATAR_UPLOAD`, gửi `"Please send the candidate's avatar photo."`

---

### API Bridge — giữ nguyên

Endpoint và HMAC signing không đổi. Xem handoff gốc.

**finalize payload** (cập nhật phần `candidate_confirmed` theo mapping checklist ở trên):
```json
{
  "action": "finalize",
  "telegram_user_id": 12345,
  "candidate_id": "PPNO_CLEANNAME",
  "height_ft": 5.5,
  "weight_kg": 55,
  "avatar_url": "https://...",
  "video_urls": ["https://..."],
  "candidate_confirmed": {
    "q1_viewed_materials": true,
    "q2_agrees_terms": true,
    "q3_agrees_overtime": true,
    "q4_accepts_food": true,
    "q5_agrees_prayer": true,
    "q6_has_questions": false,
    "q6_questions_text": "None",
    "q7_confirms_penalty": true
  }
}
```

---

## Notes for Devin

1. **Đây là revision** — giữ lại toàn bộ nodes không liên quan (list_orders, passport, cancel, avatar, session upsert pattern). Chỉ xóa/sửa Q1-Q7 nodes và fix video chain.
2. Khi gửi checklist message lần đầu, cần **thêm 1 upsert node** sau `HTTP: Send Checklist` để lưu `message_id` từ Telegram response (`response.result.message_id`).
3. `editMessageReplyMarkup` không trả về text mới — chỉ update keyboard. Bot KHÔNG gửi message mới khi toggle (trừ khi all done).
4. Test thứ tự: (a) toggle từng button → message update, (b) toggle lại → uncheck, (c) check all 6 → flow tiếp tục.
5. Test video bug: gửi video hợp lệ → bot phải gửi web link; gửi video >20MB → bot phải báo lỗi (không im lặng).
6. n8n 1.110.1 expression syntax: dùng `={{ expression }}` hoặc `=string {{ $json.field }}` — cả hai đều hoạt động.
