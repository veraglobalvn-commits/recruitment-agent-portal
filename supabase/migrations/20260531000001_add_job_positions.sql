BEGIN;

CREATE TABLE IF NOT EXISTS public.job_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS job_positions_industry_name_unique
  ON public.job_positions (LOWER(industry), LOWER(name));

CREATE INDEX IF NOT EXISTS idx_job_positions_industry
  ON public.job_positions (industry);

CREATE TABLE IF NOT EXISTS public.order_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  position_id UUID NOT NULL REFERENCES public.job_positions(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, position_id)
);

CREATE INDEX IF NOT EXISTS idx_order_positions_order_id
  ON public.order_positions (order_id);

CREATE INDEX IF NOT EXISTS idx_order_positions_position_id
  ON public.order_positions (position_id);

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS position_id UUID REFERENCES public.job_positions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_candidates_position_id
  ON public.candidates (position_id);

ALTER TABLE public.job_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_positions_admin_all" ON public.job_positions;
CREATE POLICY "job_positions_admin_all" ON public.job_positions FOR ALL USING (is_active_admin());

DROP POLICY IF EXISTS "job_positions_read_active" ON public.job_positions;
CREATE POLICY "job_positions_read_active" ON public.job_positions FOR SELECT USING (
  is_active = TRUE
  AND get_current_user_role() IN ('admin', 'operator', 'read_only', 'agent', 'member', 'manager')
);

DROP POLICY IF EXISTS "order_positions_admin_all" ON public.order_positions;
CREATE POLICY "order_positions_admin_all" ON public.order_positions FOR ALL USING (is_active_admin());

DROP POLICY IF EXISTS "order_positions_agency_read" ON public.order_positions;
CREATE POLICY "order_positions_agency_read" ON public.order_positions FOR SELECT USING (
  get_current_user_role() IN ('admin', 'operator', 'read_only', 'agent', 'member', 'manager')
);

NOTIFY pgrst, 'reload schema';

COMMIT;
