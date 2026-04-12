import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// POST /api/auth/lookup
// Body: { username: string }
// Returns: { email: string } hoặc { error: string }
// Mục đích: Tìm email từ agent ID (VD: NAM_2026) để dùng signInWithPassword phía client
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { username?: string };
    const username = body.username?.trim();

    if (!username) {
      return NextResponse.json({ error: 'Tên đăng nhập là bắt buộc' }, { status: 400 });
    }

    // Nếu có @ thì đây là email, trả về luôn
    if (username.includes('@')) {
      return NextResponse.json({ email: username.toLowerCase() });
    }

    const supabase = getAdminClient();

    // Tìm agent theo id (case-insensitive), VD: NAM_2026
    const { data: agent, error: agentErr } = await supabase
      .from('agents')
      .select('supabase_uid')
      .ilike('id', username)
      .maybeSingle();

    if (agentErr) {
      return NextResponse.json({ error: 'Lỗi truy vấn' }, { status: 500 });
    }

    if (!agent?.supabase_uid) {
      return NextResponse.json({ error: 'Không tìm thấy tài khoản với ID này (VD: NAM_2026)' }, { status: 404 });
    }

    // Lấy email từ Supabase Auth bằng UID
    const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(agent.supabase_uid);

    if (userErr || !userData?.user?.email) {
      return NextResponse.json({ error: 'Không thể lấy thông tin tài khoản' }, { status: 500 });
    }

    return NextResponse.json({ email: userData.user.email });
  } catch (err) {
    console.error('[auth/lookup] Error:', err);
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 });
  }
}
