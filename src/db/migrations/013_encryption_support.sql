-- Migration: 013_encryption_support
-- Description: Add encryption support for sensitive data

-- Add encrypted_value column to api_keys table for storing encrypted API keys
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS encrypted_value TEXT;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS encrypted_iv TEXT;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS encrypted_tag TEXT;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS encrypted_salt TEXT;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'superadmin', 'readonly'));

-- Add encrypted result column to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS encrypted_result JSONB;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS result_iv TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS result_tag TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS result_salt TEXT;

-- Add encryption metadata columns
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS encrypted_at TIMESTAMPTZ;

-- Add sensitive flag to memory table
ALTER TABLE memory ADD COLUMN IF NOT EXISTS has_sensitive BOOLEAN DEFAULT false;

-- Create provider_api_keys table for storing encrypted provider API keys
CREATE TABLE IF NOT EXISTS provider_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL UNIQUE,
    encrypted_key TEXT NOT NULL,
    encrypted_iv TEXT NOT NULL,
    encrypted_tag TEXT NOT NULL,
    encrypted_salt TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_api_keys_provider ON provider_api_keys(provider);

-- Create index for encrypted tasks
CREATE INDEX IF NOT EXISTS idx_tasks_encrypted_at ON tasks(encrypted_at DESC);

-- Function to check if user has permission to decrypt
CREATE OR REPLACE FUNCTION can_decrypt_task(p_user_role TEXT, p_task_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_result BOOLEAN := false;
BEGIN
    -- Admin can always decrypt
    IF p_user_role IN ('admin', 'superadmin') THEN
        RETURN true;
    END IF;

    -- Check if user owns the task or has access
    -- This is a placeholder - implement based on your access control system
    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Function to get decrypted task result (with access control)
CREATE OR REPLACE FUNCTION get_decrypted_task_result(
    p_task_id UUID, 
    p_user_role TEXT DEFAULT 'user'
)
RETURNS JSONB AS $$
DECLARE
    v_encrypted_result JSONB;
    v_result JSONB;
BEGIN
    -- Check access permission
    IF NOT can_decrypt_task(p_user_role, p_task_id) THEN
        RAISE EXCEPTION 'Permission denied';
    END IF;

    -- Return encrypted result (client must decrypt with NEZHA_SECRET)
    SELECT encrypted_result INTO v_encrypted_result 
    FROM tasks 
    WHERE id = p_task_id;

    RETURN v_encrypted_result;
END;
$$ LANGUAGE plpgsql;
