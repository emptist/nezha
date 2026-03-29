-- AI capability levels for delegation routing
-- Can be updated at runtime to reflect actual provider capabilities
CREATE TABLE IF NOT EXISTS ai_capabilities (
  id VARCHAR(50) PRIMARY KEY,
  source VARCHAR(50) NOT NULL,  -- 'nezha', 'pi', 'opencode', 'human'
  model VARCHAR(100),           -- specific model: 'glm-4', 'claude-3-opus', etc.
  name VARCHAR(100) NOT NULL,
  level INTEGER NOT NULL CHECK (level >= 1 AND level <= 5),
  description TEXT,
  active BOOLEAN DEFAULT true,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Default capability levels with source and model
INSERT INTO ai_capabilities (id, source, model, name, level, description) VALUES
  ('pi', 'pi', 'glm-4', 'Pi (Local)', 1, 'Lightweight local AI - good for simple tasks'),
  ('pi-flash', 'pi', 'glm-4-flash', 'Pi Flash', 2, 'Faster but less capable'),
  ('internal', 'nezha', NULL, 'Internal AI', 2, 'Internal reasoning AI - medium complexity'),
  ('opencode', 'opencode', NULL, 'OpenCode', 3, 'Full Claude/GPT - complex tasks and coding'),
  ('human', 'human', NULL, 'Human', 5, 'Human intervention for critical decisions')
ON CONFLICT (id) DO NOTHING;

-- Function to get capability level by source
CREATE OR REPLACE FUNCTION get_ai_capability_by_source(p_source VARCHAR)
RETURNS INTEGER AS $$
DECLARE
  v_level INTEGER;
BEGIN
  SELECT MAX(level) INTO v_level FROM ai_capabilities 
  WHERE source = p_source AND active = true;
  
  RETURN COALESCE(v_level, 3);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get capability by source + model
CREATE OR REPLACE FUNCTION get_ai_capability(p_source VARCHAR, p_model VARCHAR DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
  v_level INTEGER;
BEGIN
  -- First try exact match (source + model)
  SELECT level INTO v_level FROM ai_capabilities 
  WHERE source = p_source 
    AND (model = p_model OR (model IS NULL AND p_model IS NULL))
    AND active = true
  ORDER BY level DESC LIMIT 1;
  
  -- Fall back to source only
  IF v_level IS NULL THEN
    SELECT MAX(level) INTO v_level FROM ai_capabilities 
    WHERE source = p_source AND active = true;
  END IF;
  
  RETURN COALESCE(v_level, 3);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update tasks table to track which AI created it
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS executor_source VARCHAR(50);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS executor_model VARCHAR(100);
