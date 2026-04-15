-- Migration: Add probation_en to orders table
-- 2026-04-16

-- Add probation_en field for English translation of probation info
ALTER TABLE orders ADD COLUMN IF NOT EXISTS probation_en TEXT;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
