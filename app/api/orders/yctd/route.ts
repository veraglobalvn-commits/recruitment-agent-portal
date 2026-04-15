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

  let body: { order_id: string; agent_id: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { order_id, agent_id } = body;
  if (!order_id || !agent_id) {
    return NextResponse.json({ error: 'order_id and agent_id are required' }, { status: 400 });
  }

  const supabase = getAdminClient();

  const { data: request, error: insertError } = await supabase
    .from('recruitment_requests')
    .insert({
      order_id,
      agent_id,
      status: 'pending'
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const n8nUrl = process.env.N8N_YCTD_URL;
  if (!n8nUrl) {
    return NextResponse.json({ error: 'N8N_YCTD_URL not configured' }, { status: 500 });
  }

  try {
    await fetch(n8nUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_id: request.id,
        order_id,
        agent_id
      }),
    });
  } catch (err) {
    console.error('[yctd] n8n error:', err);
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
    .from('recruitment_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}
