BEGIN;

CREATE TABLE IF NOT EXISTS public.job_industries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_vi TEXT NOT NULL,
  name_en TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS job_industries_name_vi_unique
  ON public.job_industries (LOWER(name_vi));

ALTER TABLE public.job_positions
  ADD COLUMN IF NOT EXISTS industry_id UUID REFERENCES public.job_industries(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS name_vi TEXT,
  ADD COLUMN IF NOT EXISTS name_en TEXT,
  ADD COLUMN IF NOT EXISTS default_weight_percent NUMERIC(5,2) NOT NULL DEFAULT 0;

INSERT INTO public.job_industries (name_vi, name_en)
SELECT DISTINCT TRIM(industry), NULL
FROM public.job_positions
WHERE industry IS NOT NULL
  AND TRIM(industry) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.job_industries ji
    WHERE LOWER(TRIM(ji.name_vi)) = LOWER(TRIM(public.job_positions.industry))
  );

UPDATE public.job_positions jp
SET
  industry_id = ji.id,
  name_vi = COALESCE(jp.name_vi, jp.name),
  updated_at = NOW()
FROM public.job_industries ji
WHERE jp.industry_id IS NULL
  AND LOWER(TRIM(jp.industry)) = LOWER(TRIM(ji.name_vi));

UPDATE public.job_positions
SET name_vi = COALESCE(name_vi, name),
    updated_at = NOW()
WHERE name_vi IS NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS industry_id UUID REFERENCES public.job_industries(id) ON DELETE SET NULL;

UPDATE public.orders o
SET industry_id = ji.id
FROM public.companies c
JOIN public.job_industries ji
  ON LOWER(TRIM(c.industry)) = LOWER(TRIM(ji.name_vi))
WHERE o.industry_id IS NULL
  AND o.company_id = c.id
  AND c.industry IS NOT NULL
  AND TRIM(c.industry) <> '';

CREATE INDEX IF NOT EXISTS idx_job_positions_industry_id
  ON public.job_positions (industry_id);

CREATE INDEX IF NOT EXISTS idx_orders_industry_id
  ON public.orders (industry_id);

ALTER TABLE public.job_industries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_industries_admin_all" ON public.job_industries;
CREATE POLICY "job_industries_admin_all" ON public.job_industries FOR ALL USING (is_active_admin());

DROP POLICY IF EXISTS "job_industries_read_active" ON public.job_industries;
CREATE POLICY "job_industries_read_active" ON public.job_industries FOR SELECT USING (
  is_active = TRUE
  AND get_current_user_role() IN ('admin', 'operator', 'read_only', 'agent', 'member', 'manager')
);

NOTIFY pgrst, 'reload schema';

COMMIT;
