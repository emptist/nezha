-- Migration: 023_internally_built_skills
-- Description: Add builder/maintainer fields for internally-built skills

-- Add builder field (who created the skill)
ALTER TABLE skills ADD COLUMN IF NOT EXISTS builder TEXT;

-- Add maintainer field (who maintains the skill)
ALTER TABLE skills ADD COLUMN IF NOT EXISTS maintainer TEXT;

-- Add build metadata (JSONB for flexible storage of build info)
ALTER TABLE skills ADD COLUMN IF NOT EXISTS build_metadata JSONB DEFAULT '{}';

-- Add generation prompt (the prompt used to generate the skill)
ALTER TABLE skills ADD COLUMN IF NOT EXISTS generation_prompt TEXT;

-- Update source to include new values
ALTER TABLE skills DROP CONSTRAINT IF EXISTS skills_source_check;
ALTER TABLE skills ADD CONSTRAINT skills_source_check 
    CHECK (source IN ('clawhub', 'local', 'generated', 'imported', 'ai-built'));

-- =============================================
-- INTERNAL SKILL BUILDER SETTINGS
-- =============================================

-- Table to store skill builder configuration
CREATE TABLE IF NOT EXISTS skill_builder_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Builder settings
    builder_enabled BOOLEAN DEFAULT TRUE,
    auto_approve_threshold INTEGER DEFAULT 90,
    
    -- Quality gates
    min_quality_score INTEGER DEFAULT 50,
    require_review BOOLEAN DEFAULT TRUE,
    
    -- Templates
    skill_templates JSONB DEFAULT '[]',
    
    -- Statistics
    skills_built_count INTEGER DEFAULT 0,
    skills_approved_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SKILL VERSION HISTORY (for tracking improvements)
-- =============================================

CREATE TABLE IF NOT EXISTS skill_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
    
    version TEXT NOT NULL,
    instructions TEXT,
    manifest JSONB DEFAULT '{}',
    
    change_summary TEXT,
    improved_by TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_versions_skill_id ON skill_versions(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_versions_version ON skill_versions(skill_id, version DESC);

-- =============================================
-- FUNCTION: Auto-set builder/maintainer for internally-built skills
-- =============================================

CREATE OR REPLACE FUNCTION set_skill_builder_info()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.source IN ('generated', 'ai-built') THEN
        IF NEW.builder IS NULL THEN
            NEW.builder := 'nezha-ai';
        END IF;
        IF NEW.maintainer IS NULL THEN
            NEW.maintainer := NEW.builder;
        END IF;
        IF NEW.build_metadata IS NULL OR NEW.build_metadata = '{}'::jsonb THEN
            NEW.build_metadata := jsonb_build_object(
                'builtAt', NOW(),
                'builtBy', NEW.builder,
                'source', NEW.source
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_skill_builder_info ON skills;
CREATE TRIGGER set_skill_builder_info
    BEFORE INSERT OR UPDATE ON skills
    FOR EACH ROW
    EXECUTE FUNCTION set_skill_builder_info();

-- =============================================
-- VIEW: Internally-built skills
-- =============================================

CREATE OR REPLACE VIEW internally_built_skills AS
SELECT 
    s.id,
    s.name,
    s.description,
    s.version,
    s.builder,
    s.maintainer,
    s.build_metadata,
    s.use_count,
    s.status,
    s.safety_score,
    s.created_at,
    s.updated_at,
    COUNT(sv.id) as version_count
FROM skills s
LEFT JOIN skill_versions sv ON s.id = sv.skill_id
WHERE s.source IN ('generated', 'ai-built')
GROUP BY s.id
ORDER BY s.use_count DESC;

-- =============================================
-- FUNCTION: Build a new skill (stored procedure for AI to call)
-- =============================================

CREATE OR REPLACE FUNCTION build_skill(
    p_name TEXT,
    p_purpose TEXT,
    p_instructions TEXT,
    p_builder TEXT DEFAULT 'nezha-ai',
    p_tags TEXT[] DEFAULT '{}',
    p_permissions TEXT[] DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
    v_quality_score INTEGER;
BEGIN
    -- Validate input
    IF p_name IS NULL OR p_name = '' THEN
        RAISE EXCEPTION 'Skill name is required';
    END IF;
    
    IF p_purpose IS NULL OR p_purpose = '' THEN
        RAISE EXCEPTION 'Skill purpose is required';
    END IF;
    
    -- Calculate quality score (simple heuristic)
    v_quality_score := 50;
    IF length(p_instructions) > 200 THEN v_quality_score := v_quality_score + 15; END IF;
    IF length(p_instructions) > 500 THEN v_quality_score := v_quality_score + 10; END IF;
    IF length(p_purpose) > 50 THEN v_quality_score := v_quality_score + 10; END IF;
    IF array_length(p_tags, 1) >= 3 THEN v_quality_score := v_quality_score + 5; END IF;
    
    -- Check minimum quality threshold
    IF v_quality_score < 50 THEN
        RAISE EXCEPTION 'Skill quality score too low: %', v_quality_score;
    END IF;
    
    -- Create the skill
    INSERT INTO skills (
        id, name, description, instructions, source,
        version, builder, maintainer, tags, permissions,
        safety_score, scan_status, status, build_metadata,
        generation_prompt, installed_at
    ) VALUES (
        uuid_generate_v4(),
        p_name,
        p_purpose,
        p_instructions,
        'ai-built',
        '1.0.0',
        p_builder,
        p_builder,
        COALESCE(p_tags, '{}'),
        COALESCE(p_permissions, '{}'),
        v_quality_score,
        'reviewed',
        'pending',
        jsonb_build_object(
            'builtAt', NOW(),
            'builtBy', p_builder,
            'qualityScore', v_quality_score
        ),
        'Generated based on purpose: ' || p_purpose,
        NOW()
    )
    ON CONFLICT (external_id) DO UPDATE SET
        instructions = EXCLUDED.instructions,
        description = EXCLUDED.description,
        updated_at = NOW()
    RETURNING id INTO v_id;
    
    -- Update builder stats
    UPDATE skill_builder_config 
    SET skills_built_count = skills_built_count + 1,
        updated_at = NOW();
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Initialize builder config if not exists
INSERT INTO skill_builder_config (id, builder_enabled)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Grant permissions
GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;
