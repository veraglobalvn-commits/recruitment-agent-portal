import { supabase } from '@/lib/supabase';
import type { AgentOption } from '@/lib/types';

// In-memory cache keyed by select string, TTL = 5 minutes
const agentsCache = new Map<string, { data: AgentOption[]; ts: number }>();
const AGENT_CACHE_TTL = 5 * 60 * 1000;

export async function fetchActiveAgents(
  select = 'id, full_name, short_name',
): Promise<AgentOption[]> {
  const cached = agentsCache.get(select);
  if (cached && Date.now() - cached.ts < AGENT_CACHE_TTL) return cached.data;

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
  const result = ((data || []) as unknown) as AgentOption[];
  agentsCache.set(select, { data: result, ts: Date.now() });
  return result;
}

export function invalidateAgentsCache() {
  agentsCache.clear();
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
