-- Add FAKE_COMPLETE status for tasks where AI claims done without action
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check 
  CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'FAKE_COMPLETE'));
