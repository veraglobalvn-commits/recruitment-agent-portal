import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth-helpers';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

export async function GET(req: NextRequest) {
  const result = await getAuthenticatedUser(req);
  if (!result) return unauthorizedResponse();

  const { data: currentUser } = await result.supabase
    .from('users')
    .select('id, role, status, agency_id')
    .eq('supabase_uid', result.user.id)
    .maybeSingle();

  if (!currentUser || currentUser.status !== 'active') {
    return unauthorizedResponse('Tài khoản không hoạt động');
  }

  if (currentUser.role !== 'agent') {
    return unauthorizedResponse('Chỉ agent owner mới được quản lý team');
  }

  const targetAgencyId = currentUser.agency_id || currentUser.id;

  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('users')
    .select('id, full_name, short_name, role, status, agency_id, permissions, avatar_url')
    .eq('agency_id', targetAgencyId)
    .order('role');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ members: data || [] });
}

export async function POST(req: NextRequest) {
  const result = await getAuthenticatedUser(req);
  if (!result) return unauthorizedResponse();

  const { data: currentUser } = await result.supabase
    .from('users')
    .select('id, role, status, agency_id')
    .eq('supabase_uid', result.user.id)
    .maybeSingle();

  if (!currentUser || currentUser.status !== 'active') {
    return unauthorizedResponse('Tài khoản không hoạt động');
  }

  if (currentUser.role !== 'agent') {
    return unauthorizedResponse('Chỉ agent owner mới được tạo member');
  }

  const body = await req.json() as {
    email?: string;
    full_name?: string;
    short_name?: string;
    agent_id?: string;
    role?: string;
  };

  if (!body.email?.trim()) {
    return NextResponse.json({ error: 'Email là bắt buộc' }, { status: 400 });
  }
  if (!body.full_name?.trim()) {
    return NextResponse.json({ error: 'Họ tên là bắt buộc' }, { status: 400 });
  }
  if (!body.agent_id?.trim()) {
    return NextResponse.json({ error: 'ID là bắt buộc' }, { status: 400 });
  }

  const memberRole = body.role || 'operator';
  if (!['manager', 'operator'].includes(memberRole)) {
    return NextResponse.json({ error: 'Role phải là manager hoặc operator' }, { status: 400 });
  }

  const targetAgencyId = currentUser.agency_id || currentUser.id;
  const adminClient = getAdminClient();

  const normalizedId = body.agent_id.trim().toUpperCase();
  const { data: existing } = await adminClient
    .from('users')
    .select('id')
    .ilike('id', normalizedId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: `ID "${normalizedId}" đã tồn tại` }, { status: 409 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const { data: authData, error: authErr } = await adminClient.auth.admin.inviteUserByEmail(
    body.email.trim().toLowerCase(),
    { redirectTo: `${baseUrl}/auth/callback` },
  );

  if (authErr) {
    const msg = authErr.message.toLowerCase();
    if (msg.includes('already registered') || msg.includes('already exists')) {
      return NextResponse.json({ error: 'Email đã được đăng ký' }, { status: 409 });
    }
    return NextResponse.json({ error: `Gửi lời mời thất bại: ${authErr.message}` }, { status: 400 });
  }

  const { ROLE_PERMISSIONS } = await import('@/lib/permissions');
  const defaultPerms = ROLE_PERMISSIONS[memberRole] || [];

  const { data: userData, error: dbErr } = await adminClient
    .from('users')
    .insert({
      id: normalizedId,
      supabase_uid: authData.user.id,
      full_name: body.full_name.trim(),
      short_name: body.short_name?.trim() || null,
      role: memberRole,
      agency_id: targetAgencyId,
      permissions: defaultPerms,
      status: 'active',
    })
    .select()
    .single();

  if (dbErr) {
    await adminClient.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: `Tạo user thất bại: ${dbErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ user: userData, status: 'invite_sent' });
}
