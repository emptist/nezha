-- Fix log_skill_change trigger function to handle NULL project_id
-- The skills.project_id is TEXT but skill_audit_log.project_id is UUID
-- This fix removes project_id from the audit log insert

CREATE OR REPLACE FUNCTION log_skill_change()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO skill_audit_log (skill_id, action, performed_by, new_status, details)
        VALUES (NEW.id, 'installed', 'system', NEW.status, jsonb_build_object('version', NEW.version));
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            INSERT INTO skill_audit_log (skill_id, action, performed_by, old_status, new_status, details)
            VALUES (
                NEW.id,
                CASE
                    WHEN NEW.status = 'approved' THEN 'approved'
                    WHEN NEW.status = 'rejected' THEN 'rejected'
                    WHEN NEW.status = 'installed' THEN 'installed'
                    WHEN NEW.status = 'uninstalled' THEN 'uninstalled'
                    ELSE 'updated'
                END,
                'system',
                OLD.status, NEW.status,
                jsonb_build_object('safety_score', NEW.safety_score)
            );
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
