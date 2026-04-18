import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser, unauthorizedResponse } from '@/lib/auth-helpers';

export async function GET(req: NextRequest) {
  const auth = await getAdminUser(req);
  if (!auth) return unauthorizedResponse();

  const { data, error } = await auth.supabase
    .from('users')
    .select('id, full_name, short_name, role, status, agency_id, permissions, avatar_url, created_at');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ agents: data });
}
