# Handoff — T-2A-N8N-002: Wizard Idle Ping (Cron)

> PM: Claude | Agent: Devin/senior_dev | Branch: `devin/t-2a-n8n-002-idle-ping`
> Làm SAU khi T-2A-N8N-001 đã merge.

---

## [TASK]

Build n8n cron workflow chạy mỗi 1 phút:
- Session idle >10 phút → gửi Telegram ping nhắc user
- Session idle >30 phút → xóa session + thông báo timeout

---

## [CONTEXT_FILES]

- `docs/handoffs/T-2A-N8N-001-handoff.md` — bot_sessions schema, Supabase connection info
- `docs/project-notes.md` — VPS IP

---

## [EXPECTED_OUTPUT]

File: `n8n-workflows/T-2A-N8N-002-idle-ping.json`

---

## [ACCEPTANCE_CRITERIA]

1. Cron chạy đúng mỗi 1 phút
2. Query bot_sessions: `last_activity_at < now() - interval '10 minutes'` AND `current_step != 'IDLE'`
3. Sessions 10–30 phút idle → gửi Telegram message: "Still there? Type /cancel to exit or continue where you left off."
4. Sessions >30 phút idle → gửi: "Session expired due to inactivity. Type /add to start again." → xóa session (DELETE row)
5. Không ping session đã ở `current_step = 'IDLE'`

---

## [SCOPE_BOUNDARY]

- Chỉ tạo workflow JSON
- Không sửa code Next.js
- Không push main

---

## [CONFIDENCE_MIN]

80%

---

## Technical Spec

**Supabase query — sessions cần xử lý:**
```
GET /rest/v1/bot_sessions?current_step=neq.IDLE&last_activity_at=lt.{30_min_ago_iso}
GET /rest/v1/bot_sessions?current_step=neq.IDLE&last_activity_at=lt.{10_min_ago_iso}&last_activity_at=gte.{30_min_ago_iso}
```

> **Schema note (xác nhận từ Surveyor 2026-04-30):** Tên cột thực tế trong `bot_sessions` là `current_step` (text) và `last_activity_at` (timestamptz). Không phải `state`/`updated_at`. Workflow v1 đã dùng đúng tên này.

**Delete session:**
```
DELETE /rest/v1/bot_sessions?chat_id=eq.{chat_id}
```

**Telegram sendMessage:** dùng Bot API hoặc n8n Telegram node gửi đến `chat_id` của session.

**Headers Supabase:** (giống T-2A-N8N-001 — xem handoff đó)
