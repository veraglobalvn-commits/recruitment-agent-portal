ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS agency_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]'::jsonb;

-- Create index to speed up hierarchical agent querying
CREATE INDEX IF NOT EXISTS idx_agents_agency_id ON agents(agency_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
