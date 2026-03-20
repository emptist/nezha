-- Migration: 045_subsystem_integration
-- Description: Complete subsystem integration - DLQ auto-create issues, issues to tasks

-- 1. Function to auto-create issue from DLQ item
CREATE OR REPLACE FUNCTION create_issue_from_dlq()
RETURNS TRIGGER AS $$
DECLARE
    v_issue_id UUID;
BEGIN
    -- Only create issue for new unresolved DLQ items with critical/high errors
    IF NEW.resolved = false AND OLD.resolved IS NULL THEN
        IF NEW.error_category IN ('TRANSPORT', 'AUTH', 'CONFIG', 'TIMEOUT') THEN
            INSERT INTO issues (
                title, 
                description, 
                issue_type, 
                severity, 
                discovered_by,
                dlq_id,
                metadata
            )
            VALUES (
                'DLQ: ' || NEW.title,
                NEW.error_message || E'\n\nCategory: ' || NEW.error_category || E'\nRetry Count: ' || NEW.retry_count,
                'bug',
                CASE 
                    WHEN NEW.error_category = 'AUTH' THEN 'critical'
                    WHEN NEW.error_category = 'TRANSPORT' THEN 'high'
                    ELSE 'medium'
                END,
                'dlq-auto-create',
                NEW.id,
                jsonb_build_object('dlq_id', NEW.id, 'auto_created', true)
            )
            RETURNING id INTO v_issue_id;
            
            -- Link DLQ to issue
            UPDATE dead_letter_queue SET issue_id = v_issue_id WHERE id = NEW.id;
            
            -- Add event
            INSERT INTO issue_events (issue_id, event_type, actor, new_value)
            VALUES (v_issue_id, 'created', 'dlq-auto-create', 'Auto-created from DLQ item');
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for DLQ auto-create issue
DROP TRIGGER IF EXISTS create_issue_from_dlq ON dead_letter_queue;
CREATE TRIGGER create_issue_from_dlq
    AFTER INSERT ON dead_letter_queue
    FOR EACH ROW EXECUTE FUNCTION create_issue_from_dlq();

-- 2. Function to convert issue to task
CREATE OR REPLACE FUNCTION convert_issue_to_task(
    p_issue_id UUID,
    p_priority INTEGER DEFAULT 5,
    p_created_by TEXT DEFAULT 'system'
)
RETURNS UUID AS $$
DECLARE
    v_issue RECORD;
    v_task_id UUID;
BEGIN
    SELECT * INTO v_issue FROM issues WHERE id = p_issue_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Issue not found: %', p_issue_id;
    END IF;
    
    -- Create task from issue
    INSERT INTO tasks (
        title,
        description,
        status,
        priority,
        category,
        created_by,
        metadata
    )
    VALUES (
        v_issue.title,
        v_issue.description,
        'PENDING',
        p_priority,
        v_issue.issue_type,
        p_created_by,
        jsonb_build_object(
            'source', 'issue',
            'issue_id', p_issue_id,
            'issue_severity', v_issue.severity,
            'issue_tags', v_issue.tags
        )
    )
    RETURNING id INTO v_task_id;
    
    -- Update issue status
    UPDATE issues SET 
        status = 'in_progress',
        task_id = v_task_id,
        updated_at = NOW()
    WHERE id = p_issue_id;
    
    -- Add events
    INSERT INTO issue_events (issue_id, event_type, actor, new_value)
    VALUES (p_issue_id, 'converted_to_task', p_created_by, v_task_id::TEXT);
    
    RETURN v_task_id;
END;
$$ LANGUAGE plpgsql;

-- 3. Function to link review to issue
CREATE OR REPLACE FUNCTION link_review_to_issue_auto()
RETURNS TRIGGER AS $$
BEGIN
    -- If review has critical findings, auto-create issue
    IF NEW.overall_score < 50 AND OLD.overall_score IS NULL THEN
        INSERT INTO issues (
            title,
            description,
            issue_type,
            severity,
            discovered_by,
            review_id,
            metadata
        )
        VALUES (
            'Review Finding: ' || COALESCE(NEW.summary, 'Low score review'),
            'Review ID: ' || NEW.id || E'\nScore: ' || NEW.overall_score || '/100',
            'bug',
            CASE WHEN NEW.overall_score < 30 THEN 'critical' ELSE 'high' END,
            'review-auto-create',
            NEW.id,
            jsonb_build_object('review_id', NEW.id, 'auto_created', true)
        )
        RETURNING id INTO NEW.issue_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for review auto-create issue
DROP TRIGGER IF EXISTS link_review_to_issue_auto ON inter_reviews;
CREATE TRIGGER link_review_to_issue_auto
    AFTER INSERT ON inter_reviews
    FOR EACH ROW EXECUTE FUNCTION link_review_to_issue_auto();

-- 4. Unified view for all subsystem items
CREATE OR REPLACE VIEW subsystem_items AS
SELECT 
    'task' as item_type,
    t.id,
    t.title,
    t.status,
    t.created_at,
    t.updated_at,
    NULL as severity,
    t.priority,
    NULL as error_category,
    NULL as overall_score
FROM tasks t

UNION ALL

SELECT 
    'issue' as item_type,
    i.id,
    i.title,
    i.status,
    i.created_at,
    i.updated_at,
    i.severity,
    NULL as priority,
    NULL as error_category,
    NULL as overall_score
