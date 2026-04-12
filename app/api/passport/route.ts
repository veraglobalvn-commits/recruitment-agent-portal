import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth-helpers';

interface PassportParsed {
  Full_Name: string;
  PP_No: string;
  DOB: string;
  PP_DOI: string;
  PP_DOE: string;
  POB: string;
  Address: string;
  Phone_Number: string;
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function extractPassportText(imageBase64: string): Promise<string> {
  const apiKey = process.env.OCR_SPACE_API_KEY ?? '';
  if (!apiKey) throw new Error('OCR_SPACE_API_KEY not configured');

  const params = new URLSearchParams();
  params.append('apikey', apiKey);
  params.append('base64Image', `data:image/jpeg;base64,${imageBase64}`);
  params.append('OCREngine', '2');
  params.append('isOverlayRequired', 'false');
  params.append('detectOrientation', 'true');
  params.append('scale', 'true');

  const res = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const responseText = await res.text();
  if (!res.ok) throw new Error(`OCR API error: ${res.status}`);

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

  const text = ocrData.ParsedResults[0].ParsedText ?? '';
  if (!text) throw new Error('No text detected in passport image');

  return text;
}

async function parsePassportFields(rawText: string): Promise<PassportParsed> {
  const apiKey = process.env.OPENAI_API_KEY ?? '';
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

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
          content: 'Bạn là chuyên gia trích xuất thông tin từ hộ chiếu. Luôn trả về JSON thuần túy với các key đã cho.',
        },
        {
          role: 'user',
          content: `Trích xuất thông tin từ văn bản hộ chiếu sau và trả về JSON:

{
  "Full_Name": "Họ và tên đầy đủ",
  "PP_No": "Số Passport Number",
  "DOB": "Ngày sinh (dd/mm/yyyy)",
  "PP_DOI": "Ngày cấp (dd/mm/yyyy)",
  "PP_DOE": "Ngày hết hạn (dd/mm/yyyy)",
  "POB": "Nơi sinh",
  "Address": "Địa chỉ",
  "Phone_Number": "Số điện thoại"
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
  const parsed = JSON.parse(text) as Partial<Record<string, string>>;

  return {
    Full_Name: parsed.Full_Name ?? '',
    PP_No: parsed.PP_No ?? '',
    DOB: parsed.DOB ?? '',
    PP_DOI: parsed.PP_DOI ?? '',
    PP_DOE: parsed.PP_DOE ?? '',
    POB: parsed.POB ?? '',
    Address: parsed.Address ?? '',
    Phone_Number: parsed.Phone_Number ?? '',
  };
}

function generateIdLd(ppNo: string, fullName: string): string {
  const cleanName = fullName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase();
  return `${ppNo}_${cleanName}`;
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser(req);
    if (!authResult) return unauthorizedResponse();

    const { image_base64, order_id, agent_id } = await req.json() as {
      image_base64: string;
      order_id: string;
      agent_id: string | null;
    };

    if (!image_base64 || !order_id) {
      return NextResponse.json({ error: 'image_base64 and order_id are required' }, { status: 400 });
    }

    const cleanBase64 = image_base64.replace(/[\s\n]+/g, '');

    // Step 1: OCR passport text
    const rawText = await extractPassportText(cleanBase64);

    // Step 2: AI parse structured fields
    const parsed = await parsePassportFields(rawText);

    const idLd = generateIdLd(parsed.PP_No, parsed.Full_Name);

    // Step 3: Save image to Supabase Storage
    const buffer = Buffer.from(cleanBase64, 'base64');
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    const safeOrderId = order_id.replace(/[^a-zA-Z0-9-]/g, '_');
    const filePath = `candidates/${safeOrderId}/passport_${Date.now()}.jpg`;

    const { error: storageErr } = await supabaseAdmin.storage
      .from('agent-media')
      .upload(filePath, blob, { cacheControl: '3600', upsert: false });

    let passportUrl = '';
    if (!storageErr) {
      const { data: urlData } = supabaseAdmin.storage.from('agent-media').getPublicUrl(filePath);
      passportUrl = urlData.publicUrl;
    } else {
      console.error('[Passport] Storage upload failed:', storageErr.message);
    }

    // Step 4: Insert candidate into Supabase DB (primary data source)
    const candidateData = {
      id_ld: idLd,
      order_id,
      agent_id: agent_id || null,
      full_name: parsed.Full_Name || null,
      pp_no: parsed.PP_No || null,
      dob: parsed.DOB || null,
      pp_doi: parsed.PP_DOI || null,
      pp_doe: parsed.PP_DOE || null,
      pob: parsed.POB || null,
      address: parsed.Address || null,
      phone: parsed.Phone_Number || null,
      passport_link: passportUrl || null,
    };

    const { error: insertErr } = await supabaseAdmin
      .from('candidates')
      .upsert(candidateData, { onConflict: 'id_ld' });

    if (insertErr) {
      console.error('[Passport] DB insert error:', insertErr);
      return NextResponse.json({ error: `DB insert failed: ${insertErr.message}` }, { status: 500 });
    }

    // Step 6: Fire-and-forget sync to Lark via n8n
    const n8nUrl = process.env.NEXT_PUBLIC_N8N_UPLOAD_URL;
    if (n8nUrl) {
      fetch(n8nUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agent_id || '',
          order_id,
          image_base64: cleanBase64,
          candidate_id: idLd,
        }),
      }).catch((e) => console.error('[Passport] Lark sync failed:', e.message));
    }

    return NextResponse.json({ success: true, candidate: candidateData });
  } catch (err) {
    console.error('[Passport] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
