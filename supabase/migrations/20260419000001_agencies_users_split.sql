BEGIN;

-- 1. Create agencies table
CREATE TABLE IF NOT EXISTS agencies (
  id TEXT PRIMARY KEY,
  company_name TEXT,
  company_address TEXT,
  legal_rep TEXT,
  legal_rep_title TEXT,
  license_no TEXT,
  doc_links JSONB DEFAULT '[]',
  labor_percentage INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Migrate data from agents to agencies (non-admin = agency owners)
INSERT INTO agencies (id, company_name, company_address, legal_rep, legal_rep_title, license_no, doc_links, labor_percentage)
SELECT id, company_name, company_address, legal_rep, legal_rep_title, license_no, doc_links, labor_percentage
FROM agents
WHERE role != 'admin';

-- 3. Add RBAC columns if not exist
ALTER TABLE agents ADD COLUMN IF NOT EXISTS agency_id TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]'::jsonb;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 4. Rename agents -> users
ALTER TABLE agents RENAME TO users;

-- 4b. Ensure all required columns exist on users (in case originals were missing)
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 5. Drop business columns from users
ALTER TABLE users DROP COLUMN IF EXISTS company_name;
ALTER TABLE users DROP COLUMN IF EXISTS company_address;
ALTER TABLE users DROP COLUMN IF EXISTS legal_rep;
ALTER TABLE users DROP COLUMN IF EXISTS legal_rep_title;
ALTER TABLE users DROP COLUMN IF EXISTS license_no;
ALTER TABLE users DROP COLUMN IF EXISTS doc_links;
ALTER TABLE users DROP COLUMN IF EXISTS labor_percentage;

-- 6. Update agency_id: agent owners point to agency with same id
UPDATE users SET agency_id = id WHERE role = 'agent' AND agency_id IS NULL;

-- 7. Add FK: agency_id -> agencies(id)
ALTER TABLE users ADD CONSTRAINT users_agency_id_fkey
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL;

-- 8. Update FK references from other tables
ALTER TABLE order_agents DROP CONSTRAINT IF EXISTS order_agents_agent_id_fkey;
ALTER TABLE order_agents ADD CONSTRAINT order_agents_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE recruitment_requests DROP CONSTRAINT IF EXISTS recruitment_requests_agent_id_fkey;
ALTER TABLE recruitment_requests ADD CONSTRAINT recruitment_requests_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES users(id);

-- 9. Create indexes
CREATE INDEX IF NOT EXISTS idx_users_agency_id ON users(agency_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_supabase_uid ON users(supabase_uid);

-- ============================================================
-- 10. RLS — Helper functions (SECURITY DEFINER)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_current_user_id()
RETURNS TEXT AS $$
  SELECT id FROM public.users WHERE supabase_uid = auth.uid()::text LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE supabase_uid = auth.uid()::text AND status = 'active' LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_current_user_agency_id()
RETURNS TEXT AS $$
  SELECT agency_id FROM public.users WHERE supabase_uid = auth.uid()::text AND status = 'active' LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE supabase_uid = auth.uid()::text AND role = 'admin' AND status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- 11. RLS Policies per table
-- ============================================================

-- USERS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_admin_all" ON public.users FOR ALL USING (is_active_admin());
CREATE POLICY "users_read_self" ON public.users FOR SELECT USING (supabase_uid = auth.uid()::text);
CREATE POLICY "users_agent_team" ON public.users FOR ALL USING (
  agency_id = get_current_user_agency_id() AND get_current_user_role() = 'agent'
);

-- AGENCIES
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agencies_admin_all" ON public.agencies FOR ALL USING (is_active_admin());
CREATE POLICY "agencies_read_own" ON public.agencies FOR SELECT USING (
  id = get_current_user_agency_id() AND get_current_user_role() IN ('agent', 'manager', 'operator')
);

-- ORDERS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_admin_all" ON public.orders FOR ALL USING (is_active_admin());
CREATE POLICY "orders_agency_read" ON public.orders FOR SELECT USING (
  get_current_user_role() IN ('agent', 'manager') AND get_current_user_agency_id() IS NOT NULL
);

-- CANDIDATES
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "candidates_admin_all" ON public.candidates FOR ALL USING (is_active_admin());
CREATE POLICY "candidates_agency_all" ON public.candidates FOR ALL USING (
  get_current_user_role() IN ('agent', 'manager', 'operator') AND get_current_user_agency_id() IS NOT NULL
);

-- COMPANIES
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "companies_admin_all" ON public.companies FOR ALL USING (is_active_admin());
CREATE POLICY "companies_read_active" ON public.companies FOR SELECT USING (
  get_current_user_role() IN ('agent', 'manager', 'operator')
);

-- ORDER_AGENTS
ALTER TABLE public.order_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_agents_admin_all" ON public.order_agents FOR ALL USING (is_active_admin());
CREATE POLICY "order_agents_agency_read" ON public.order_agents FOR SELECT USING (
  get_current_user_role() IN ('agent', 'manager', 'operator')
);

-- ORDER_HANDOVERS
ALTER TABLE public.order_handovers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_handovers_admin_all" ON public.order_handovers FOR ALL USING (is_active_admin());
CREATE POLICY "order_handovers_agency_read" ON public.order_handovers FOR SELECT USING (
  get_current_user_role() IN ('agent', 'manager')
);

-- ORDER_PAYMENTS
ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_payments_admin_all" ON public.order_payments FOR ALL USING (is_active_admin());
CREATE POLICY "order_payments_agency_read" ON public.order_payments FOR SELECT USING (
  get_current_user_role() IN ('agent', 'manager')
);

-- POLICY_SETTINGS
ALTER TABLE public.policy_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "policy_admin_all" ON public.policy_settings FOR ALL USING (is_active_admin());
CREATE POLICY "policy_read_active" ON public.policy_settings FOR SELECT USING (
  get_current_user_role() IN ('agent', 'manager', 'operator')
);

NOTIFY pgrst, 'reload schema';

COMMIT;
