import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getAdminUser, unauthorizedResponse } from '@/lib/auth-helpers';
import { isAdminRole } from '@/lib/permissions';

type UserProfile = {
  id: string;
  role: string | null;
  status: string | null;
  agency_id: string | null;
};

async function getCurrentProfile(auth: Awaited<ReturnType<typeof getAuthenticatedUser>>) {
  if (!auth) return null;
  const { data } = await auth.supabase
    .from('users')
    .select('id, role, status, agency_id')
    .eq('supabase_uid', auth.user.id)
    .maybeSingle();
  return data as UserProfile | null;
}

async function resolveEffectiveAgentId(auth: NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>, profile: UserProfile) {
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

async function canReadOrderPositions(
  auth: NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>,
  profile: UserProfile,
  orderId: string,
) {
  if (isAdminRole(profile.role)) return true;

  const effectiveAgentId = await resolveEffectiveAgentId(auth, profile);
  if (!effectiveAgentId) return false;

  const { data } = await auth.supabase
    .from('order_agents')
    .select('order_id')
    .eq('order_id', orderId)
    .eq('agent_id', effectiveAgentId)
    .maybeSingle();

  return !!data;
}

async function getOrderIndustry(auth: NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>, orderId: string) {
  const { data, error } = await auth.supabase
    .from('orders')
    .select('id, companies!orders_company_id_fkey(industry, en_industry)')
    .eq('id', orderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const company = (data as any).companies as { industry?: string | null; en_industry?: string | null } | null;
  return (company?.industry || company?.en_industry || 'Chưa phân ngành').trim();
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthenticatedUser(req);
  if (!auth) return unauthorizedResponse();

  const profile = await getCurrentProfile(auth);
  if (!profile || profile.status !== 'active') return unauthorizedResponse('Tài khoản không hoạt động');

  if (!(await canReadOrderPositions(auth, profile, params.id))) {
    return NextResponse.json({ error: 'Không có quyền xem vị trí của đơn hàng này' }, { status: 403 });
  }

  try {
    const industry = await getOrderIndustry(auth, params.id);
    if (!industry) return NextResponse.json({ error: 'Không tìm thấy đơn hàng' }, { status: 404 });

    const [positionsRes, quotasRes, candidatesRes] = await Promise.all([
      auth.supabase
        .from('job_positions')
        .select('*')
        .eq('industry', industry)
        .eq('is_active', true)
        .order('name'),
      auth.supabase
        .from('order_positions')
        .select('*, position:job_positions(*)')
        .eq('order_id', params.id)
        .order('created_at'),
      auth.supabase
        .from('candidates')
        .select('position_id, interview_status')
        .eq('order_id', params.id),
    ]);

    if (positionsRes.error) throw new Error(positionsRes.error.message);
    if (quotasRes.error) throw new Error(quotasRes.error.message);
    if (candidatesRes.error) throw new Error(candidatesRes.error.message);

    const assignedCounts = new Map<string, number>();
    for (const candidate of candidatesRes.data ?? []) {
      if (candidate.interview_status !== 'Passed' || !candidate.position_id) continue;
      assignedCounts.set(candidate.position_id, (assignedCounts.get(candidate.position_id) ?? 0) + 1);
    }

    const orderPositions = (quotasRes.data ?? []).map((row: any) => ({
      ...row,
      assigned_count: assignedCounts.get(row.position_id) ?? 0,
    }));

    return NextResponse.json({
      industry,
      positions: positionsRes.data ?? [],
      order_positions: orderPositions,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi tải vị trí' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAdminUser(req);
  if (!auth) return unauthorizedResponse();

  const body = await req.json() as { name?: string; industry?: string };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: 'Tên vị trí là bắt buộc' }, { status: 400 });

  try {
    const orderIndustry = await getOrderIndustry(auth, params.id);
    const industry = (body.industry || orderIndustry || '').trim();
    if (!industry) return NextResponse.json({ error: 'Ngành nghề là bắt buộc' }, { status: 400 });

    const { data: existing } = await auth.supabase
      .from('job_positions')
      .select('*')
      .eq('industry', industry)
      .ilike('name', name)
      .maybeSingle();

    if (existing) return NextResponse.json({ data: existing });

    const { data, error } = await auth.supabase
      .from('job_positions')
      .insert({ industry, name, is_active: true })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi tạo vị trí' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAdminUser(req);
  if (!auth) return unauthorizedResponse();

  const body = await req.json() as { position_id?: string; quantity?: number };
  if (!body.position_id) return NextResponse.json({ error: 'position_id là bắt buộc' }, { status: 400 });

  const quantity = Number(body.quantity ?? 0);
  if (!Number.isFinite(quantity) || quantity < 0) {
    return NextResponse.json({ error: 'Số lượng không hợp lệ' }, { status: 400 });
  }

  if (quantity === 0) {
    const { error } = await auth.supabase
      .from('order_positions')
      .delete()
      .eq('order_id', params.id)
      .eq('position_id', body.position_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data: null });
  }

  const { data, error } = await auth.supabase
    .from('order_positions')
    .upsert({
      order_id: params.id,
      position_id: body.position_id,
      quantity,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'order_id,position_id' })
    .select('*, position:job_positions(*)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
