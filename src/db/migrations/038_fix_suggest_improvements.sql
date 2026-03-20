-- Fix ambiguous column reference in suggest_improvements_from_failures function

CREATE OR REPLACE FUNCTION suggest_improvements_from_failures(
    p_project_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
    error_category VARCHAR(100),
    failure_count BIGINT,
    avg_execution_time_ms NUMERIC,
    suggested_improvement TEXT,
    confidence_score FLOAT,
    related_pattern_id UUID,
    related_memory_id UUID
) AS $$
BEGIN
    RETURN QUERY
    WITH recent_failures AS (
        SELECT 
            tto.error_category,
            COUNT(*) as failure_count,
            AVG(tto.execution_time_ms)::NUMERIC as avg_time,
            ARRAY_AGG(DISTINCT tto.error_message) as error_messages
        FROM task_outcomes tto
        WHERE tto.status = 'FAILED'
          AND tto.created_at >= NOW() - INTERVAL '7 days'
          AND (p_project_id IS NULL OR tto.project_id = p_project_id)
        GROUP BY tto.error_category
        HAVING COUNT(*) >= 2
    ),
    best_patterns AS (
        SELECT 
            tp.id,
            tp.pattern_content,
            tp.pattern_category,
            tp.success_rate
        FROM task_patterns tp
        WHERE tp.pattern_type = 'success'
          AND tp.pattern_category = ANY(SELECT rf.error_category FROM recent_failures rf)
          AND tp.is_active = TRUE
        ORDER BY tp.success_rate DESC
        LIMIT p_limit
    ),
    related_memories AS (
        SELECT 
            m.id,
            m.content,
            m.metadata
        FROM memory m
        WHERE m.embedding IS NOT NULL
          AND EXISTS (
              SELECT 1 FROM recent_failures rf 
              WHERE m.content ILIKE '%' || rf.error_category || '%'
          )
        LIMIT p_limit
    )
    SELECT 
        rf.error_category,
        rf.failure_count,
        rf.avg_time,
        'Consider applying patterns with >70% success rate for ' || rf.error_category AS suggested_improvement,
        LEAST(1.0, rf.failure_count / 10.0)::FLOAT as confidence_score,
        bp.id as related_pattern_id,
        rm.id as related_memory_id
    FROM recent_failures rf
    LEFT JOIN LATERAL (
        SELECT bp2.id, bp2.pattern_content FROM best_patterns bp2
        WHERE bp2.pattern_category = rf.error_category 
        LIMIT 1
    ) bp ON TRUE
    LEFT JOIN LATERAL (
        SELECT rm2.id FROM related_memories rm2 LIMIT 1
    ) rm ON TRUE
    ORDER BY rf.failure_count DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
