import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, company_name, en_company_name,
      job_type, job_type_en,
      total_labor, salary_usd,
      meal, meal_en, dormitory, dormitory_en,
      probation, probation_en,
      companies:company_id (company_media, avatar_url, en_company_name, en_industry, industry)
    `)
    .eq('id', params.id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}
