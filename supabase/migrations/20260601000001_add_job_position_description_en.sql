ALTER TABLE public.job_positions
  ADD COLUMN IF NOT EXISTS description_en TEXT;

NOTIFY pgrst, 'reload schema';
