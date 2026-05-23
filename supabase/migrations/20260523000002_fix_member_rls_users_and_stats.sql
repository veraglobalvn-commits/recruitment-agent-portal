-- Fix RLS: member role needs to read users in same agency (to resolve owner_agent_id)
-- and read recruitment_stats view (for dashboard stats).
--
-- Root cause: users_agent_team policy only allows role='agent' to read team.
-- Member only has users_read_self → cannot query owner's ID from users table
-- → fetchDashboardData and fetchCandidates (direct URL) fail silently.

BEGIN;

-- USERS: allow member to SELECT users within same agency (needed to look up owner_agent_id)
DROP POLICY IF EXISTS "users_member_read_agency" ON public.users;
CREATE POLICY "users_member_read_agency" ON public.users FOR SELECT USING (
  get_current_user_role() = 'member'
  AND agency_id = get_current_user_agency_id()
  AND get_current_user_agency_id() IS NOT NULL
);

-- RECRUITMENT_STATS: allow member to SELECT (view stats using owner's agent_id)
-- recruitment_stats is a view — enable RLS and add policy if it's a materialized view,
-- or grant SELECT if it's a regular view (views do not have RLS by default).
-- We use DO block to handle both cases gracefully.
DO $$
BEGIN
  -- Try to enable RLS on recruitment_stats (works for materialized views and tables)
  -- For regular views this will raise an exception which we catch and ignore
  BEGIN
    EXECUTE 'ALTER TABLE public.recruitment_stats ENABLE ROW LEVEL SECURITY';
    EXECUTE $policy$
      DROP POLICY IF EXISTS "recruitment_stats_agent_read" ON public.recruitment_stats;
      CREATE POLICY "recruitment_stats_agent_read" ON public.recruitment_stats FOR SELECT USING (
        get_current_user_role() IN ('agent', 'member', 'manager', 'operator')
      )
    $policy$;
  EXCEPTION WHEN OTHERS THEN
    -- recruitment_stats is a regular view — grant SELECT to authenticated role instead
    GRANT SELECT ON public.recruitment_stats TO authenticated;
  END;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
