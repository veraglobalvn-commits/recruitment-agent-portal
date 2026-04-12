import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Xác thực admin qua Bearer token (client gọi getUser() trước để đảm bảo token fresh)
async function getAdminFromRequest(req: NextRequest): Promise<ReturnType<typeof getAdminClient> | null> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!token) return null;

  const adminClient = getAdminClient();

  // Validate user JWT bằng service role client
  const { data: { user }, error } = await adminClient.auth.getUser(token);
  if (error || !user) return null;

  // Kiểm tra role admin trong DB
  const { data: agent } = await adminClient
    .from('agents')
    .select('role')
    .eq('supabase_uid', user.id)
    .maybeSingle();

  if (!agent || agent.role !== 'admin') return null;
  return adminClient;
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
      role?: string;
    };

    const { email, password, full_name, short_name, role } = body;

    if (!email || !password || !full_name) {
      return NextResponse.json(
        { error: 'email, password, full_name là bắt buộc' },
        { status: 400 },
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Mật khẩu phải có ít nhất 6 ký tự' },
        { status: 400 },
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

    const shortNameVal = short_name?.trim() || full_name.trim().split(' ').pop() || 'AGENT';
    const agentId = `${shortNameVal.toUpperCase().replace(/\s+/g, '_')}_${new Date().getFullYear()}`;

    const assignedRole = (role === 'admin' || role === 'agent') ? role : 'agent';

    const { data: agentData, error: dbErr } = await adminClient
      .from('agents')
      .insert({
        id: agentId,
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
