-- Migration: 034_meeting_participation_skill
-- Description: Add meeting participation skill for AI deliberation
-- Date: 2026-03-20

-- Meeting Participation Skill
INSERT INTO skills (
    id, name, description, instructions, source,
    version, builder, maintainer, tags, permissions,
    safety_score, scan_status, status, build_metadata,
    generation_prompt, installed_at
) VALUES (
    uuid_generate_v4(),
    'meeting-participation',
    'AI skill for participating in multi-agent discussions and reaching consensus',
    E'# Meeting Participation Skill

## Purpose
Enable autonomous AI agents to participate in group discussions, share opinions, and reach consensus on important decisions.

## How to Receive Meeting Notifications

### Poll for Discussion Tasks
Check for new discussion tasks:
\\`\\`\\`sql
SELECT id, title, description, priority, created_by
FROM tasks
WHERE type = ''"''discussion'"''''
  AND status = ''"''PENDING'"''''
ORDER BY priority DESC, created_at ASC;
\\`\\`\\`

### Poll for Meeting Invites
Check project_communications for meeting invites:
\\`\\`\\`sql
SELECT * FROM project_communications
WHERE message_type = ''"''notification'"''
  AND content LIKE ''"''%Discussion:%'"''''
  AND read_at IS NULL
ORDER BY created_at DESC;
\\`\\`\\`

## How to Join a Discussion

### Step 1: Read the Discussion Task
Retrieve the full discussion details:
\\`\\`\\`sql
SELECT id, title, description, priority, created_by
FROM tasks WHERE id = ''"''<discussion_id>'"'';
\\`\\`\\`

### Step 2: Check Existing Opinions
See what others have said:
\\`\\`\\`sql
SELECT content, metadata
FROM memory
WHERE metadata->>''"''type'"'' = ''"''opinion'"''''
  AND metadata->>''"''discussionId'"'' = ''"''<discussion_id>'"''''
ORDER BY created_at ASC;
\\`\\`\\`

### Step 3: Form Your Opinion
Consider:
- What is the core question?
- What are the trade-offs?
- What has worked before?
- What are the risks?

## How to Respond with Opinions

### Opinion Format
Share your perspective using this structure:
\\`\\`\\`markdown
## Opinion from [Your Agent ID]

**Perspective**: [Your position on the topic]

**Key Points**:
1. [First consideration]
2. [Second consideration]
3. [Third consideration]

**Reasoning**: [Why you hold this position]

**Concerns**: [Potential downsides or risks - or "None"]

**Suggestions**: [Specific recommendations - or "None"]
\\`\\`\\`

### Recording Your Opinion
After forming your opinion, record it:
\\`\\`\\`sql
INSERT INTO memory (content, metadata, importance, source)
VALUES (
  ''"''## Opinion from [AGENT_ID]

  Perspective: [your perspective]
  ...'"''",
  jsonb_build_object(
    ''"''type'"'',
    ''"''opinion'"'',
    ''"''discussionId'"'',
    ''"''<discussion_id>'"''",
    ''"''author'"'',
    ''"''<your_agent_id>'"''"
  ),
  7,
  ''"''meeting-participation'"''
);
\\`\\`\\`

## How to Recognize Consensus

### Consensus Triggers
Consensus is reached when:
1. **Majority Agreement**: >50% share similar perspective
2. **Suggestion Alignment**: Same suggestion appears multiple times
3. **No Objections**: No new concerns raised after agreement
4. **Time Threshold**: Discussion open for >24 hours with no new input

### Detecting Consensus
Look for patterns in opinions:
- Similar key points across opinions
- Same suggestions repeated
- Lack of new opposing viewpoints

### When Consensus is Reached
Create a consensus task:
\\`\\`\\`sql
INSERT INTO tasks (title, description, status, priority, type, category)
VALUES (
  ''"''Consensus: [topic]'"''",
  ''"''## Consensus Reached

Decision: [agreed position]
Based on: [summary of discussion]
Next steps: [action items]'"''",
  ''"''PENDING'"''",
  8,
  ''"''decision'"''",
  ''"''collaboration'"''"
);
\\`\\`\\`

## When to Escalate to Human

### Escalation Triggers
Escalate when:
1. **Deadlock**: No progress after 3 rounds of discussion
2. **Safety Concerns**: Discussion involves security/safety issues
3. **Resource Conflict**: Competing resource needs
4. **Human Required**: Decision requires human approval

### Escalation Format
Notify humans:
\\`\\`\\`
[ESCALATE]
reason: [why human input needed]
discussion_id: [id]
summary: [brief summary]
options: [possible choices]
\\`\\`\\`

## Discussion Workflow

### Phase 1: Initial Response (0-1 hour)
- Read discussion
- Form opinion
- Share perspective

### Phase 2: Engagement (1-6 hours)
- Review other opinions
- Respond to concerns
- Refine position if needed

### Phase 3: Convergence (6-24 hours)
- Look for agreement
- Build on consensus
- Summarize alignment

### Phase 4: Resolution (24+ hours)
- Create consensus if reached
- Escalate if deadlocked
- Document outcome

## Best Practices

1. **Be Constructive**: Build on others'"'' ideas, don'"''t just oppose
2. **Be Specific**: Concrete suggestions > vague agreement
3. **Be Timely**: Respond within reasonable timeframes
4. **Be Open**: Willing to change position based on good arguments
5. **Document Reasoning**: Your reasoning should be clear for future reference

## Anti-Patterns to Avoid

- Repeating others'"'' points without adding value
- Personal attacks or dismissing others
- Stonewalling without explanation
- Changing position without acknowledgment
- Creating tasks without consensus

## Integration

This skill works with:
- **MeetingHandler**: Processes discussion tasks
- **project_communications**: Receives notifications
- **memory**: Stores opinions
- **tasks**: Creates follow-up decisions',
    'ai-built',
    '1.0.0',
    'nezha-ai',
    'nezha-ai',
    ARRAY['meeting', 'discussion', 'collaboration', 'consensus', 'deliberation'],
    ARRAY['read', 'write'],
    90,
    'reviewed',
    'approved',
    jsonb_build_object(
        'builtAt', NOW(),
        'useCase', 'AI-to-AI deliberation',
        'phases', ARRAY['initial', 'engagement', 'convergence', 'resolution']
    ),
    'Meeting participation skill for autonomous deliberation',
    NOW()
) ON CONFLICT (name) DO NOTHING;
