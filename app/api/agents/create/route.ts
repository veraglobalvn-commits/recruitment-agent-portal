import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ROLE_PERMISSIONS } from '@/lib/permissions';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getAdminClient() {
  return createClient(url, serviceKey);
}

async function getAdminFromRequest(req: NextRequest): Promise<ReturnType<typeof getAdminClient> | null> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!token) return null;

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return null;

  const { data: agent, error: agentErr } = await userClient
    .from('users')
    .select('role')
    .eq('supabase_uid', user.id)
    .maybeSingle();

  if (agentErr || !agent || agent.role !== 'admin') return null;

  return getAdminClient();
}

function generateUserId(email: string): string {
  const localPart = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return localPart.slice(0, 20);
}

export async function POST(req: NextRequest) {
  try {
    const adminClient = await getAdminFromRequest(req);
    if (!adminClient) {
      return NextResponse.json({ error: 'Chỉ admin mới được tạo tài khoản' }, { status: 401 });
    }

    const body = await req.json() as {
      email?: string;
      full_name?: string;
      agent_id?: string;
      role?: string;
      agency_id?: string;
    };

    const { email, role, agency_id } = body;

    if (!email?.trim()) {
      return NextResponse.json({ error: 'Email là bắt buộc' }, { status: 400 });
    }

    const assignedRole = role || 'agent';
    if (!['admin', 'agent', 'manager', 'operator'].includes(assignedRole)) {
      return NextResponse.json({ error: 'Role không hợp lệ' }, { status: 400 });
    }

    if ((assignedRole === 'manager' || assignedRole === 'operator') && !agency_id) {
      return NextResponse.json({ error: 'Agency là bắt buộc cho manager/operator' }, { status: 400 });
    }

    const normalizedAgentId = (body.agent_id?.trim() || generateUserId(email)).toUpperCase();

    const { data: existingById } = await adminClient
      .from('users')
      .select('id')
      .ilike('id', normalizedAgentId)
      .maybeSingle();
    if (existingById) {
      return NextResponse.json({ error: `User "${normalizedAgentId}" đã tồn tại` }, { status: 409 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || url;
    const { data: authData, error: authErr } = await adminClient.auth.admin.inviteUserByEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${baseUrl}/auth/callback` },
    );

    if (authErr) {
      const msg = authErr.message.toLowerCase();
      if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('duplicate')) {
        return NextResponse.json({ error: 'Email đã được đăng ký bởi tài khoản khác' }, { status: 409 });
      }
      return NextResponse.json({ error: `Gửi lời mời thất bại: ${authErr.message}` }, { status: 400 });
    }

    const uid = authData.user.id;
    const defaultPerms = ROLE_PERMISSIONS[assignedRole] || [];

    const insertData: Record<string, unknown> = {
      id: normalizedAgentId,
      supabase_uid: uid,
      full_name: body.full_name?.trim() || null,
      short_name: normalizedAgentId,
      role: assignedRole,
      permissions: defaultPerms,
      status: 'active',
    };

    if (assignedRole === 'agent' && agency_id) {
      insertData.agency_id = agency_id;
    } else if (assignedRole === 'agent' && !agency_id) {
      insertData.agency_id = normalizedAgentId;
    } else if (agency_id) {
      insertData.agency_id = agency_id;
    }

    const { data: agentData, error: dbErr } = await adminClient
      .from('users')
      .insert(insertData)
      .select()
      .single();

    if (dbErr) {
      await adminClient.auth.admin.deleteUser(uid);
      const dbMsg = dbErr.message.toLowerCase();
      if (dbMsg.includes('duplicate') || dbMsg.includes('unique') || dbMsg.includes('already exists')) {
        return NextResponse.json({ error: 'User ID đã tồn tại' }, { status: 409 });
      }
      return NextResponse.json({ error: `Tạo user thất bại: ${dbErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ agent: agentData, status: 'invite_sent' });
  } catch (err) {
    console.error('[agents/create] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
