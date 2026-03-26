-- Migration: 055_memory_agent_id_type
-- Description: Change memory.agent_id from UUID to VARCHAR(100) to support semantic IDs (S-/G- format)

ALTER TABLE memory 
ALTER COLUMN agent_id TYPE VARCHAR(100);

COMMENT ON COLUMN memory.agent_id IS 'Semantic ID of the AI agent (e.g., S-nezha-xxx or G-xxx)';