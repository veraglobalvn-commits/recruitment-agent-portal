import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyBridgeSignature } from '@/lib/telegram-auth';
import type { CandidateConfirmed } from '@/lib/types';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Supabase service role client (server-side only)
// ---------------------------------------------------------------------------
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// Passport OCR helpers (reuse logic from /api/passport/route.ts)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// VPS filesystem save helper
// ---------------------------------------------------------------------------
function savePassportToVps(
  orderId: string,
  idLd: string,
  imageBase64: string,
): { url: string } | null {
  try {
    const timestamp = Date.now();
    const mediaRoot = '/var/www/media/candidates';
    const dirPath = path.join(mediaRoot, orderId, idLd);

    // Ensure directory exists
    fs.mkdirSync(dirPath, { recursive: true });

    const fileName = `passport_${timestamp}.jpg`;
    const filePath = path.join(dirPath, fileName);
    const buffer = Buffer.from(imageBase64, 'base64');
    fs.writeFileSync(filePath, buffer);

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
    const url = `${appUrl}/media/candidates/${orderId}/${idLd}/${fileName}`;
    return { url };
  } catch (err) {
    console.error('[telegram/candidate] VPS write failed:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Action: list_orders
// ---------------------------------------------------------------------------
interface ListOrdersInput {
  action: 'list_orders';
  telegram_user_id: number;
}

async function handleListOrders(body: ListOrdersInput) {
  const supabase = getSupabaseAdmin();

  // 1. Find agent by telegram_user_id
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('telegram_user_id', body.telegram_user_id)
    .eq('status', 'active')
    .maybeSingle();

  if (!user) {
    return NextResponse.json({ error: 'AGENT_NOT_LINKED' }, { status: 403 });
  }

  const agentId: string = user.id;

  // 2. Get orders assigned to this agent
  const { data: orderAgents } = await supabase
    .from('order_agents')
    .select('order_id, orders!inner(id, job_type_en, company_name, en_company_name, total_labor, status)')
    .eq('agent_id', agentId)
    .neq('orders.status', 'closed');

  const rawRows = (orderAgents ?? []) as unknown as Array<{
    order_id: string;
    orders: {
      id: string;
      job_type_en: string | null;
      company_name: string | null;
      en_company_name: string | null;
      total_labor: number | null;
      status: string | null;
    };
  }>;

  // 3. Build list with current_count
  const orders = await Promise.all(
    rawRows.map(async (row) => {
      const { count } = await supabase
        .from('candidates')
        .select('id_ld', { count: 'exact', head: true })
        .eq('order_id', row.order_id)
        .is('deleted_at', null);

      return {
        order_id: row.order_id,
        job_type_en: row.orders.job_type_en,
        company_name_en: row.orders.en_company_name ?? row.orders.company_name,
        total_labor: row.orders.total_labor,
        current_count: count ?? 0,
      };
    }),
  );

  return NextResponse.json({ agent_id: agentId, orders });
}

// ---------------------------------------------------------------------------
// Action: create_passport
// ---------------------------------------------------------------------------
interface CreatePassportInput {
  action: 'create_passport';
  telegram_user_id: number;
  order_id: string;
  chat_id: number;
  image_base64: string;
  force_update?: boolean;
}

async function handleCreatePassport(body: CreatePassportInput) {
  const supabase = getSupabaseAdmin();

  // 1. Verify agent linked
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('telegram_user_id', body.telegram_user_id)
    .eq('status', 'active')
    .maybeSingle();

  if (!user) {
    return NextResponse.json({ error: 'AGENT_NOT_LINKED' }, { status: 403 });
  }

  const agentId: string = user.id;

  // 2. Verify agent belongs to order
  const { data: assignment } = await supabase
    .from('order_agents')
    .select('order_id')
    .eq('order_id', body.order_id)
    .eq('agent_id', agentId)
    .maybeSingle();

  if (!assignment) {
    return NextResponse.json({ error: 'ORDER_NOT_ASSIGNED' }, { status: 403 });
  }

  const cleanBase64 = body.image_base64.replace(/[\s\n]+/g, '');

  const MAX_BASE64_CHARS = 14_000_000; // ~10.5 MB decoded
  if (cleanBase64.length > MAX_BASE64_CHARS) {
    return NextResponse.json({ error: 'Image too large (max 10MB)' }, { status: 413 });
  }

  // 3. OCR + AI parse (graceful degradation)
  let parsed: PassportParsed | null = null;
  let ocrSuccess = false;

  try {
    const rawText = await extractPassportText(cleanBase64);
    parsed = await parsePassportFields(rawText);
    ocrSuccess = true;
  } catch (err) {
    console.error('[TelegramCandidate] OCR/parse failed:', err);
    // Continue — graceful fail, partial candidate row will be created
  }

  // 4. Generate id_ld (only if OCR succeeded)
  let idLd: string;
  if (ocrSuccess && parsed && parsed.PP_No && parsed.Full_Name) {
    idLd = generateIdLd(parsed.PP_No, parsed.Full_Name);
  } else {
    // Fallback: stable per agent+order session — retries upsert on same row instead of creating duplicates
    idLd = `NOID_${body.order_id}_${body.chat_id}`;
  }

  // 5. Duplicate check
  if (!body.force_update) {
    const { data: existing } = await supabase
      .from('candidates')
      .select('id_ld, full_name, order_id')
      .eq('id_ld', idLd)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        ocr_success: ocrSuccess,
        duplicate: true,
        existing: {
          id_ld: existing.id_ld,
          full_name: existing.full_name,
          order_id: existing.order_id,
        },
      }, { status: 409 });
    }
  }

  // 6. Save passport image to VPS filesystem
  let passportLink: string | null = null;
  const vpsResult = savePassportToVps(body.order_id, idLd, cleanBase64);
  if (vpsResult) {
    passportLink = vpsResult.url;
  } else {
    console.error('[TelegramCandidate] passport_link will be null — VPS write failed for id_ld:', idLd);
  }

  // 7. Upsert candidate
  const candidateData: Record<string, unknown> = {
    id_ld: idLd,
    order_id: body.order_id,
    agent_id: agentId,
    passport_link: passportLink,
  };

  if (ocrSuccess && parsed) {
    candidateData.full_name = parsed.Full_Name || null;
    candidateData.pp_no = parsed.PP_No || null;
    candidateData.dob = parsed.DOB || null;
    candidateData.pp_doi = parsed.PP_DOI || null;
    candidateData.pp_doe = parsed.PP_DOE || null;
    candidateData.pob = parsed.POB || null;
    candidateData.address = parsed.Address || null;
    candidateData.phone = parsed.Phone_Number || null;
  }

  const { error: upsertErr } = await supabase
    .from('candidates')
    .upsert(candidateData, { onConflict: 'id_ld' });

  if (upsertErr) {
    console.error('[TelegramCandidate] DB upsert error:', upsertErr);
    return NextResponse.json(
      { error: `DB upsert failed: ${upsertErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ candidate_id: idLd, ocr_success: ocrSuccess });
}

// ---------------------------------------------------------------------------
// Action: finalize
// ---------------------------------------------------------------------------
interface FinalizeInput {
  action: 'finalize';
  telegram_user_id: number;
  candidate_id: string;
  height_ft: number;
  weight_kg: number;
  avatar_url: string;
  video_urls: string[];
  candidate_confirmed: CandidateConfirmed;
}

async function handleFinalize(body: FinalizeInput) {
  const supabase = getSupabaseAdmin();

  // 1. Resolve caller's agent_id from telegram_user_id
  const { data: callerUser } = await supabase
    .from('users')
    .select('id')
    .eq('telegram_user_id', body.telegram_user_id)
    .eq('status', 'active')
    .maybeSingle();

  if (!callerUser) {
    return NextResponse.json({ error: 'AGENT_NOT_LINKED' }, { status: 403 });
  }

  const callerAgentId: string = callerUser.id;

  // 2. Verify caller owns this candidate
  const { data: candidateOwner } = await supabase
    .from('candidates')
    .select('agent_id, order_id')
    .eq('id_ld', body.candidate_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!candidateOwner) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
  }

  if (candidateOwner.agent_id !== callerAgentId) {
    return NextResponse.json(
      { error: 'Not authorized to finalize this candidate' },
      { status: 403 },
    );
  }

  const confirmedData: CandidateConfirmed = {
    ...body.candidate_confirmed,
    captured_at: new Date().toISOString(),
    captured_via: 'telegram',
  };

  const { data: candidate, error: updateErr } = await supabase
    .from('candidates')
    .update({
      height_ft: body.height_ft,
      weight_kg: body.weight_kg,
      photo_link: body.avatar_url,
      video_links: body.video_urls,
      video_link: body.video_urls[0] ?? null,
      candidate_confirmed: confirmedData,
    })
    .eq('id_ld', body.candidate_id)
    .select('order_id')
    .single();

  if (updateErr || !candidate) {
    console.error('[TelegramCandidate] Finalize update error:', updateErr);
    return NextResponse.json(
      { error: updateErr?.message ?? 'Candidate not found' },
      { status: 500 },
    );
  }

  const orderId: string = candidate.order_id ?? '';

  return NextResponse.json({
    candidate_id: body.candidate_id,
    web_url: `/order/${orderId}?candidate=${body.candidate_id}`,
  });
}

// ---------------------------------------------------------------------------
// Action: delete_candidate
// ---------------------------------------------------------------------------
interface DeleteCandidateInput {
  action: 'delete_candidate';
  telegram_user_id: number;
  candidate_id: string;
}

async function handleDeleteCandidate(body: DeleteCandidateInput) {
  const supabase = getSupabaseAdmin();

  // 1. Resolve caller's agent_id from telegram_user_id
  const { data: callerUser } = await supabase
    .from('users')
    .select('id')
    .eq('telegram_user_id', body.telegram_user_id)
    .eq('status', 'active')
    .maybeSingle();

  if (!callerUser) {
    return NextResponse.json({ error: 'AGENT_NOT_LINKED' }, { status: 403 });
  }

  const callerAgentId: string = callerUser.id;

  // 2. Verify caller owns this candidate
  const { data: candidateOwner } = await supabase
    .from('candidates')
    .select('agent_id')
    .eq('id_ld', body.candidate_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!candidateOwner) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
  }

  if (candidateOwner.agent_id !== callerAgentId) {
    return NextResponse.json(
      { error: 'Not authorized to delete this candidate' },
      { status: 403 },
    );
  }

  const { error } = await supabase
    .from('candidates')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id_ld', body.candidate_id);

  if (error) {
    console.error('[TelegramCandidate] Delete error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}

// ---------------------------------------------------------------------------
// Union type for all actions
// ---------------------------------------------------------------------------
type RequestBody =
  | ListOrdersInput
  | CreatePassportInput
  | FinalizeInput
  | DeleteCandidateInput;

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  // Clone request so body can be read twice (auth reads text(), then we parse JSON)
  // Strategy: read body once as text, parse manually.
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: 'Failed to read request body' }, { status: 400 });
  }

  // Auth: verify HMAC using pre-read raw body (body already consumed above)
  const timestampHeader = req.headers.get('x-bridge-timestamp') ?? '';
  const signatureHeader = req.headers.get('x-bridge-signature') ?? '';
  const isValid = verifyBridgeSignature(rawBody, timestampHeader, signatureHeader);
  if (!isValid) {
    return NextResponse.json({ error: 'BAD_SIGNATURE' }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = JSON.parse(rawBody) as RequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    switch (body.action) {
      case 'list_orders':
        return await handleListOrders(body);

      case 'create_passport':
        return await handleCreatePassport(body);

      case 'finalize':
        return await handleFinalize(body);

      case 'delete_candidate':
        return await handleDeleteCandidate(body);

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    console.error('[TelegramCandidate] Unexpected error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

