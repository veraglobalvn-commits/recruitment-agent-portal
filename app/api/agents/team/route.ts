import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth-helpers';
import { ROLE_PERMISSIONS } from '@/lib/permissions';
import { randomBytes } from 'crypto';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

function generateTempPassword(): string {
  return 'Tmp_' + randomBytes(6).toString('hex');
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
    .neq('id', currentUser.id)
    .order('created_at', { ascending: false });

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
    agent_id?: string;
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

  const normalizedId = body.agent_id.trim().toUpperCase();
  const targetAgencyId = currentUser.agency_id || currentUser.id;
  const adminClient = getAdminClient();

  const { data: existing } = await adminClient
    .from('users')
    .select('id')
    .ilike('id', normalizedId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: `ID "${normalizedId}" đã tồn tại` }, { status: 409 });
  }

  const tempPassword = generateTempPassword();

  const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
    email: body.email.trim().toLowerCase(),
    password: tempPassword,
    email_confirm: true,
  });

  if (authErr) {
    const msg = authErr.message.toLowerCase();
    if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'Email đã được đăng ký bởi tài khoản khác' }, { status: 409 });
    }
    return NextResponse.json({ error: `Tạo tài khoản thất bại: ${authErr.message}` }, { status: 400 });
  }

  const defaultPerms = ROLE_PERMISSIONS['member'] || [];

  const { data: userData, error: dbErr } = await adminClient
    .from('users')
    .insert({
      id: normalizedId,
      supabase_uid: authData.user.id,
      full_name: body.full_name.trim(),
      short_name: normalizedId,
      role: 'member',
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

  return NextResponse.json({
    user: userData,
    status: 'created',
    credentials: {
      email: body.email.trim().toLowerCase(),
      password: tempPassword,
    },
  });
}
