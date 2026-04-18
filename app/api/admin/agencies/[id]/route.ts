import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser, unauthorizedResponse } from '@/lib/auth-helpers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAdminUser(req);
  if (!auth) return unauthorizedResponse();

  const { id } = await params;
  const { data, error } = await auth.supabase
    .from('agencies')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Không tìm thấy agency' }, { status: 404 });

  const { data: members } = await auth.supabase
    .from('users')
    .select('id, full_name, short_name, role, status, avatar_url')
    .eq('agency_id', id)
    .order('role');

  return NextResponse.json({ agency: data, members: members || [] });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAdminUser(req);
  if (!auth) return unauthorizedResponse();

  const { id } = await params;
  const body = await req.json() as {
    company_name?: string;
    company_address?: string;
    legal_rep?: string;
    legal_rep_title?: string;
    license_no?: string;
    labor_percentage?: number;
    doc_links?: unknown[];
    status?: string;
  };

  const updates: Record<string, unknown> = {};
  if (body.company_name !== undefined) updates.company_name = body.company_name.trim() || null;
  if (body.company_address !== undefined) updates.company_address = body.company_address.trim() || null;
  if (body.legal_rep !== undefined) updates.legal_rep = body.legal_rep.trim() || null;
  if (body.legal_rep_title !== undefined) updates.legal_rep_title = body.legal_rep_title.trim() || null;
  if (body.license_no !== undefined) updates.license_no = body.license_no.trim() || null;
  if (body.labor_percentage !== undefined) updates.labor_percentage = body.labor_percentage;
  if (body.doc_links !== undefined) updates.doc_links = body.doc_links;
  if (body.status !== undefined) updates.status = body.status;

  const { data, error } = await auth.supabase
    .from('agencies')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Không tìm thấy agency' }, { status: 404 });

  return NextResponse.json({ agency: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAdminUser(req);
  if (!auth) return unauthorizedResponse();

  const { id } = await params;
  const { data, error } = await auth.supabase
    .from('agencies')
    .update({ status: 'inactive' })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agency: data });
}
