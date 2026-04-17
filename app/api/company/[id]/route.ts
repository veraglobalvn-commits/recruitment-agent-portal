import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth-helpers';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return unauthorizedResponse();

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  const { data, error } = await supabaseAdmin
    .from('companies')
    .select('en_company_name, factory_video_url, job_video_url, company_media')
    .eq('id', params.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data });
}
