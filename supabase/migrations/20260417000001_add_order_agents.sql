-- Migration: Add order_agents junction table for per-order labor allocation
-- 2026-04-17

CREATE TABLE IF NOT EXISTS order_agents (
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  assigned_labor_number INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (order_id, agent_id)
);

-- Backfill from existing agent_ids + labor_percentage
INSERT INTO order_agents (order_id, agent_id, assigned_labor_number)
SELECT
  o.id AS order_id,
  aid.agent_id,
  COALESCE(
    ROUND((COALESCE(a.labor_percentage, 0) / 100.0) * COALESCE(o.total_labor, 0))
  , 0)::INTEGER AS assigned_labor_number
FROM orders o
CROSS JOIN LATERAL unnest(o.agent_ids) AS aid(agent_id)
JOIN agents a ON a.id = aid.agent_id
WHERE o.agent_ids IS NOT NULL AND array_length(o.agent_ids, 1) > 0
ON CONFLICT (order_id, agent_id) DO UPDATE SET assigned_labor_number = EXCLUDED.assigned_labor_number;

-- Enable RLS
ALTER TABLE order_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_order_agents" ON order_agents FOR ALL
  USING (auth.uid() IN (SELECT supabase_uid FROM agents WHERE role = 'admin'));

CREATE POLICY "agent_read_own_order_agents" ON order_agents FOR SELECT
  USING (order_id IN (SELECT id FROM orders WHERE agent_ids @> ARRAY[auth.uid()]));

NOTIFY pgrst, 'reload schema';
