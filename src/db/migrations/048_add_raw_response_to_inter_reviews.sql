-- Migration: 048_add_raw_response_to_inter_reviews
-- Description: Add raw_response column to store complete AI review output before parsing

ALTER TABLE inter_reviews ADD COLUMN IF NOT EXISTS raw_response TEXT;

CREATE INDEX IF NOT EXISTS idx_inter_reviews_raw_response 
    ON inter_reviews USING gin(to_tsvector('english', COALESCE(raw_response, '')));
