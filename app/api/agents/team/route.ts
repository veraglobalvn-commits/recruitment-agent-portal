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

function generateMemberId(fullName: string): string {
  return fullName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 20);
}

async function findUniqueId(adminClient: ReturnType<typeof getAdminClient>, base: string): Promise<string> {
  let candidate = base;
  let suffix = 1;
  while (true) {
    const { data } = await adminClient.from('users').select('id').eq('id', candidate).maybeSingle();
    if (!data) return candidate;
    candidate = `${base.slice(0, 17)}_${suffix++}`;
  }
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
    return unauthorizedResponse('Account inactive');
  }

  if (currentUser.role !== 'agent') {
    return unauthorizedResponse('Only agent owner can manage team');
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
    return unauthorizedResponse('Account inactive');
  }

  if (currentUser.role !== 'agent') {
    return unauthorizedResponse('Only agent owner can create members');
  }

  const body = await req.json() as {
    email?: string;
    full_name?: string;
  };

  if (!body.email?.trim()) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }
  if (!body.full_name?.trim()) {
    return NextResponse.json({ error: 'Full name is required' }, { status: 400 });
  }

  const targetAgencyId = currentUser.agency_id || currentUser.id;
  const adminClient = getAdminClient();

  const baseId = generateMemberId(body.full_name.trim());
  const normalizedId = await findUniqueId(adminClient, baseId);

  const tempPassword = generateTempPassword();

  const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
    email: body.email.trim().toLowerCase(),
    password: tempPassword,
    email_confirm: true,
  });

  if (authErr) {
    const msg = authErr.message.toLowerCase();
    if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'Email already registered by another account' }, { status: 409 });
    }
    return NextResponse.json({ error: `Account creation failed: ${authErr.message}` }, { status: 400 });
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
    return NextResponse.json({ error: `User creation failed: ${dbErr.message}` }, { status: 500 });
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

export async function PATCH(req: NextRequest) {
  const result = await getAuthenticatedUser(req);
  if (!result) return unauthorizedResponse();

  const { data: currentUser } = await result.supabase
    .from('users')
    .select('id, role, status, agency_id')
    .eq('supabase_uid', result.user.id)
    .maybeSingle();

  if (!currentUser || currentUser.status !== 'active') {
    return unauthorizedResponse('Account inactive');
  }

  if (currentUser.role !== 'agent') {
    return unauthorizedResponse('Only agent owner can edit members');
  }

  const body = await req.json() as {
    memberId?: string;
    full_name?: string;
    status?: string;
  };

  if (!body.memberId) {
    return NextResponse.json({ error: 'memberId is required' }, { status: 400 });
  }

  const targetAgencyId = currentUser.agency_id || currentUser.id;
  const adminClient = getAdminClient();

  const { data: member } = await adminClient
    .from('users')
    .select('id, agency_id')
    .eq('id', body.memberId)
    .maybeSingle();

  if (!member || member.agency_id !== targetAgencyId) {
    return NextResponse.json({ error: 'Member not found in your team' }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (body.full_name !== undefined) updates.full_name = body.full_name.trim();
  if (body.status !== undefined && ['active', 'inactive'].includes(body.status)) updates.status = body.status;

  const { error } = await adminClient
    .from('users')
    .update(updates)
    .eq('id', body.memberId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
