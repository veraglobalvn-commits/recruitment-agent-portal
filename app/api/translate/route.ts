import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser, unauthorizedResponse } from '@/lib/auth-helpers';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  const auth = await getAdminUser(req);
  if (!auth) return unauthorizedResponse('Admin access required');

  let body: {
    company_id?: string;
    job_type?: string;
    meal?: string;
    dormitory?: string;
    recruitment_info?: string;
    probation?: string;
    probation_months?: number | null;
    probation_salary_pct?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = getAdminClient();

  const { data: request, error: insertError } = await supabase
    .from('translation_requests')
    .insert({
      entity_type: body.company_id ? 'company' : 'order',
      entity_id: body.company_id || '',
      fields_to_translate: body.company_id
        ? ['company_name', 'industry', 'business_type', 'address', 'legal_rep', 'legal_rep_title']
        : ['job_type', 'recruitment_info'],
      status: 'pending'
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const n8nUrl = process.env.N8N_TRANSLATE_URL;
  if (!n8nUrl) {
    return NextResponse.json({ error: 'N8N_TRANSLATE_URL not configured' }, { status: 500 });
  }

  try {
    await fetch(n8nUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_id: request.id,
        entity_type: request.entity_type,
        entity_id: request.entity_id,
        fields_to_translate: request.fields_to_translate
      }),
    });
  } catch (err) {
    console.error('[translate] n8n error:', err);
  }

  return NextResponse.json({ request_id: request.id });
}

export async function GET(req: NextRequest) {
  const auth = await getAdminUser(req);
  if (!auth) return unauthorizedResponse('Admin access required');

  const { searchParams } = new URL(req.url);
  const requestId = searchParams.get('request_id');

  if (!requestId) {
    return NextResponse.json({ error: 'request_id is required' }, { status: 400 });
  }

  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('translation_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}
