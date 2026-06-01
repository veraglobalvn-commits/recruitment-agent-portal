import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser, unauthorizedResponse } from '@/lib/auth-helpers';

type PostBody =
  | { type: 'industry'; name_vi?: string; name_en?: string | null }
  | { type: 'position'; industry_id?: string; name_vi?: string; name_en?: string | null; description_en?: string | null; default_weight_percent?: number | string | null };

type PatchBody =
  | { type: 'industry'; id?: string; name_vi?: string; name_en?: string | null; is_active?: boolean }
  | { type: 'position'; id?: string; industry_id?: string; name_vi?: string; name_en?: string | null; description_en?: string | null; default_weight_percent?: number | string | null; is_active?: boolean };

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseWeight(value: unknown) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return parsed;
}

async function listCatalog(auth: NonNullable<Awaited<ReturnType<typeof getAdminUser>>>) {
  const [industriesRes, positionsRes] = await Promise.all([
    auth.supabase.from('job_industries').select('*').order('name_vi'),
    auth.supabase.from('job_positions').select('*').order('name_vi'),
  ]);

  if (industriesRes.error) throw new Error(industriesRes.error.message);
  if (positionsRes.error) throw new Error(positionsRes.error.message);

  const positions = positionsRes.data ?? [];
  return (industriesRes.data ?? []).map((industry) => ({
    ...industry,
    positions: positions.filter((position) => position.industry_id === industry.id),
  }));
}

export async function GET(req: NextRequest) {
  const auth = await getAdminUser(req);
  if (!auth) return unauthorizedResponse('Admin access required');

  try {
    return NextResponse.json({ industries: await listCatalog(auth) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Không tải được danh mục' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await getAdminUser(req);
  if (!auth) return unauthorizedResponse('Admin access required');

  const body = await req.json() as PostBody;

  if (body.type === 'industry') {
    const nameVi = cleanText(body.name_vi);
    if (!nameVi) return NextResponse.json({ error: 'Tên ngành nghề là bắt buộc' }, { status: 400 });

    const { data, error } = await auth.supabase
      .from('job_industries')
      .insert({ name_vi: nameVi, name_en: cleanText(body.name_en) || null })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  if (body.type === 'position') {
    const nameVi = cleanText(body.name_vi);
    const industryId = cleanText(body.industry_id);
    const weight = parseWeight(body.default_weight_percent);
    if (!industryId) return NextResponse.json({ error: 'Ngành nghề là bắt buộc' }, { status: 400 });
    if (!nameVi) return NextResponse.json({ error: 'Tên vị trí là bắt buộc' }, { status: 400 });
    if (weight === null) return NextResponse.json({ error: 'Tỷ trọng phải từ 0 đến 100' }, { status: 400 });

    const { data: industry, error: industryErr } = await auth.supabase
      .from('job_industries')
      .select('id, name_vi')
      .eq('id', industryId)
      .maybeSingle();
    if (industryErr) return NextResponse.json({ error: industryErr.message }, { status: 500 });
    if (!industry) return NextResponse.json({ error: 'Không tìm thấy ngành nghề' }, { status: 404 });

    const { data, error } = await auth.supabase
      .from('job_positions')
      .insert({
        industry_id: industry.id,
        industry: industry.name_vi,
        name: nameVi,
        name_vi: nameVi,
        name_en: cleanText(body.name_en) || null,
        description_en: cleanText(body.description_en) || null,
        default_weight_percent: weight,
        is_active: true,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  return NextResponse.json({ error: 'Loại dữ liệu không hợp lệ' }, { status: 400 });
}

export async function PATCH(req: NextRequest) {
  const auth = await getAdminUser(req);
  if (!auth) return unauthorizedResponse('Admin access required');

  const body = await req.json() as PatchBody;
  const id = cleanText(body.id);
  if (!id) return NextResponse.json({ error: 'id là bắt buộc' }, { status: 400 });

  if (body.type === 'industry') {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name_vi !== undefined) {
      const nameVi = cleanText(body.name_vi);
      if (!nameVi) return NextResponse.json({ error: 'Tên ngành nghề là bắt buộc' }, { status: 400 });
      updates.name_vi = nameVi;
    }
    if (body.name_en !== undefined) updates.name_en = cleanText(body.name_en) || null;
    if (body.is_active !== undefined) updates.is_active = body.is_active;

    const { data, error } = await auth.supabase
      .from('job_industries')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  if (body.type === 'position') {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name_vi !== undefined) {
      const nameVi = cleanText(body.name_vi);
      if (!nameVi) return NextResponse.json({ error: 'Tên vị trí là bắt buộc' }, { status: 400 });
      updates.name_vi = nameVi;
      updates.name = nameVi;
    }
    if (body.name_en !== undefined) updates.name_en = cleanText(body.name_en) || null;
    if (body.description_en !== undefined) updates.description_en = cleanText(body.description_en) || null;
    if (body.default_weight_percent !== undefined) {
      const weight = parseWeight(body.default_weight_percent);
      if (weight === null) return NextResponse.json({ error: 'Tỷ trọng phải từ 0 đến 100' }, { status: 400 });
      updates.default_weight_percent = weight;
    }
    if (body.is_active !== undefined) updates.is_active = body.is_active;

    if (body.industry_id !== undefined) {
      const industryId = cleanText(body.industry_id);
      if (!industryId) return NextResponse.json({ error: 'Ngành nghề là bắt buộc' }, { status: 400 });
      const { data: industry, error: industryErr } = await auth.supabase
        .from('job_industries')
        .select('id, name_vi')
        .eq('id', industryId)
        .maybeSingle();
      if (industryErr) return NextResponse.json({ error: industryErr.message }, { status: 500 });
      if (!industry) return NextResponse.json({ error: 'Không tìm thấy ngành nghề' }, { status: 404 });
      updates.industry_id = industry.id;
      updates.industry = industry.name_vi;
    }

    const { data, error } = await auth.supabase
      .from('job_positions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  return NextResponse.json({ error: 'Loại dữ liệu không hợp lệ' }, { status: 400 });
}
