-- Migration: Company & Order enhancements
-- 2026-04-14

-- ── companies ─────────────────────────────────────────────────────────────────
-- Replace single video_url with factory + job videos
ALTER TABLE companies RENAME COLUMN video_url TO factory_video_url;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS job_video_url TEXT;

-- English fields
ALTER TABLE companies ADD COLUMN IF NOT EXISTS en_industry TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_type TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS en_business_type TEXT;

-- ── orders ─────────────────────────────────────────────────────────────────────
-- Probation (thử việc)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS probation TEXT DEFAULT 'Không';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS probation_months INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS probation_salary_pct INTEGER;

-- Dormitory note (shown when dormitory = 'Không hỗ trợ')
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dormitory_note TEXT;

-- English translations
ALTER TABLE orders ADD COLUMN IF NOT EXISTS meal_en TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dormitory_en TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recruitment_info_en TEXT;
