import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getAdminClient() {
  return createClient(url, serviceKey);
}

// Xác thực admin qua Bearer token
// - Dùng anon client cho validate JWT + role check (không cần service role)
// - Service role chỉ dùng cho thao tác thực sự cần bypass RLS (createUser, insert agent)
async function getAdminFromRequest(req: NextRequest): Promise<ReturnType<typeof getAdminClient> | null> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!token) {
    console.error('[agents/create] AUTH FAIL: không có Bearer token trong request');
    return null;
  }

  // Validate JWT + query role dùng anon client + user token (không phụ thuộc service role key)
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) {
    console.error('[agents/create] AUTH FAIL: token không hợp lệ —', userErr?.message ?? 'no user returned');
    return null;
  }

  // Query role qua user client (RLS cho phép user đọc record của chính mình)
  const { data: agent, error: agentErr } = await userClient
    .from('agents')
    .select('role')
    .eq('supabase_uid', user.id)
    .maybeSingle();

  if (agentErr) {
    console.error('[agents/create] AUTH FAIL: DB error khi tìm agent —', agentErr.message);
    return null;
  }
  if (!agent) {
    console.error('[agents/create] AUTH FAIL: uid', user.id.slice(0, 8), '... không có trong bảng agents');
    return null;
  }
  if (agent.role !== 'admin') {
    console.error('[agents/create] AUTH FAIL: role =', agent.role, '(cần admin)');
    return null;
  }

  return getAdminClient(); // service role chỉ dùng từ đây trở đi
}

export async function POST(req: NextRequest) {
  try {
    const adminClient = await getAdminFromRequest(req);
    if (!adminClient) {
      return NextResponse.json({ error: 'Chỉ admin mới được tạo tài khoản' }, { status: 401 });
    }

    const body = await req.json() as {
      email?: string;
      password?: string;
      full_name?: string;
      short_name?: string;
      agent_id?: string;
      role?: string;
    };

    const { email, password, full_name, short_name, agent_id, role } = body;

    if (!email || !password || !full_name) {
      return NextResponse.json(
        { error: 'email, password, full_name là bắt buộc' },
        { status: 400 },
      );
    }

    if (!agent_id?.trim()) {
      return NextResponse.json(
        { error: 'Agent ID là bắt buộc' },
        { status: 400 },
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Mật khẩu phải có ít nhất 6 ký tự' },
        { status: 400 },
      );
    }

    // Kiểm tra trùng agent_id
    const normalizedAgentId = agent_id.trim().toUpperCase();
    const { data: existingById } = await adminClient
      .from('agents')
      .select('id')
      .ilike('id', normalizedAgentId)
      .maybeSingle();
    if (existingById) {
      return NextResponse.json(
        { error: `Agent ID "${normalizedAgentId}" đã tồn tại` },
        { status: 409 },
      );
    }

    // Kiểm tra trùng short_name (dùng để đăng nhập bằng username)
    if (short_name?.trim()) {
      const { data: existingByShortName } = await adminClient
        .from('agents')
        .select('id')
        .ilike('short_name', short_name.trim())
        .maybeSingle();
      if (existingByShortName) {
        return NextResponse.json(
          { error: `Tên viết tắt "${short_name.trim()}" đã được sử dụng bởi tài khoản khác` },
          { status: 409 },
        );
      }
    }

    const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
    });

    if (authErr) {
      // Map lỗi tiếng Anh của Supabase sang tiếng Việt thân thiện
      const msg = authErr.message.toLowerCase();
      if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('duplicate')) {
        return NextResponse.json({ error: 'Email này đã được đăng ký bởi tài khoản khác' }, { status: 409 });
      }
      return NextResponse.json(
        { error: `Tạo tài khoản thất bại: ${authErr.message}` },
        { status: 400 },
      );
    }

    const uid = authData.user.id;

    const assignedRole = (role === 'admin' || role === 'agent') ? role : 'agent';

    const { data: agentData, error: dbErr } = await adminClient
      .from('agents')
      .insert({
        id: normalizedAgentId,
        supabase_uid: uid,
        full_name: full_name.trim(),
        short_name: short_name?.trim() || null,
        role: assignedRole,
      })
      .select()
      .single();

    if (dbErr) {
      await adminClient.auth.admin.deleteUser(uid);
      const dbMsg = dbErr.message.toLowerCase();
      if (dbMsg.includes('duplicate') || dbMsg.includes('unique') || dbMsg.includes('already exists')) {
        return NextResponse.json(
          { error: `Tên viết tắt hoặc ID tài khoản đã tồn tại, vui lòng dùng tên khác` },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: `Tạo tài khoản thất bại: ${dbErr.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ agent: agentData });
  } catch (err) {
    console.error('[agents/create] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
