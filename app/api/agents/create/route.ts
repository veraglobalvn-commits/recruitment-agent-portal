import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminUser, unauthorizedResponse } from '@/lib/auth-helpers';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await getAdminUser(req);
    if (!authResult) return unauthorizedResponse('Chỉ admin mới được tạo agent');

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

    const supabase = getAdminClient();

    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
    });

    if (authErr) {
      return NextResponse.json(
        { error: `Tạo tài khoản thất bại: ${authErr.message}` },
        { status: 400 },
      );
    }

    const uid = authData.user.id;

    const shortNameVal = short_name?.trim() || full_name.trim().split(' ').pop() || 'AGENT';
    const agentId = `${shortNameVal.toUpperCase().replace(/\s+/g, '_')} ${new Date().getFullYear()}`;

    const assignedRole = (role === 'admin' || role === 'agent') ? role : 'agent';

    const { data: agentData, error: dbErr } = await supabase
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
      await supabase.auth.admin.deleteUser(uid);
      return NextResponse.json(
        { error: `Tạo agent thất bại: ${dbErr.message}` },
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
