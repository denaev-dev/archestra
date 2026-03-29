-- Migration: Add agent schedule triggers
ALTER TABLE agents ADD COLUMN schedule TEXT;
ALTER TABLE agents ADD COLUMN next_run_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE agents ADD COLUMN last_run_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX idx_agents_next_run_at ON agents (next_run_at) WHERE schedule IS NOT NULL;
