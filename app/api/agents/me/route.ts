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
  let ownerAgentId: string | null = null;

  if (userData.agency_id) {
    const [agRes, ownerRes] = await Promise.all([
      result.supabase
        .from('agencies')
        .select('id, company_name, license_no, status')
        .eq('id', userData.agency_id)
        .maybeSingle(),
      // For members: resolve the owner agent in the same agency (role='agent')
      userData.role === 'member'
        ? result.supabase
            .from('users')
            .select('id')
            .eq('agency_id', userData.agency_id)
            .eq('role', 'agent')
            .eq('status', 'active')
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    agencyData = agRes.data;
    if (ownerRes.data?.id) ownerAgentId = ownerRes.data.id as string;
  }

  return NextResponse.json({ user: userData, agency: agencyData, owner_agent_id: ownerAgentId });
}
