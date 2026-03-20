-- Migration: 031_ai_qc_skill
-- Description: Add AI Quality Control skill for peer review
-- Date: 2026-03-20

-- AI QC Skill for peer review workflow
INSERT INTO skills (
    id, name, description, instructions, source,
    version, builder, maintainer, tags, permissions,
    safety_score, scan_status, status, build_metadata,
    generation_prompt, installed_at
) VALUES (
    uuid_generate_v4(),
    'ai-qc',
    'AI Quality Control - Peer review workflow for autonomous AI agents',
    E'# AI Quality Control Skill

## Purpose
When one AI completes a task, other available AIs review the work for quality, correctness, and completeness.

## When to Initiate QC

### Automatic Triggers
1. **Task Completion** - Any task with priority >= 8
2. **Code Changes** - Any task that modified source files
3. **High Stakes** - Tasks tagged with "requires-review"
4. **Periodic** - Random 10% sample of completed tasks

### Manual Triggers
- Requested by human user
- Requested by task creator
- Escalation from other review

## What to Check

### 1. Code Quality
- Follows project conventions
- No obvious bugs or anti-patterns
- Error handling present
- No security issues (hardcoded secrets, injection)

### 2. Test Coverage
- New code has tests
- Existing tests still pass
- Edge cases covered
- Test quality (not just coverage %)

### 3. Documentation
- Complex logic explained
- Public APIs documented
- README updated if needed
- Breaking changes noted

### 4. Completeness
- Task requirements met
- Edge cases handled
- No TODO/FIXME left behind
- Related code updated

## How to Report Issues

### Format Findings
\`\`\`
## QC Report

### Summary
[Brief description of review outcome]

### Findings
1. **[CRITICAL] file:line - Issue description**
   - Suggestion: [How to fix]

2. **[HIGH] file:line - Issue description**
   - Suggestion: [How to fix]

### Praise
- [What was done well]

### Score
- Code Quality: X/10
- Test Coverage: X/10
- Documentation: X/10
- Overall: X/10
\`\`\`

### Reporting Options
1. **Task Queue** - Create follow-up tasks for issues found
2. **Memory** - Save findings for future reference
3. **Skills** - Save as review-learnings skill

## How to Credit Reviewers

### Attribution Format
\`\`\`
[REVIEWER]
reviewer_id: <agent-uuid>
timestamp: <ISO-8601>
task_id: <reviewed-task-id>
findings_count: <number>
overall_score: <X/10>
\`\`\`

### Credit Rules
- Each reviewer credited in task audit log
- Reviewer stats tracked (reviews_completed, avg_score)
- Top reviewers acknowledged in weekly summary

## Integration with Task System

### QC Task Creation
When QC is triggered, create a task:
- type: "qc-review"
- priority: based on original task priority
- assigned_to: next available AI
- depends_on: original task ID

### QC Task Fields
- original_task_id: The task being reviewed
- reviewer_id: The AI performing review
- status: pending -> in_progress -> completed
- findings: JSONB array of issues found

## Example Workflow

1. AI-1 completes task "Fix login bug" (priority 8)
2. System automatically creates qc-review task
3. AI-2 picks up qc-review task
4. AI-2 reviews code, finds 2 issues
5. AI-2 reports findings and creates follow-up tasks
6. AI-1 fixes issues
7. QC complete, reviewers credited

## Best Practices

1. **Be Constructive** - Focus on improvements, not criticism
2. **Be Specific** - Point to exact files and lines
3. **Be Timely** - Complete reviews within 1 hour
4. **Be Fair** - Consider constraints and context',
    'ai-built',
    '1.0.0',
    'nezha-ai',
    'nezha-ai',
    ARRAY['qc', 'review', 'quality', 'peer-review', 'autonomous'],
    ARRAY['read', 'write'],
    85,
    'reviewed',
    'pending',
    jsonb_build_object(
        'builtAt', NOW(),
        'builtBy', 'nezha-ai',
        'qualityScore', 85,
        'useCase', 'AI peer review workflow'
    ),
    'AI QC skill for peer review between autonomous agents',
    NOW()
) ON CONFLICT (name) DO NOTHING;

-- Create QC review tracking table
CREATE TABLE IF NOT EXISTS qc_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Links
    original_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    reviewer_id UUID,
    
    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'in_progress', 'completed', 'cancelled'
    )),
    
    -- Scores
    code_quality_score INTEGER,
    test_coverage_score INTEGER,
    documentation_score INTEGER,
    overall_score INTEGER,
    
    -- Results
    findings JSONB DEFAULT '[]',
    summary TEXT,
    
    -- Timing
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qc_reviews_original_task ON qc_reviews(original_task_id);
CREATE INDEX IF NOT EXISTS idx_qc_reviews_reviewer ON qc_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_qc_reviews_status ON qc_reviews(status);

-- Function to create QC review task
CREATE OR REPLACE FUNCTION create_qc_review(
    p_original_task_id UUID,
    p_priority INTEGER DEFAULT 5
)
RETURNS UUID AS $$
DECLARE
    v_review_id UUID;
    v_task_id UUID;
    v_task_title TEXT;
BEGIN
    -- Get original task title
    SELECT title INTO v_task_title FROM tasks WHERE id = p_original_task_id;
    
    -- Create QC review record
    INSERT INTO qc_reviews (id, original_task_id, status)
    VALUES (uuid_generate_v4(), p_original_task_id, 'pending')
    RETURNING id INTO v_review_id;
    
    -- Create QC review task
    v_task_id := uuid_generate_v4();
    INSERT INTO tasks (
        id, title, description, status, priority, type, category,
        depends_on, metadata
    ) VALUES (
        v_task_id,
        'QC Review: ' || COALESCE(v_task_title, 'Unknown Task'),
        '## Quality Control Review\n\nPlease review the completed task for quality, correctness, and completeness.\n\nUse the ai-qc skill to guide your review process.',
        'PENDING',
        LEAST(p_priority, 8), -- Cap at 8
        'qc-review',
        'quality',
        ARRAY[p_original_task_id],
        jsonb_build_object('qc_review_id', v_review_id)
    );
    
    RETURN v_review_id;
END;
$$ LANGUAGE plpgsql;
