import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser, unauthorizedResponse } from '@/lib/auth-helpers';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

function getWebhookUrl(entityType: 'order' | 'company') {
  if (process.env.N8N_TRANSLATE_URL) return process.env.N8N_TRANSLATE_URL;
  return entityType === 'order'
    ? process.env.N8N_TRANSLATE_ORDER_URL
    : process.env.N8N_TRANSLATE_COMPANY_URL;
}

export async function POST(req: NextRequest) {
  const auth = await getAdminUser(req);
  if (!auth) return unauthorizedResponse('Admin access required');

  let body: {
    company_id?: string;
    order_id?: string;
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

  const requestIds: string[] = [];
  const promises = [];

  if (body.order_id) {
    promises.push((async () => {
      const { data: request, error: insertError } = await supabase
        .from('translation_requests')
        .insert({
          entity_type: 'order',
          entity_id: body.order_id!,
          fields_to_translate: ['job_type', 'meal', 'dormitory', 'probation'],
          status: 'pending'
        })
        .select()
        .single();
      
      if (insertError || !request) throw insertError || new Error('Failed to create order translation request');

      requestIds.push(request.id);
      const url = getWebhookUrl('order');
      if (!url) {
        await supabase.from('translation_requests').update({
          status: 'failed',
          error_message: 'N8N translate webhook URL is not configured',
          completed_at: new Date().toISOString(),
        }).eq('id', request.id);
        throw new Error('N8N translate webhook URL is not configured');
      }

      const webhookRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: request.id,
          entity_type: 'order',
          entity_id: request.entity_id,
          fields_to_translate: request.fields_to_translate
        }),
      });

      if (!webhookRes.ok) {
        const message = `N8N translate webhook failed with status ${webhookRes.status}`;
        await supabase.from('translation_requests').update({
          status: 'failed',
          error_message: message,
          completed_at: new Date().toISOString(),
        }).eq('id', request.id);
        throw new Error(message);
      }
    })());
  }

  if (body.company_id) {
    promises.push((async () => {
      const { data: request, error: insertError } = await supabase
        .from('translation_requests')
        .insert({
          entity_type: 'company',
          entity_id: body.company_id!,
          fields_to_translate: ['company_name', 'address', 'business_type', 'legal_rep', 'legal_rep_title'],
          status: 'pending'
        })
        .select()
        .single();
      
      if (insertError || !request) throw insertError || new Error('Failed to create company translation request');

      requestIds.push(request.id);
      const url = getWebhookUrl('company');
      if (!url) {
        await supabase.from('translation_requests').update({
          status: 'failed',
          error_message: 'N8N translate webhook URL is not configured',
          completed_at: new Date().toISOString(),
        }).eq('id', request.id);
        throw new Error('N8N translate webhook URL is not configured');
      }

      const webhookRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: request.id,
          entity_type: 'company',
          entity_id: request.entity_id,
          fields_to_translate: request.fields_to_translate
        }),
      });

      if (!webhookRes.ok) {
        const message = `N8N translate webhook failed with status ${webhookRes.status}`;
        await supabase.from('translation_requests').update({
          status: 'failed',
          error_message: message,
          completed_at: new Date().toISOString(),
        }).eq('id', request.id);
        throw new Error(message);
      }
    })());
  }

  try {
    await Promise.all(promises);
  } catch (err) {
    console.error('[translate] request failed:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to trigger translation' }, { status: 500 });
  }

  if (requestIds.length === 0) {
    return NextResponse.json({ error: 'Failed to create translation requests' }, { status: 500 });
  }

  return NextResponse.json({ request_ids: requestIds });
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
