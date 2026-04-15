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

  // Fetch order + company + agent in parallel
  const [orderRes, agentRes] = await Promise.all([
    supabase
      .from('orders')
      .select(`
        id, job_type, job_type_en, total_labor, labor_missing, salary_usd,
        service_fee_per_person, total_fee_vn, total_fee_bd,
        meal, meal_en, dormitory, dormitory_en, dormitory_note,
        recruitment_info, recruitment_info_en,
        probation, probation_salary_pct,
        company_id, company_name
      `)
      .eq('id', order_id)
      .single(),
    supabase
      .from('agents')
      .select('id, full_name, company_name, company_address, legal_rep, legal_rep_title, license_no, labor_percentage')
      .eq('id', agent_id)
      .single(),
  ]);

  if (orderRes.error || !orderRes.data) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  if (agentRes.error || !agentRes.data) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const order = orderRes.data as Record<string, unknown>;
  const agent = agentRes.data as Record<string, unknown>;

  // Fetch company info
  let company: Record<string, unknown> = {};
  if (order.company_id) {
    const { data } = await supabase
      .from('companies')
      .select('company_name, en_company_name, address, en_address, legal_rep, en_legal_rep, legal_rep_title, en_title, tax_code')
      .eq('id', order.company_id as string)
      .single();
    if (data) company = data as Record<string, unknown>;
  }

  // Validate required fields
  const missing: string[] = [];
  if (!order.job_type) missing.push('job_type');
  if (!order.total_labor || Number(order.total_labor) <= 0) missing.push('total_labor');
  if (!order.salary_usd || Number(order.salary_usd) <= 0) missing.push('salary_usd');
  if (!order.service_fee_per_person || Number(order.service_fee_per_person) <= 0) missing.push('service_fee_per_person');
  if (!company.company_name) missing.push('company_name');
  if (!company.address) missing.push('company_address');
  if (!company.legal_rep) missing.push('company_legal_rep');
  if (!agent.full_name) missing.push('agent_full_name');

  if (missing.length > 0) {
    return NextResponse.json({ error: 'Thiếu thông tin', missing }, { status: 422 });
  }

  const n8nUrl = process.env.N8N_YCTD_URL;
  if (!n8nUrl) {
    return NextResponse.json({ error: 'N8N_YCTD_URL not configured' }, { status: 500 });
  }

  const payload = {
    order_id,
    job_type: order.job_type,
    job_type_en: order.job_type_en || '',
    total_labor: Number(order.total_labor),
    salary_usd: Number(order.salary_usd),
    service_fee_per_person: Number(order.service_fee_per_person),
    total_fee_vn: order.total_fee_vn ? Number(order.total_fee_vn) : null,
    total_fee_bd: order.total_fee_bd ? Number(order.total_fee_bd) : null,
    meal: order.meal || '',
    meal_en: order.meal_en || '',
    dormitory: order.dormitory || '',
    dormitory_en: order.dormitory_en || '',
    dormitory_note: order.dormitory_note || '',
    recruitment_info: order.recruitment_info || '',
    recruitment_info_en: order.recruitment_info_en || '',
    probation: order.probation || 'Không',
    probation_salary_pct: order.probation_salary_pct ? Number(order.probation_salary_pct) : null,
    company_name: company.company_name || '',
    en_company_name: company.en_company_name || '',
    company_address: company.address || '',
    en_address: company.en_address || '',
    company_legal_rep: company.legal_rep || '',
    en_legal_rep: company.en_legal_rep || '',
    company_legal_rep_title: company.legal_rep_title || '',
    en_title: company.en_title || '',
    company_tax_code: company.tax_code || '',
    agent_id,
    agent_full_name: agent.full_name || '',
    agent_company_name: agent.company_name || '',
    agent_address: agent.company_address || '',
    agent_legal_rep: agent.legal_rep || '',
    agent_legal_rep_title: agent.legal_rep_title || '',
    agent_license_no: agent.license_no || '',
    agent_labor_percentage: agent.labor_percentage ? Number(agent.labor_percentage) : null,
  };

  try {
    const res = await fetch(n8nUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[yctd] n8n error:', errText);
      return NextResponse.json({ error: `n8n error: ${res.status}` }, { status: 502 });
    }

    const result = await res.json() as { pdf_url?: string; edit_url?: string };
    return NextResponse.json({
      pdf_url: result.pdf_url ?? null,
      edit_url: result.edit_url ?? null,
    });
  } catch (err) {
    console.error('[yctd] fetch error:', err);
    return NextResponse.json({ error: 'YCTD service unavailable' }, { status: 502 });
  }
}
