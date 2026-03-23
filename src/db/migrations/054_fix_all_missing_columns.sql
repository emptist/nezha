-- Migration: 054_fix_all_missing_columns  
-- Description: Fix all missing columns that cause errors
-- Date: 2026-03-24

-- Fix last_heartbeat_at in agent_sessions
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ DEFAULT NOW();

-- Ensure type column (backup check)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'implementation';

-- Ensure category column
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS category TEXT;
