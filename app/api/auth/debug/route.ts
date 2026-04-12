import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Endpoint chẩn đoán: xác định CHÍNH XÁC lỗi ở bước nào
// Chỉ dùng để debug — KHÔNG trả về thông tin nhạy cảm (email, tên, token)
export async function POST(req: NextRequest) {
  const steps: string[] = [];

  try {
    // Bước 1: Có Bearer token không?
    const token = req.headers.get('authorization')?.replace('Bearer ', '').trim();
    if (!token) {
      return NextResponse.json({ ok: false, failedAt: 'step1_no_token', steps });
    }
    steps.push('step1: token nhận được ✓');

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // Bước 2a: Validate token bằng anon client
    const anonClient = createClient(url, anonKey);
    const { data: anonData, error: anonErr } = await anonClient.auth.getUser(token);
    if (anonErr || !anonData.user) {
      steps.push(`step2a: anon getUser FAIL — ${anonErr?.message ?? 'no user'}`);
    } else {
      steps.push(`step2a: anon getUser OK — uid prefix ${anonData.user.id.slice(0, 8)}`);
    }

    // Bước 2b: Validate token bằng service role client (optional — có thể fail nếu key sai)
    const svcClient = createClient(url, serviceKey);
    const { data: svcData, error: svcErr } = await svcClient.auth.getUser(token);
    if (svcErr || !svcData.user) {
      steps.push(`step2b: service getUser FAIL — ${svcErr?.message ?? 'no user'} ← kiểm tra SUPABASE_SERVICE_ROLE_KEY trong Vercel`);
    } else {
      steps.push(`step2b: service getUser OK — uid prefix ${svcData.user.id.slice(0, 8)}`);
    }

    // Bước 2c: Validate + query role dùng user client (cách mới, không cần service role)
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData2, error: userErr2 } = await userClient.auth.getUser();
    if (userErr2 || !userData2.user) {
      steps.push(`step2c: user client getUser FAIL — ${userErr2?.message ?? 'no user'}`);
      return NextResponse.json({ ok: false, failedAt: 'step2_token_invalid', steps });
    }
    steps.push(`step2c: user client getUser OK — uid prefix ${userData2.user.id.slice(0, 8)}`);

    const userId = userData2.user.id;

    // Bước 3: Tìm user trong bảng agents (dùng user client)
    const { data: agent, error: agentErr } = await userClient
      .from('agents')
      .select('id, role, supabase_uid')
      .eq('supabase_uid', userId)
      .maybeSingle();

    if (agentErr) {
      steps.push(`step3: DB error — ${agentErr.message}`);
      return NextResponse.json({ ok: false, failedAt: 'step3_db_error', steps });
    }

    if (!agent) {
      steps.push(`step3: uid prefix ${userId.slice(0, 8)} KHÔNG TÌM THẤY trong bảng agents`);
      return NextResponse.json({ ok: false, failedAt: 'step3_uid_not_in_agents', steps });
    }
    steps.push(`step3: tìm thấy agent id=${agent.id} role=${agent.role}`);

    // Bước 4: Kiểm tra role
    if (agent.role !== 'admin') {
      steps.push(`step4: role="${agent.role}" — KHÔNG PHẢI admin`);
      return NextResponse.json({ ok: false, failedAt: 'step4_not_admin', steps });
    }
    steps.push('step4: role=admin ✓');

    return NextResponse.json({ ok: true, steps });
  } catch (err) {
    steps.push(`exception: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json({ ok: false, failedAt: 'exception', steps }, { status: 500 });
  }
}
