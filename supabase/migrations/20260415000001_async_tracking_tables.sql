-- Migration: Translation, Recruitment Request, and Contract Request tracking tables
-- 2026-04-15

-- ── translation_requests ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS translation_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('company', 'order')),
  entity_id TEXT NOT NULL,
  fields_to_translate JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  translated_data JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ── recruitment_requests ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recruitment_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  pdf_url TEXT,
  docs_edit_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ── contract_requests ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contract_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  candidate_id TEXT NOT NULL REFERENCES candidates(id_ld),
  contract_type TEXT NOT NULL CHECK (contract_type IN ('basic', 'advanced')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  pdf_url TEXT,
  docs_edit_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ── Indexes for better query performance ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_translation_requests_entity ON translation_requests(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_translation_requests_status ON translation_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_requests_order ON recruitment_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_requests_agent ON recruitment_requests(agent_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_requests_status ON recruitment_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contract_requests_order ON contract_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_contract_requests_candidate ON contract_requests(candidate_id);
CREATE INDEX IF NOT EXISTS idx_contract_requests_status ON contract_requests(status, created_at DESC);

-- ── Notify PostgREST to reload schema ───────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
