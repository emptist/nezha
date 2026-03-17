-- Migration: 009_api_security
-- Description: Add API key authentication and rate limiting

-- Create API keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_hash TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    rate_limit INTEGER DEFAULT 100, -- requests per minute
    enabled BOOLEAN DEFAULT true,
    last_used TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_enabled ON api_keys(enabled);

-- Create rate limiting table
CREATE TABLE IF NOT EXISTS rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id UUID REFERENCES api_keys(id),
    window_start TIMESTAMPTZ NOT NULL,
    request_count INTEGER DEFAULT 0,
    UNIQUE(api_key_id, window_start)
);

CREATE INDEX idx_rate_limits_key_window ON rate_limits(api_key_id, window_start);

-- Function to check and update rate limit
CREATE OR REPLACE FUNCTION check_rate_limit(p_key_hash TEXT, p_limit INTEGER DEFAULT 100)
RETURNS BOOLEAN AS $$
DECLARE
    v_api_key_id UUID;
    v_current_count INTEGER;
    v_window_start TIMESTAMPTZ;
BEGIN
    -- Get API key ID
    SELECT id INTO v_api_key_id FROM api_keys 
    WHERE key_hash = p_key_hash AND enabled = true 
    AND (expires_at IS NULL OR expires_at > NOW());
    
    IF v_api_key_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Get current window
    v_window_start := date_trunc('minute', NOW());
    
    -- Get current count
    SELECT request_count INTO v_current_count 
    FROM rate_limits 
    WHERE api_key_id = v_api_key_id AND window_start = v_window_start;
    
    IF v_current_count IS NULL THEN
        INSERT INTO rate_limits (api_key_id, window_start, request_count)
        VALUES (v_api_key_id, v_window_start, 1);
        RETURN TRUE;
    END IF;
    
    IF v_current_count >= p_limit THEN
        RETURN FALSE;
    END IF;
    
    UPDATE rate_limits SET request_count = request_count + 1
    WHERE api_key_id = v_api_key_id AND window_start = v_window_start;
    
    -- Update last used
    UPDATE api_keys SET last_used = NOW() WHERE id = v_api_key_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to create API key (returns the plain key - should be shown only once)
CREATE OR REPLACE FUNCTION create_api_key(p_name TEXT, p_rate_limit INTEGER DEFAULT 100)
RETURNS TEXT AS $$
DECLARE
    v_plain_key TEXT;
    v_key_hash TEXT;
    v_key_id UUID;
BEGIN
    -- Generate random key
    v_plain_key := encode(gen_random_bytes(32), 'hex');
    v_key_hash := encode(sha256(v_plain_key::bytea), 'hex');
    
    INSERT INTO api_keys (key_hash, name, rate_limit)
    VALUES (v_key_hash, p_name, p_rate_limit)
    RETURNING id INTO v_key_id;
    
    -- Return the plain key (this is the only time it can be retrieved)
    RETURN v_plain_key;
END;
$$ LANGUAGE plpgsql;
