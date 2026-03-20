CREATE OR REPLACE VIEW subsystem_items AS
SELECT 
    'task'::TEXT as item_type,
    t.id,
    t.title,
    t.status,
    t.created_at,
    t.updated_at,
    NULL::TEXT as severity,
    t.priority,
    NULL::TEXT as error_category,
    NULL::INTEGER as overall_score
FROM tasks t

UNION ALL

SELECT 
    'issue'::TEXT as item_type,
    i.id,
    i.title,
    i.status,
    i.created_at,
    i.updated_at,
    i.severity,
    NULL::INTEGER as priority,
    NULL::TEXT as error_category,
    NULL::INTEGER as overall_score
FROM issues i

UNION ALL

SELECT 
    'dlq'::TEXT as item_type,
    d.id,
    d.title,
    CASE WHEN d.resolved THEN 'resolved' ELSE 'pending' END,
    d.failed_at as created_at,
    d.failed_at as updated_at,
    NULL::TEXT as severity,
    NULL::INTEGER as priority,
    d.error_category,
    NULL::INTEGER as overall_score
FROM dead_letter_queue d

UNION ALL

SELECT 
    'review'::TEXT as item_type,
    r.id,
    COALESCE(r.summary, 'Review') as title,
    r.status,
    r.requested_at as created_at,
    r.completed_at as updated_at,
    NULL::TEXT as severity,
    NULL::INTEGER as priority,
    NULL::TEXT as error_category,
    r.overall_score
FROM inter_reviews r

ORDER BY created_at DESC;
