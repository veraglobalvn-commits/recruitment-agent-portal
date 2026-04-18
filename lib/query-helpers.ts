import { supabase } from '@/lib/supabase';
import type { AgentOption } from '@/lib/types';

export async function fetchActiveAgents(
  select = 'id, full_name, short_name',
): Promise<AgentOption[]> {
  const { data, error } = await supabase
    .from('users')
    .select(select)
    .neq('role', 'admin')
    .eq('status', 'active')
    .order('full_name');

  if (error) {
    console.error('[fetchActiveAgents]', error);
    return [];
  }
  return ((data || []) as unknown) as AgentOption[];
}

export async function fetchActiveAgencies<T = Record<string, unknown>>(
  select = 'id, company_name',
): Promise<T[]> {
  const { data, error } = await supabase
    .from('agencies')
    .select(select)
    .eq('status', 'active')
    .order('company_name');

  if (error) {
    console.error('[fetchActiveAgencies]', error);
    return [];
  }
  return (data || []) as T[];
}
