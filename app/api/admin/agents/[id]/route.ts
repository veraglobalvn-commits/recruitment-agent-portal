import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminUser, unauthorizedResponse } from '@/lib/auth-helpers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAdminUser(req);
  if (!auth) return unauthorizedResponse();

  const { id } = await params;
  const { data, error } = await auth.supabase
    .from('users')
    .select('id, supabase_uid, full_name, short_name, role, status, agency_id, permissions, avatar_url, created_at')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Không tìm thấy user' }, { status: 404 });

  let agencyData = null;
  if (data.agency_id) {
    const { data: ag } = await auth.supabase
      .from('agencies')
      .select('id, company_name, license_no, status')
      .eq('id', data.agency_id)
      .maybeSingle();
    agencyData = ag;
  }

  return NextResponse.json({ user: data, agency: agencyData });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAdminUser(req);
  if (!auth) return unauthorizedResponse();

  const { id } = await params;
  const body = await req.json() as {
    full_name?: string;
    short_name?: string;
    role?: string;
    status?: string;
    agency_id?: string | null;
    permissions?: string[];
  };

  const updates: Record<string, unknown> = {};
  if (body.full_name !== undefined) updates.full_name = body.full_name.trim() || null;
  if (body.short_name !== undefined) updates.short_name = body.short_name.trim() || null;
  if (body.role !== undefined) {
    if (!['admin', 'agent', 'manager', 'operator'].includes(body.role)) {
      return NextResponse.json({ error: 'Role không hợp lệ' }, { status: 400 });
    }
    updates.role = body.role;
  }
  if (body.status !== undefined) {
    if (!['active', 'inactive'].includes(body.status)) {
      return NextResponse.json({ error: 'Status không hợp lệ' }, { status: 400 });
    }
    updates.status = body.status;
  }
  if (body.agency_id !== undefined) updates.agency_id = body.agency_id || null;
  if (body.permissions !== undefined) updates.permissions = body.permissions;

  if (body.status === 'inactive' && body.role === undefined) {
    const { data: self } = await auth.supabase
      .from('users')
      .select('role')
      .eq('id', id)
      .maybeSingle();
    if (self?.role === 'admin') {
      const { count } = await auth.supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('status', 'active');
      if (count !== null && count <= 1) {
        return NextResponse.json({ error: 'Không thể ngừng hoạt động admin cuối cùng' }, { status: 400 });
      }
    }
  }

  const { data, error } = await auth.supabase
    .from('users')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Không tìm thấy user' }, { status: 404 });

  return NextResponse.json({ user: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAdminUser(req);
  if (!auth) return unauthorizedResponse();

  const { id } = await params;

  const { data: target } = await auth.supabase
    .from('users')
    .select('role')
    .eq('id', id)
    .maybeSingle();

  if (target?.role === 'admin') {
    const { count } = await auth.supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('status', 'active');
    if (count !== null && count <= 1) {
      return NextResponse.json({ error: 'Không thể xoá admin cuối cùng' }, { status: 400 });
    }
  }

  const { data, error } = await auth.supabase
    .from('users')
    .update({ status: 'inactive' })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ user: data });
}
