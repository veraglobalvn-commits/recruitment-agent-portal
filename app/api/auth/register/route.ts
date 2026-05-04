import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ROLE_PERMISSIONS } from '@/lib/permissions';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

function generateUserId(email: string): string {
  const localPart = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return localPart.slice(0, 20);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      email?: string;
      full_name?: string;
      password?: string;
      company_name?: string;
    };

    const { email, full_name, password, company_name } = body;

    if (!email?.trim()) {
      return NextResponse.json({ error: 'Email là bắt buộc' }, { status: 400 });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ error: 'Email không hợp lệ' }, { status: 400 });
    }
    if (!full_name?.trim()) {
      return NextResponse.json({ error: 'Họ tên là bắt buộc' }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'Mật khẩu phải có ít nhất 8 ký tự' }, { status: 400 });
    }

    const adminClient = getAdminClient();
    const normalizedEmail = email.trim().toLowerCase();

    const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
    });

    if (authErr) {
      const msg = authErr.message.toLowerCase();
      if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('duplicate')) {
        return NextResponse.json({ error: 'Email đã được đăng ký, vui lòng đăng nhập' }, { status: 409 });
      }
      return NextResponse.json({ error: `Tạo tài khoản thất bại: ${authErr.message}` }, { status: 400 });
    }

    const uid = authData.user.id;
    const generatedId = generateUserId(normalizedEmail);

    // Ensure unique ID
    let finalId = generatedId;
    let suffix = 1;
    const MAX_ID_ATTEMPTS = 10;
    while (suffix <= MAX_ID_ATTEMPTS) {
      const { data: existing } = await adminClient
        .from('users')
        .select('id')
        .ilike('id', finalId)
        .maybeSingle();
      if (!existing) break;
      if (suffix === MAX_ID_ATTEMPTS) {
        await adminClient.auth.admin.deleteUser(uid).catch(e => console.error('[register] Rollback failed:', e));
        return NextResponse.json({ error: 'Không thể tạo ID người dùng' }, { status: 500 });
      }
      finalId = `${generatedId}${suffix}`;
      suffix++;
    }

    // Step 1: Create agency row first (FK agencies.id must exist before users.agency_id)
    let agencyInsertErr: { code?: string; message: string } | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await adminClient
        .from('agencies')
        .insert({
          id: finalId,
          company_name: company_name?.trim() || null,
          status: 'active',
        });
      agencyInsertErr = error;
      if (!error) break;
      if (error.code !== '23505') break;
      finalId = `${generatedId}${suffix}`;
      suffix++;
    }

    if (agencyInsertErr) {
      await adminClient.auth.admin.deleteUser(uid).catch(e => console.error('[register] Rollback failed:', e));
      return NextResponse.json({ error: `Tạo agency thất bại: ${agencyInsertErr.message}` }, { status: 500 });
    }

    // Step 2: Create user row with agency_id pointing to the agency just created
    const defaultPerms = ROLE_PERMISSIONS['agent'] || [];
    const { error: dbErr } = await adminClient
      .from('users')
      .insert({
        id: finalId,
        supabase_uid: uid,
        full_name: full_name.trim(),
        short_name: finalId,
        role: 'agent',
        permissions: defaultPerms,
        status: 'pending',
        agency_id: finalId,
      });

    if (dbErr) {
      // Rollback: delete agency then auth user
      await adminClient.from('agencies').delete().eq('id', finalId).then(
        ({ error: rbErr }) => { if (rbErr) console.error('[register] Rollback failed:', rbErr); },
        (e: unknown) => console.error('[register] Rollback failed:', e),
      );
      await adminClient.auth.admin.deleteUser(uid).catch((e: unknown) => console.error('[register] Rollback failed:', e));
      return NextResponse.json({ error: `Tạo hồ sơ thất bại: ${dbErr.message}` }, { status: 500 });
    }

    return NextResponse.json(
      { message: 'Đăng ký thành công. Vui lòng chờ admin kích hoạt tài khoản.' },
      { status: 201 },
    );
  } catch (err) {
    console.error('[auth/register] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
