-- Migration: 025_dlq_analytics_and_failure_patterns
-- Description: Enhanced DLQ analytics, failure pattern extraction, and analysis functions

-- 1. Create function to analyze DLQ and generate insights
CREATE OR REPLACE FUNCTION analyze_dlq_patterns()
RETURNS TABLE(
    error_category TEXT,
    pattern_type TEXT,
    occurrence_count BIGINT,
    first_occurrence TIMESTAMPTZ,
    last_occurrence TIMESTAMPTZ,
    avg_retries DECIMAL,
    example_error TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dlq.error_category,
        CASE
            WHEN dlq.error_message LIKE '%timeout%' OR dlq.error_message LIKE '%Timeout%' THEN 'timeout_related'
            WHEN dlq.error_message LIKE '%connection%' OR dlq.error_message LIKE '%ECONN%' THEN 'connection_issues'
            WHEN dlq.error_message LIKE '%memory%' OR dlq.error_message LIKE '%heap%' THEN 'resource_constraints'
            WHEN dlq.error_message LIKE '%not found%' OR dlq.error_message LIKE '%ENOENT%' THEN 'missing_resources'
            WHEN dlq.error_message LIKE '%permission%' OR dlq.error_message LIKE '%access%' THEN 'permission_issues'
            WHEN dlq.error_message LIKE '%invalid%' OR dlq.error_message LIKE '%malformed%' THEN 'input_validation'
            WHEN dlq.error_message LIKE '%syntax%' OR dlq.error_message LIKE '%parse%' THEN 'syntax_errors'
            ELSE 'other'
        END as pattern_type,
        COUNT(*) as occurrence_count,
        MIN(dlq.failed_at) as first_occurrence,
        MAX(dlq.failed_at) as last_occurrence,
        AVG(dlq.retry_count)::DECIMAL(10,2) as avg_retries,
        (SELECT dlq2.error_message FROM dead_letter_queue dlq2 
         WHERE dlq2.error_category = dlq.error_category 
         ORDER BY dlq2.failed_at DESC LIMIT 1) as example_error
    FROM dead_letter_queue dlq
    WHERE dlq.resolved = false
    GROUP BY dlq.error_category, 
        CASE
            WHEN dlq.error_message LIKE '%timeout%' OR dlq.error_message LIKE '%Timeout%' THEN 'timeout_related'
            WHEN dlq.error_message LIKE '%connection%' OR dlq.error_message LIKE '%ECONN%' THEN 'connection_issues'
            WHEN dlq.error_message LIKE '%memory%' OR dlq.error_message LIKE '%heap%' THEN 'resource_constraints'
            WHEN dlq.error_message LIKE '%not found%' OR dlq.error_message LIKE '%ENOENT%' THEN 'missing_resources'
            WHEN dlq.error_message LIKE '%permission%' OR dlq.error_message LIKE '%access%' THEN 'permission_issues'
            WHEN dlq.error_message LIKE '%invalid%' OR dlq.error_message LIKE '%malformed%' THEN 'input_validation'
            WHEN dlq.error_message LIKE '%syntax%' OR dlq.error_message LIKE '%parse%' THEN 'syntax_errors'
            ELSE 'other'
        END
    ORDER BY occurrence_count DESC;
END;
$$ LANGUAGE plpgsql;

-- 2. Create function to extract failure pattern from error message
CREATE OR REPLACE FUNCTION extract_failure_pattern(p_error_message TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN CASE
        WHEN p_error_message ~* 'timeout|timed?\s*out|ETIMEDOUT' THEN 'timeout_related'
        WHEN p_error_message ~* 'ECONNREFUSED|ECONNRESET|ENOTFOUND|ENETUNREACH|network|connection' THEN 'connection_issues'
        WHEN p_error_message ~* 'out\s*of\s*memory|heap|memory\s*exhausted|allocation\s*failed' THEN 'resource_constraints'
        WHEN p_error_message ~* 'ENOENT|not\s*found|missing|file.*not\s*found' THEN 'missing_resources'
        WHEN p_error_message ~* 'permission\s*denied|access\s*denied|EACCES|EPERM' THEN 'permission_issues'
        WHEN p_error_message ~* 'invalid.*input|malformed|validation|constraint' THEN 'input_validation'
        WHEN p_error_message ~* '401|403|unauthorized|forbidden|auth' THEN 'authentication_issues'
        WHEN p_error_message ~* 'spawn.*failed|exec\s*format|opencode.*not\s*found' THEN 'transport_errors'
        WHEN p_error_message ~* '500|502|503|504|server\s*error|internal\s*error|panic|crash' THEN 'server_errors'
        WHEN p_error_message ~* 'rate\s*limit|throttl|quota|backoff|max.*limit' THEN 'rate_limiting'
        WHEN p_error_message ~* 'assertion|invariant|typeerror|referenceerror|syntaxerror|null.*is.*function' THEN 'logic_errors'
        ELSE 'unknown_error'
    END;
END;
$$ LANGUAGE plpgsql;

-- 3. Create view for failure trend analysis
CREATE OR REPLACE VIEW failure_trend_analysis AS
SELECT 
    date_trunc('day', failed_at) as failure_date,
    error_category,
    COUNT(*) as failure_count,
    AVG(retry_count) as avg_retries,
    COUNT(*) FILTER (WHERE watchdog_kills > 0) as watchdog_kill_count
FROM dead_letter_queue
GROUP BY date_trunc('day', failed_at), error_category
ORDER BY failure_date DESC;

-- 4. Create view for task health metrics
CREATE OR REPLACE VIEW task_health_metrics AS
SELECT 
    CASE 
        WHEN status = 'COMPLETED' THEN 'success'
        WHEN status = 'FAILED' AND is_stuck = true THEN 'stuck'
        WHEN status = 'FAILED' AND consecutive_failures > 0 THEN 'failed_with_retries'
        WHEN status = 'FAILED' THEN 'immediate_failure'
        WHEN status = 'RUNNING' AND is_stuck = true THEN 'stuck_running'
        ELSE 'other'
    END as health_status,
    COUNT(*) as count,
    AVG(EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - created_at))) as avg_duration_seconds,
    AVG(retry_count) as avg_retries,
    AVG(watchdog_kills) as avg_watchdog_kills
