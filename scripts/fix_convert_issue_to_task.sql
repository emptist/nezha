-- Fix convert_issue_to_task function to remove metadata column

CREATE OR REPLACE FUNCTION convert_issue_to_task(
    p_issue_id UUID,
    p_priority INTEGER DEFAULT 5,
    p_created_by TEXT DEFAULT 'system'
) RETURNS UUID AS $$
DECLARE
    v_issue RECORD;
    v_task_id UUID;
BEGIN
    SELECT * INTO v_issue FROM issues WHERE id = p_issue_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Issue not found: %', p_issue_id;
    END IF;

    -- Create task from issue (without metadata column)
    INSERT INTO tasks (
        title,
        description,
        status,
        priority,
        category,
        created_by
    )
    VALUES (
        v_issue.title,
        v_issue.description,
        'PENDING',
        p_priority,
        v_issue.issue_type,
        p_created_by
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

COMMENT ON FUNCTION convert_issue_to_task IS 'Converts an issue to a task and links them';
