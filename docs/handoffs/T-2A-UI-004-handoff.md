# Handoff — T-2A-UI-004: CandidateCard UI — Multi-video + Consent Display

> PM: Claude | Agent: Devin/senior_dev | Branch: `devin/t-2a-ui-004-candidate-card`
> Làm SONG SONG hoặc SAU T-2A-N8N-001.

---

## [TASK]

Cập nhật `CandidateCard.tsx` để hiển thị:
1. **Multi-video strip** — thay vì 1 nút "Video", hiển thị tất cả video trong `video_links[]`
2. **Consent badge** — hiển thị trạng thái đồng ý 7 câu khi `candidate_confirmed` có dữ liệu

---

## [CONTEXT_FILES]

- `components/agent/CandidateCard.tsx` — component cần sửa
- `lib/types.ts` — `Candidate` interface, `CandidateConfirmed` interface

---

## [EXPECTED_OUTPUT]

File sửa: `components/agent/CandidateCard.tsx`

Sau khi sửa: `npx tsc --noEmit` phải 0 lỗi.

---

## [ACCEPTANCE_CRITERIA]

1. Nếu `candidate.video_links` có ≥1 URL → hiển thị "Video 1", "Video 2"... buttons thay thế nút "Video" cũ
2. Nếu `video_links` null/empty → fallback về `video_link` (backward compat — không break existing data)
3. Mỗi video button click → gọi `onVideoPlay(url)` nếu có, hoặc `window.open(url)`
4. Nếu `candidate_confirmed` có dữ liệu → hiển thị badge nhỏ "Consent ✓" màu xanh lá trong showDetails section
5. Bên trong showDetails khi expand → hiển thị 7 câu Q1-Q7 với ✓ (Yes) hoặc ✗ (No), và nếu Q6=Yes thì hiển thị `q6_questions_text`
6. Nếu `candidate_confirmed` null → không hiển thị gì (không break)
7. TypeScript 0 lỗi sau khi sửa

---

## [SCOPE_BOUNDARY]

- Chỉ sửa `CandidateCard.tsx`
- Không sửa `lib/types.ts` (types đã đúng)
- Không sửa API routes
- Không thêm dependencies mới
- Không push main

---

## [CONFIDENCE_MIN]

85%

---

## Technical Spec

### CandidateConfirmed interface (đã có trong lib/types.ts)

```typescript
interface CandidateConfirmed {
  q1_viewed_materials: boolean;
  q2_agrees_terms: boolean;
  q3_agrees_overtime: boolean;
  q4_accepts_food: boolean;
  q5_agrees_prayer: boolean;
  q6_has_questions: boolean;
  q6_questions_text: string | null;
  q7_confirms_penalty: boolean;
  captured_at: string;
  captured_via: 'telegram';
}
```

### Label mapping cho Q1-Q7 (hiển thị trong UI)

| Field | Label ngắn |
|---|---|
| `q1_viewed_materials` | Reviewed materials |
| `q2_agrees_terms` | Agrees to terms |
| `q3_agrees_overtime` | Accepts overtime |
| `q4_accepts_food` | Accepts food arrangement |
| `q5_agrees_prayer` | Agrees to prayer schedule |
| `q6_has_questions` | Had questions |
| `q7_confirms_penalty` | Accepts penalty clause |

### Multi-video logic

```
video_links = candidate.video_links  // string[] | null | undefined
video_link  = candidate.video_link   // string | null (legacy single)

urls = (video_links && video_links.length > 0) ? video_links : (video_link ? [video_link] : [])
```

Nếu `urls.length === 0` → hiện nút upload (behavior hiện tại).
Nếu `urls.length > 0` → hiện buttons: "▶ Video 1", "▶ Video 2", ...

### Vị trí thêm trong JSX

- **Multi-video**: thay thế khối `{candidate.video_link ? ... : isVideoUploading ? ... : ...}` hiện tại (dòng 346-372)
- **Consent badge + detail**: thêm vào trong `{showDetails && (...)}` block (sau dòng 271), phía dưới phần Height/Weight

### Styling guide (follow existing Tailwind tokens)

- Consent badge: `bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium`
- Q answer ✓: `text-green-600`
- Q answer ✗: `text-red-500`
- Q6 text: `text-gray-500 text-xs italic ml-4`
