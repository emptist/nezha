-- Migration: 063_drop_qc_reviews_table
-- Description: Drop unused qc_reviews table
-- Date: 2026-03-28
-- Issue: [issue: will be filled after commit]

-- Drop qc_reviews table (0 records, no CLI commands, redundant with reviews table)
DROP TABLE IF EXISTS qc_reviews CASCADE;

-- Remove qc_reviews from table_documentation
DELETE FROM table_documentation WHERE table_name = 'qc_reviews';

-- Update reviews table documentation to clarify it handles QC reviews
UPDATE table_documentation 
SET notes = 'System review for components, design, quality, security, etc. Supports QC review via review_type=''qc''. Supports comparison review via review_type=''comparison''. Supports follow-up mechanism.'
WHERE table_name = 'reviews';
