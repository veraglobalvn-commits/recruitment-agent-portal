import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminUser, unauthorizedResponse } from '@/lib/auth-helpers';

export async function GET(req: NextRequest) {
  const auth = await getAdminUser(req);
  if (!auth) return unauthorizedResponse();

  const { data, error } = await auth.supabase
    .from('agencies')
    .select('*')
    .eq('status', 'active')
    .order('company_name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agencies: data });
}

export async function POST(req: NextRequest) {
  const auth = await getAdminUser(req);
  if (!auth) return unauthorizedResponse();

  const body = await req.json() as {
    id?: string;
    company_name?: string;
    company_address?: string;
    legal_rep?: string;
    legal_rep_title?: string;
    license_no?: string;
    labor_percentage?: number;
    status?: string;
  };

  if (!body.id?.trim()) {
    return NextResponse.json({ error: 'Agency ID là bắt buộc' }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from('agencies')
    .insert({
      id: body.id.trim().toUpperCase(),
      company_name: body.company_name?.trim() || null,
      company_address: body.company_address?.trim() || null,
      legal_rep: body.legal_rep?.trim() || null,
      legal_rep_title: body.legal_rep_title?.trim() || null,
      license_no: body.license_no?.trim() || null,
      labor_percentage: body.labor_percentage || 0,
      status: body.status || 'active',
    })
    .select()
    .single();

  if (error) {
    if (error.message.includes('duplicate') || error.message.includes('unique')) {
      return NextResponse.json({ error: `Agency ID "${body.id}" đã tồn tại` }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ agency: data });
}