FROM tasks
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY 
    CASE 
        WHEN status = 'COMPLETED' THEN 'success'
        WHEN status = 'FAILED' AND is_stuck = true THEN 'stuck'
        WHEN status = 'FAILED' AND consecutive_failures > 0 THEN 'failed_with_retries'
        WHEN status = 'FAILED' THEN 'immediate_failure'
        WHEN status = 'RUNNING' AND is_stuck = true THEN 'stuck_running'
        ELSE 'other'
    END;

-- 5. Create function to get actionable recommendations based on DLQ analysis
CREATE OR REPLACE FUNCTION get_failure_recommendations()
RETURNS TABLE(
    priority INTEGER,
    category TEXT,
    recommendation TEXT,
    affected_tasks BIGINT,
    estimated_impact TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH category_stats AS (
        SELECT 
            error_category,
            COUNT(*) as count,
            AVG(retry_count) as avg_retries
        FROM dead_letter_queue
        WHERE resolved = false
        GROUP BY error_category
    )
    SELECT 
        CASE cs.error_category
            WHEN 'NETWORK' THEN 1
            WHEN 'TIMEOUT' THEN 2
            WHEN 'RESOURCE' THEN 3
            WHEN 'SERVER' THEN 4
            WHEN 'TRANSPORT' THEN 5
            WHEN 'AUTH' THEN 6
            WHEN 'LOGIC' THEN 7
            ELSE 8
        END as priority,
        cs.error_category as category,
        CASE cs.error_category
            WHEN 'NETWORK' THEN 'Check network connectivity and firewall rules. Consider adding redundancy.'
            WHEN 'TIMEOUT' THEN 'Increase timeout thresholds or optimize slow operations.'
            WHEN 'RESOURCE' THEN 'Scale up infrastructure or optimize resource usage.'
            WHEN 'SERVER' THEN 'Investigate server-side issues and add retry with longer delays.'
            WHEN 'TRANSPORT' THEN 'Verify opencode installation and PATH configuration.'
            WHEN 'AUTH' THEN 'Review and update authentication credentials.'
            WHEN 'LOGIC' THEN 'Code review needed - logic errors require manual fixes.'
            ELSE 'Generic error - review logs for specific details.'
        END as recommendation,
        cs.count as affected_tasks,
        CASE 
            WHEN cs.count > 10 THEN 'high'
            WHEN cs.count > 5 THEN 'medium'
            ELSE 'low'
        END as estimated_impact
    FROM category_stats cs
    ORDER BY priority;
END;
$$ LANGUAGE plpgsql;

-- 6. Update dead_letter_queue with pattern extraction
UPDATE dead_letter_queue 
SET failure_pattern = extract_failure_pattern(error_message)
WHERE failure_pattern IS NULL;

-- 7. Create index for faster pattern analysis
CREATE INDEX IF NOT EXISTS idx_dlq_failure_pattern ON dead_letter_queue(failure_pattern) WHERE failure_pattern IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dlq_failed_at_category ON dead_letter_queue(failed_at, error_category);
