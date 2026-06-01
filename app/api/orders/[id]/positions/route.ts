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
    .select('id, industry_id, industry:job_industries(id, name_vi, name_en)')
    .eq('id', orderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const industry = (data as any).industry as { id: string; name_vi: string; name_en?: string | null } | null;
  return {
    industry_id: (data as any).industry_id as string | null,
    industry_name: industry?.name_vi ?? '',
    industry,
  };
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
    const orderIndustry = await getOrderIndustry(auth, params.id);
    if (!orderIndustry) return NextResponse.json({ error: 'Không tìm thấy đơn hàng' }, { status: 404 });

    const [industriesRes, positionsRes, quotasRes, candidatesRes] = await Promise.all([
      auth.supabase
        .from('job_industries')
        .select('*')
        .eq('is_active', true)
        .order('name_vi'),
      orderIndustry.industry_id ? auth.supabase
        .from('job_positions')
        .select('*')
        .eq('industry_id', orderIndustry.industry_id)
        .eq('is_active', true)
        .order('name_vi') : Promise.resolve({ data: [], error: null }),
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

    if (industriesRes.error) throw new Error(industriesRes.error.message);
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
      industry: orderIndustry.industry_name,
      industry_id: orderIndustry.industry_id,
      order_industry: orderIndustry.industry,
      industries: industriesRes.data ?? [],
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

  const body = await req.json() as { name?: string; industry_id?: string };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: 'Tên vị trí là bắt buộc' }, { status: 400 });

  try {
    const orderIndustry = await getOrderIndustry(auth, params.id);
    const industryId = (body.industry_id || orderIndustry?.industry_id || '').trim();
    if (!industryId) return NextResponse.json({ error: 'Ngành nghề là bắt buộc' }, { status: 400 });

    const { data: industry, error: industryErr } = await auth.supabase
      .from('job_industries')
      .select('id, name_vi')
      .eq('id', industryId)
      .maybeSingle();
    if (industryErr) return NextResponse.json({ error: industryErr.message }, { status: 500 });
    if (!industry) return NextResponse.json({ error: 'Không tìm thấy ngành nghề' }, { status: 404 });

    const { data: existing } = await auth.supabase
      .from('job_positions')
      .select('*')
      .eq('industry_id', industry.id)
      .ilike('name_vi', name)
      .maybeSingle();

    if (existing) return NextResponse.json({ data: existing });

    const { data, error } = await auth.supabase
      .from('job_positions')
      .insert({ industry_id: industry.id, industry: industry.name_vi, name, name_vi: name, is_active: true })
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

  const body = await req.json() as { industry_id?: string | null; position_id?: string; quantity?: number };
  if ('industry_id' in body) {
    const industryId = body.industry_id || null;
    if (industryId) {
      const { data: industry, error: industryErr } = await auth.supabase
        .from('job_industries')
        .select('id')
        .eq('id', industryId)
        .maybeSingle();
      if (industryErr) return NextResponse.json({ error: industryErr.message }, { status: 500 });
      if (!industry) return NextResponse.json({ error: 'Không tìm thấy ngành nghề' }, { status: 404 });
    }

    const { error: orderErr } = await auth.supabase
      .from('orders')
      .update({ industry_id: industryId })
      .eq('id', params.id);
    if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });

    if (industryId) {
      const { data: validPositions, error: validErr } = await auth.supabase
        .from('job_positions')
        .select('id')
        .eq('industry_id', industryId);
      if (validErr) return NextResponse.json({ error: validErr.message }, { status: 500 });

      const validIds = new Set((validPositions ?? []).map((position) => position.id));
      const [currentQuotas, currentCandidates] = await Promise.all([
        auth.supabase.from('order_positions').select('position_id').eq('order_id', params.id),
        auth.supabase.from('candidates').select('position_id').eq('order_id', params.id).not('position_id', 'is', null),
      ]);
      if (currentQuotas.error) return NextResponse.json({ error: currentQuotas.error.message }, { status: 500 });
      if (currentCandidates.error) return NextResponse.json({ error: currentCandidates.error.message }, { status: 500 });

      const invalidQuotaIds = Array.from(new Set((currentQuotas.data ?? []).map((row) => row.position_id).filter((positionId) => !validIds.has(positionId))));
      const invalidCandidateIds = Array.from(new Set((currentCandidates.data ?? []).map((row) => row.position_id).filter((positionId) => positionId && !validIds.has(positionId))));

      if (invalidQuotaIds.length > 0) {
        const { error: quotaErr } = await auth.supabase
          .from('order_positions')
          .delete()
          .eq('order_id', params.id)
          .in('position_id', invalidQuotaIds);
        if (quotaErr) return NextResponse.json({ error: quotaErr.message }, { status: 500 });
      }

      if (invalidCandidateIds.length > 0) {
        const { error: candidateErr } = await auth.supabase
          .from('candidates')
          .update({ position_id: null })
          .eq('order_id', params.id)
          .in('position_id', invalidCandidateIds);
        if (candidateErr) return NextResponse.json({ error: candidateErr.message }, { status: 500 });
      }
    } else {
      const [quotaRes, candidateRes] = await Promise.all([
        auth.supabase.from('order_positions').delete().eq('order_id', params.id),
        auth.supabase.from('candidates').update({ position_id: null }).eq('order_id', params.id),
      ]);
      if (quotaRes.error) return NextResponse.json({ error: quotaRes.error.message }, { status: 500 });
      if (candidateRes.error) return NextResponse.json({ error: candidateRes.error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  if (!body.position_id) return NextResponse.json({ error: 'position_id là bắt buộc' }, { status: 400 });

  const quantity = Number(body.quantity ?? 0);
  if (!Number.isFinite(quantity) || quantity < 0) {
    return NextResponse.json({ error: 'Số lượng không hợp lệ' }, { status: 400 });
  }

  if (quantity === 0) {
    const [quotaRes, candidateRes] = await Promise.all([
      auth.supabase
        .from('order_positions')
        .delete()
        .eq('order_id', params.id)
        .eq('position_id', body.position_id),
      auth.supabase
        .from('candidates')
        .update({ position_id: null })
        .eq('order_id', params.id)
        .eq('position_id', body.position_id),
    ]);
    if (quotaRes.error) return NextResponse.json({ error: quotaRes.error.message }, { status: 500 });
    if (candidateRes.error) return NextResponse.json({ error: candidateRes.error.message }, { status: 500 });
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
