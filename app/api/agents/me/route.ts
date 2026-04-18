import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth-helpers';

export async function GET(req: NextRequest) {
  const result = await getAuthenticatedUser(req);
  if (!result) return unauthorizedResponse();

  const { data: userData, error } = await result.supabase
    .from('users')
    .select('id, supabase_uid, full_name, short_name, role, status, agency_id, permissions, avatar_url')
    .eq('supabase_uid', result.user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!userData) return NextResponse.json({ error: 'Không tìm thấy user' }, { status: 404 });

  let agencyData = null;
  if (userData.agency_id) {
    const { data: ag } = await result.supabase
      .from('agencies')
      .select('id, company_name, license_no, status')
      .eq('id', userData.agency_id)
      .maybeSingle();
    agencyData = ag;
  }

  return NextResponse.json({ user: userData, agency: agencyData });
}
