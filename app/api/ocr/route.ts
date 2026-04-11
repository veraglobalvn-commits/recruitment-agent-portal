import { NextRequest, NextResponse } from 'next/server';

interface OcrParsed {
  taxCode: string;
  companyName: string;
  shortName: string;
  legalRep: string;
  legalRepTitle: string;
  address: string;
  phone: string;
  email: string;
  industry: string;
  regAuthority: string;
  regDate: string;
}

// ── GPT-4o-mini extraction (OpenAI, ~$0.0002/call) ────────────
async function extractWithOpenRouter(rawText: string): Promise<OcrParsed> {
  const apiKey = process.env.OPENAI_API_KEY ?? '';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 512,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Bạn là AI chuyên trích xuất thông tin từ giấy đăng ký kinh doanh Việt Nam. Luôn trả về JSON thuần túy với các key đã cho.',
        },
        {
          role: 'user',
          content: `Trích xuất thông tin từ văn bản ĐKKD sau và trả về JSON với đúng các key này:

{
  "companyName": "tên công ty tiếng Việt (ấy toàn bộ sau khi bỏ lại prefix 'Tên công ty viết bằng tiếng Việt:')",
  "shortName": "tên rút gọn: chỉ lấy phần tên riêng đặc trưng (1-3 từ), bỏ tiền tố loại hình (CÔNG TY TNHH, CÔNG TY CP, CÔNG TY CỔ PHẦN...), không dấu, viết HOA, khoảng trống nối bằng '_'. Ví dụ: 'CÔNG TY TNHH LUMI GLOBAL' → 'LUMI_GLOBAL', 'CÔNG TY CP VINGROUP' → 'VINGROUP'",
  "taxCode": "mã số doanh nghiệp/thuế (chỉ số, ví dụ: 2301371097)",
  "legalRep": "họ tên người đại diện pháp luật",
  "legalRepTitle": "chức danh người đại diện",
  "address": "địa chỉ trụ sở chính đầy đủ",
  "phone": "số điện thoại",
  "email": "email",
  "industry": "ngành nghề chính",
  "regAuthority": "cơ quan đăng ký",
  "regDate": "ngày đăng ký lần đầu (dd/mm/yyyy)"
}

Không tìm thấy → để "".

VĂN BẢN:
${rawText}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json() as {
    choices?: Array<{ message: { content: string } }>;
    error?: { message: string };
  };

  if (data.error) throw new Error(data.error.message);

  const text = data.choices?.[0]?.message?.content ?? '{}';
  console.log('[OCR] GPT-4o-mini output:', text.slice(0, 400));

  const parsed = JSON.parse(text) as Partial<Record<string, string>>;
  return {
    taxCode: parsed.taxCode ?? '',
    companyName: parsed.companyName ?? '',
    shortName: parsed.shortName ?? '',
    legalRep: parsed.legalRep ?? '',
    legalRepTitle: parsed.legalRepTitle ?? '',
    address: parsed.address ?? '',
    phone: parsed.phone ?? '',
    email: parsed.email ?? '',
    industry: parsed.industry ?? '',
    regAuthority: parsed.regAuthority ?? '',
    regDate: parsed.regDate ?? '',
  };
}


// ── OCR.space raw text ─────────────────────────────────────────

async function extractRawText(imageBase64: string): Promise<string> {
  const apiKey = process.env.OCR_SPACE_API_KEY ?? '';
  console.log('[OCR] Using key:', apiKey.slice(0, 4) + '***', '| base64 length:', imageBase64.length);

  const params = new URLSearchParams();
  params.append('apikey', apiKey);
  params.append('base64Image', `data:image/jpeg;base64,${imageBase64}`);
  params.append('OCREngine', '2');
  params.append('isOverlayRequired', 'false');
  params.append('detectOrientation', 'true');
  params.append('scale', 'true');

  const ocrRes = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const responseText = await ocrRes.text();
  console.log('[OCR] Status:', ocrRes.status, '| Response preview:', responseText.slice(0, 200));

  if (!ocrRes.ok) {
    throw new Error(`OCR API error: ${ocrRes.status}`);
  }

  const ocrData = JSON.parse(responseText) as {
    ParsedResults?: Array<{ ParsedText: string }>;
    IsErroredOnProcessing?: boolean;
    ErrorMessage?: string | string[];
  };

  if (ocrData.IsErroredOnProcessing || !ocrData.ParsedResults?.[0]) {
    const msg = Array.isArray(ocrData.ErrorMessage)
      ? ocrData.ErrorMessage.join('; ')
      : (ocrData.ErrorMessage ?? 'Unknown OCR error');
    throw new Error(msg);
  }

  return ocrData.ParsedResults[0].ParsedText ?? '';
}

// ── Route handler ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { imageBase64 } = await req.json() as { imageBase64: string };
    if (!imageBase64) {
      return NextResponse.json({ error: 'imageBase64 required' }, { status: 400 });
    }

    // Step 1: OCR → raw text
    const rawText = await extractRawText(imageBase64);
    console.log('[OCR] Raw text length:', rawText.length, '| Preview:', rawText.slice(0, 150));

    // Step 2: OpenRouter (Gemini 2.0 Flash) → structured fields
    const parsed = await extractWithOpenRouter(rawText);
    console.log('[OCR] Parsed fields:', JSON.stringify(parsed));

    return NextResponse.json({ parsed, rawText });
  } catch (err) {
    console.error('[OCR] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
