-- Migration: 046_reflection_trends
-- Description: Track reflection trends over time using memory table

-- Function to get reflection trends by day
CREATE OR REPLACE FUNCTION get_reflection_trends(days INTEGER DEFAULT 7)
RETURNS TABLE (
    date DATE,
    total_reflections BIGINT,
    learnings BIGINT,
    prompt_updates BIGINT,
    issues BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        DATE(created_at) as date,
        COUNT(*) as total_reflections,
        COUNT(*) FILTER (WHERE content LIKE '%[LEARN]%') as learnings,
        COUNT(*) FILTER (WHERE content LIKE '%[PROMPT_UPDATE]%') as prompt_updates,
        COUNT(*) FILTER (WHERE content LIKE '%[ISSUE]%') as issues
    FROM memory
    WHERE created_at >= NOW() - (days || ' days')::INTERVAL
      AND (content LIKE '%[LEARN]%' OR content LIKE '%[PROMPT_UPDATE]%' OR content LIKE '%[ISSUE]%')
    GROUP BY DATE(created_at)
    ORDER BY DATE(created_at) DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get reflection growth rate
CREATE OR REPLACE FUNCTION get_reflection_growth()
RETURNS TABLE (
    period TEXT,
    count BIGINT,
    growth_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH weekly_counts AS (
        SELECT 
            DATE_TRUNC('week', created_at) as week_start,
            COUNT(*) as week_count
        FROM memory
        WHERE created_at >= NOW() - INTERVAL '28 days'
          AND (content LIKE '%[LEARN]%' OR content LIKE '%[PROMPT_UPDATE]%' OR content LIKE '%[ISSUE]%')
        GROUP BY DATE_TRUNC('week', created_at)
        ORDER BY week_start
    ),
    with_lag AS (
        SELECT 
            week_start,
            week_count,
            LAG(week_count) OVER (ORDER BY week_start) as prev_count
        FROM weekly_counts
    )
    SELECT 
        TO_CHAR(week_start, 'YYYY-MM-DD') as period,
        week_count as count,
        CASE 
            WHEN prev_count IS NULL OR prev_count = 0 THEN NULL
            ELSE ROUND((week_count - prev_count)::NUMERIC / prev_count * 100, 2)
        END as growth_rate
    FROM with_lag
    ORDER BY week_start DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get top learning keywords
CREATE OR REPLACE FUNCTION get_top_learning_keywords(p_days INTEGER DEFAULT 30, p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
    keyword TEXT,
    occurrence_count BIGINT,
    first_seen TIMESTAMPTZ,
    last_seen TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    WITH keywords AS (
        SELECT 
            LOWER(UNNEST(regexp_split_to_array(SUBSTRING(content FROM '\[LEARN\] insight: ([^\.]+)'), '\s+'))) as kw,
            created_at
        FROM memory
        WHERE created_at >= NOW() - (p_days || ' days')::INTERVAL
          AND content LIKE '%[LEARN]%'
    )
    SELECT 
        kw as keyword,
        COUNT(*) as occurrence_count,
        MIN(created_at) as first_seen,
        MAX(created_at) as last_seen
    FROM keywords
    WHERE LENGTH(kw) > 4
    GROUP BY kw
    ORDER BY occurrence_count DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- View for reflection summary
CREATE OR REPLACE VIEW reflection_summary AS
SELECT 
    DATE(created_at) as date,
    CASE 
        WHEN content LIKE '%[LEARN]%' THEN 'learning'
        WHEN content LIKE '%[PROMPT_UPDATE]%' THEN 'prompt_update'
        WHEN content LIKE '%[ISSUE]%' THEN 'issue'
        ELSE 'other'
    END as type,
    COUNT(*) as count,
    ARRAY_AGG(SUBSTRING(content FROM 1 FOR 100) ORDER BY created_at DESC) as recent_insights
FROM memory
WHERE created_at >= NOW() - INTERVAL '7 days'
  AND (content LIKE '%[LEARN]%' OR content LIKE '%[PROMPT_UPDATE]%' OR content LIKE '%[ISSUE]%')
GROUP BY DATE(created_at), 
    CASE 
        WHEN content LIKE '%[LEARN]%' THEN 'learning'
        WHEN content LIKE '%[PROMPT_UPDATE]%' THEN 'prompt_update'
        WHEN content LIKE '%[ISSUE]%' THEN 'issue'
        ELSE 'other'
    END
ORDER BY date DESC, type;

COMMENT ON FUNCTION get_reflection_trends IS 'Returns daily reflection statistics for the specified number of days';
COMMENT ON FUNCTION get_reflection_growth IS 'Returns weekly reflection counts with growth rates';
COMMENT ON FUNCTION get_top_learning_keywords IS 'Returns the most frequently occurring learning keywords';
