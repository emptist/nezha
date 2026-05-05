-- Inner model status: in_use (current), fallback (reserve), not_used (configured but inactive)
ALTER TABLE provider_api_keys ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'not_used';
ALTER TABLE provider_api_keys ALTER COLUMN status DROP DEFAULT;

-- Add model column to store the model name in the database
ALTER TABLE provider_api_keys ADD COLUMN IF NOT EXISTS model TEXT;

-- Enforce only one in_use at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_api_keys_in_use ON provider_api_keys((true)) WHERE status = 'in_use';

-- Set openrouter as default in_use with hy3 model if any provider exists
UPDATE provider_api_keys
SET status = 'in_use', model = 'tencent/hy3-preview:free'
WHERE provider = 'openrouter'
  AND NOT EXISTS (
    SELECT 1 FROM provider_api_keys WHERE status = 'in_use'
  )
  AND EXISTS (
    SELECT 1 FROM provider_api_keys WHERE provider = 'openrouter'
  );
