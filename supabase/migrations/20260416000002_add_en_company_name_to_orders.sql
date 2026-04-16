-- Migration: Add en_company_name to orders table
-- 2026-04-16

ALTER TABLE orders ADD COLUMN IF NOT EXISTS en_company_name TEXT;

-- Backfill from companies table
UPDATE orders o
SET en_company_name = c.en_company_name
FROM companies c
WHERE o.company_id = c.id
  AND (o.en_company_name IS NULL OR o.en_company_name = '')
  AND c.en_company_name IS NOT NULL
  AND c.en_company_name != '';

NOTIFY pgrst, 'reload schema';
