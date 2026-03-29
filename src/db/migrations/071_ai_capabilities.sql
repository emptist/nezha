-- AI capability levels for delegation routing
-- Human-defined: low(1), middle(2), high(3), super(4)
-- Configuration stored in .memory/AI_LEVELS.md
CREATE TABLE IF NOT EXISTS ai_capabilities (
  id VARCHAR(50) PRIMARY KEY,
  source VARCHAR(50) NOT NULL,  -- 'nezha', 'pi', 'opencode', 'human'
  level INTEGER NOT NULL CHECK (level >= 1 AND level <= 4),
  description TEXT,
  active BOOLEAN DEFAULT true,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Default capability levels (human-set)
INSERT INTO ai_capabilities (id, source, level, description) VALUES
  ('pi', 'pi', 1, 'Lightweight local AI - simple tasks only'),
  ('nezha', 'nezha', 1, 'Internal AI - simple tasks'),
  ('opencode', 'opencode', 3, 'Full Claude/GPT - complex coding tasks'),
  ('human', 'human', 4, 'Human - critical decisions')
ON CONFLICT (id) DO NOTHING;

-- Update tasks table to track which AI created it
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS executor_source VARCHAR(50);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS executor_model VARCHAR(100);
