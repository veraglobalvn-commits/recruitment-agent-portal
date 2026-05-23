-- Fix RLS policies: add 'member' role alongside 'agent'/'manager'
-- Root cause: member role was defined in app (lib/permissions.ts) but never added to DB RLS policies.

BEGIN;

-- ORDERS: member can read orders (app fetches via owner's agent_ids)
DROP POLICY IF EXISTS "orders_agency_read" ON public.orders;
CREATE POLICY "orders_agency_read" ON public.orders FOR SELECT USING (
  get_current_user_role() IN ('agent', 'manager', 'member') AND get_current_user_agency_id() IS NOT NULL
);

-- CANDIDATES: member can insert/update/select candidates
DROP POLICY IF EXISTS "candidates_agency_all" ON public.candidates;
CREATE POLICY "candidates_agency_all" ON public.candidates FOR ALL USING (
  get_current_user_role() IN ('agent', 'manager', 'member', 'operator') AND get_current_user_agency_id() IS NOT NULL
);

-- COMPANIES: member can read company info (shown in order detail)
DROP POLICY IF EXISTS "companies_read_active" ON public.companies;
CREATE POLICY "companies_read_active" ON public.companies FOR SELECT USING (
  get_current_user_role() IN ('agent', 'manager', 'member', 'operator')
);

-- ORDER_AGENTS: member can read allocations (for quota display)
DROP POLICY IF EXISTS "order_agents_agency_read" ON public.order_agents;
CREATE POLICY "order_agents_agency_read" ON public.order_agents FOR SELECT USING (
  get_current_user_role() IN ('agent', 'manager', 'member', 'operator')
);

NOTIFY pgrst, 'reload schema';

COMMIT;
