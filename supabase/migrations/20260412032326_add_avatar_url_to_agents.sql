-- Add avatar_url column to agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS avatar_url TEXT;