FROM issues i

UNION ALL

SELECT 
    'dlq' as item_type,
    d.id,
    d.title,
    CASE WHEN d.resolved THEN 'resolved' ELSE 'pending' END,
    d.failed_at as created_at,
    d.failed_at as updated_at,
    NULL as severity,
    NULL as priority,
    d.error_category,
    NULL as overall_score
FROM dead_letter_queue d

UNION ALL

SELECT 
    'review' as item_type,
    r.id,
    COALESCE(r.summary, 'Review') as title,
    r.status,
    r.requested_at as created_at,
    r.completed_at as updated_at,
    NULL as severity,
    NULL as priority,
    NULL as error_category,
    r.overall_score
FROM inter_reviews r

ORDER BY created_at DESC;

-- 5. Function to get subsystem statistics
CREATE OR REPLACE FUNCTION get_subsystem_stats()
RETURNS TABLE(
    subsystem TEXT,
    total BIGINT,
    pending BIGINT,
    completed BIGINT,
    failed BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 'tasks'::TEXT, 
           COUNT(*), 
           COUNT(*) FILTER (WHERE status = 'PENDING'),
           COUNT(*) FILTER (WHERE status = 'COMPLETED'),
           COUNT(*) FILTER (WHERE status = 'FAILED')
    FROM tasks
    
    UNION ALL
    
    SELECT 'issues'::TEXT,
           COUNT(*),
           COUNT(*) FILTER (WHERE status = 'open'),
           COUNT(*) FILTER (WHERE status = 'resolved'),
           COUNT(*) FILTER (WHERE status = 'wont_fix')
    FROM issues
    
    UNION ALL
    
    SELECT 'dlq'::TEXT,
           COUNT(*),
           COUNT(*) FILTER (WHERE resolved = false),
           COUNT(*) FILTER (WHERE resolved = true),
           0::BIGINT
    FROM dead_letter_queue
    
    UNION ALL
    
    SELECT 'reviews'::TEXT,
           COUNT(*),
           COUNT(*) FILTER (WHERE status = 'pending'),
           COUNT(*) FILTER (WHERE status = 'completed'),
           COUNT(*) FILTER (WHERE status = 'failed')
    FROM inter_reviews;
END;
$$ LANGUAGE plpgsql;

-- 6. Function to find related items across subsystems
CREATE OR REPLACE FUNCTION find_related_items(p_item_id UUID, p_item_type TEXT)
RETURNS TABLE(
    item_type TEXT,
    item_id UUID,
    title TEXT,
    relationship TEXT
) AS $$
BEGIN
    IF p_item_type = 'task' THEN
        -- Find related issues
        RETURN QUERY
        SELECT 'issue'::TEXT, i.id, i.title, 'created_from_task'::TEXT
        FROM issues i WHERE i.task_id = p_item_id;
        
        -- Find related reviews
        RETURN QUERY
        SELECT 'review'::TEXT, r.id, COALESCE(r.summary, 'Review'), 'reviewed_task'::TEXT
        FROM inter_reviews r WHERE r.task_id = p_item_id;
        
        -- Find related DLQ
        RETURN QUERY
        SELECT 'dlq'::TEXT, d.id, d.title, 'dlq_from_task'::TEXT
        FROM dead_letter_queue d WHERE d.original_task_id = p_item_id;
        
    ELSIF p_item_type = 'issue' THEN
        -- Find related task
        RETURN QUERY
        SELECT 'task'::TEXT, t.id, t.title, 'converted_to_task'::TEXT
        FROM tasks t WHERE t.id IN (SELECT task_id FROM issues WHERE id = p_item_id);
        
        -- Find related review
        RETURN QUERY
        SELECT 'review'::TEXT, r.id, COALESCE(r.summary, 'Review'), 'created_issue'::TEXT
        FROM inter_reviews r WHERE r.id IN (SELECT review_id FROM issues WHERE id = p_item_id);
        
        -- Find related DLQ
        RETURN QUERY
        SELECT 'dlq'::TEXT, d.id, d.title, 'created_issue'::TEXT
        FROM dead_letter_queue d WHERE d.id IN (SELECT dlq_id FROM issues WHERE id = p_item_id);
        
    ELSIF p_item_type = 'review' THEN
        -- Find related task
        RETURN QUERY
        SELECT 'task'::TEXT, t.id, t.title, 'reviewed'::TEXT
        FROM tasks t WHERE t.id IN (SELECT task_id FROM inter_reviews WHERE id = p_item_id);
        
        -- Find related issue
        RETURN QUERY
        SELECT 'issue'::TEXT, i.id, i.title, 'created_from_review'::TEXT
        FROM issues i WHERE i.review_id = p_item_id;
        
    ELSIF p_item_type = 'dlq' THEN
        -- Find related task
        RETURN QUERY
        SELECT 'task'::TEXT, t.id, t.title, 'original_task'::TEXT
        FROM tasks t WHERE t.id IN (SELECT original_task_id FROM dead_letter_queue WHERE id = p_item_id);
        
        -- Find related issue
        RETURN QUERY
        SELECT 'issue'::TEXT, i.id, i.title, 'created_from_dlq'::TEXT
        FROM issues i WHERE i.dlq_id = p_item_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;
