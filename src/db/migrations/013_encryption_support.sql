-- Migration: 013_encryption_support
-- Description: Add encryption support for sensitive data

-- Add encrypted_value column to api_keys table for storing encrypted API keys
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS encrypted_value TEXT;

-- Add encrypted result column to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS encrypted_result JSONB;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS result_iv TEXT;

-- Add encryption metadata columns
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS encrypted_at TIMESTAMPTZ;

-- Add sensitive flag to memory table
ALTER TABLE memory ADD COLUMN IF NOT EXISTS has_sensitive BOOLEAN DEFAULT false;

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
