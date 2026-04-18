import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

export async function getAuthenticatedUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) return null;

  const supabase = getAdminClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) return null;
  return { user, supabase };
}

export async function getAdminUser(req: NextRequest) {
  const result = await getAuthenticatedUser(req);
  if (!result) return null;

  const { data: agent } = await result.supabase
    .from('users')
    .select('role')
    .eq('supabase_uid', result.user.id)
    .single();

  if (!agent || agent.role !== 'admin') return null;
  return result;
}

export function unauthorizedResponse(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}
