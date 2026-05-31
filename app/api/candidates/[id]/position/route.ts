import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth-helpers';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

type UserProfile = {
  id: string;
  role: string | null;
  status: string | null;
  agency_id: string | null;
  permissions?: string[] | null;
};

async function resolveEffectiveAgentId(
  auth: NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>,
  profile: UserProfile,
) {
  if (profile.role !== 'member') return profile.id;
  if (!profile.agency_id) return null;
  const { data } = await auth.supabase
    .from('users')
    .select('id')
    .eq('agency_id', profile.agency_id)
    .eq('role', 'agent')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await getAuthenticatedUser(req);
  if (!auth) return unauthorizedResponse();

  const { data: currentUser } = await auth.supabase
    .from('users')
    .select('id, role, status, agency_id, permissions')
    .eq('supabase_uid', auth.user.id)
    .maybeSingle();

  const profile = currentUser as UserProfile | null;
  if (!profile || profile.status !== 'active') return unauthorizedResponse('Tài khoản không hoạt động');

  if (!hasPermission(profile, PERMISSIONS.EDIT_CANDIDATES)) {
    return NextResponse.json({ error: 'Không có quyền cập nhật ứng viên' }, { status: 403 });
  }

  const body = await req.json() as { position_id?: string | null };
  const positionId = body.position_id || null;

  const { data: candidate, error: candidateErr } = await auth.supabase
    .from('candidates')
    .select('id_ld, order_id, agent_id, interview_status')
    .eq('id_ld', params.id)
    .maybeSingle();

  if (candidateErr) return NextResponse.json({ error: candidateErr.message }, { status: 500 });
  if (!candidate) return NextResponse.json({ error: 'Không tìm thấy ứng viên' }, { status: 404 });

  if (profile.role !== 'admin' && profile.role !== 'operator') {
    const effectiveAgentId = await resolveEffectiveAgentId(auth, profile);
    if (!effectiveAgentId || candidate.agent_id !== effectiveAgentId) {
      return NextResponse.json({ error: 'Không có quyền cập nhật ứng viên này' }, { status: 403 });
    }
  }

  if (positionId && candidate.interview_status !== 'Passed') {
    return NextResponse.json({ error: 'Chỉ gán vị trí sau khi ứng viên đã Passed' }, { status: 400 });
  }

  if (positionId) {
    const { data: orderPosition, error: orderPositionErr } = await auth.supabase
      .from('order_positions')
      .select('position_id, quantity')
      .eq('order_id', candidate.order_id)
      .eq('position_id', positionId)
      .maybeSingle();

    if (orderPositionErr) return NextResponse.json({ error: orderPositionErr.message }, { status: 500 });
    if (!orderPosition || (orderPosition.quantity ?? 0) <= 0) {
      return NextResponse.json({ error: 'Vị trí chưa được cấu hình cho đơn hàng này' }, { status: 400 });
    }
  }

  const { data, error } = await auth.supabase
    .from('candidates')
    .update({ position_id: positionId })
    .eq('id_ld', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
