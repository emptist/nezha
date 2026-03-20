-- Migration: 024_populate_skills_from_docs
-- Description: Populate skills table with existing knowledge from .trae/skills and docs

-- =============================================
-- Skill: continuous-improvement
-- =============================================
INSERT INTO skills (id, name, description, version, category, tags, source, author, content, builder, maintainer, build_metadata, generation_prompt)
VALUES (
    'a1000000-0000-0000-0000-000000000001',
    'continuous-improvement',
    'PDCA cycle (Plan-Do-Check-Act) for continuous self-improvement. Includes OpenClaw comparison for meta-level review.',
    '1.0.0',
    'workflow',
    ARRAY['improvement', 'pdca', 'self-improvement', 'openclaw-comparison'],
    'ai-built',
    'Trae AI + Nezha',
    '{"instructions": "## PDCA Cycle for Continuous Improvement\n\n### Step 1: REVIEW - Analyze Current State\n- Code Quality: Look for dead code, bugs, inconsistencies\n- Documentation: Check for outdated or missing docs\n- Tests: Identify missing or failing tests\n- Performance: Find optimization opportunities\n- Architecture: Spot design issues\n\n### Step 2: PLAN - Create Tasks\nPrioritization:\n- 9-10: Critical bugs, security issues\n- 7-8: High impact, blocking issues\n- 5-6: Important improvements\n- 3-4: Nice to have\n- 1-2: Low priority\n\n### Step 3: DO - Delegate Execution\n- One task at a time\n- Clear context with file references\n- Expected outcome defined\n\n### Step 4: CHECK - Verify Results\n- Task status is COMPLETED\n- Code changes are correct\n- No new errors introduced\n- Tests still pass\n\n### Step 5: ACT - Update Memory\n- What worked: Successful approaches\n- What did not work: Failed attempts\n- New patterns: Discovered best practices\n- Lessons learned: Key takeaways\n\n### OpenClaw Comparison\nCompare against OpenClaw features:\n- Heartbeat mechanism\n- Task self-generation\n- Memory system\n- Skill system", "useCases": ["self-review cycles", "code quality improvement", "system comparison", "meta-level improvement"]}',
    'nezha-ai',
    'nezha-ai',
    '{"builtAt": "2026-03-20", "builtBy": "nezha-ai", "sourceFile": ".trae/skills/continuous-improvement.md"}',
    'Extracted from .trae/skills/continuous-improvement.md - PDCA cycle for continuous improvement'
)
ON CONFLICT (id) DO UPDATE SET
    updated_at = NOW();

-- =============================================
-- Skill: nezha-workflow
-- =============================================
INSERT INTO skills (id, name, description, version, category, tags, source, author, content, builder, maintainer, build_metadata, generation_prompt)
VALUES (
    'a1000000-0000-0000-0000-000000000002',
    'nezha-workflow',
    'Workflow for Trae AI to delegate tasks to Nezha and review OpenCode AI results.',
    '1.0.0',
    'workflow',
    ARRAY['workflow', 'delegation', 'task-management', 'nezha-integration'],
    'ai-built',
    'Trae AI + Nezha',
    '{"instructions": "## Nezha Workflow\n\n### Identify Work\n- Code review findings\n- Dead code, Bugs, Inconsistencies\n\n### Create Task\nnode dist/cli/index.js task-add TITLE DESCRIPTION PRIORITY\n\n### Monitor, Review, Iterate\nSave learnings to memory", "useCases": ["task delegation", "monitoring", "review"]}',
    'nezha-ai',
    'nezha-ai',
    '{"builtAt": "2026-03-20", "builtBy": "nezha-ai", "sourceFile": ".trae/skills/nezha-workflow.md"}',
    'Extracted from .trae/skills/nezha-workflow.md - Nezha workflow for Trae AI'
)
ON CONFLICT (id) DO UPDATE SET
    updated_at = NOW(), content = EXCLUDED.content;

-- =============================================
-- Skill: skill-system
-- =============================================
INSERT INTO skills (id, name, description, version, category, tags, source, author, content, builder, maintainer, build_metadata, generation_prompt)
VALUES (
    'a1000000-0000-0000-0000-000000000003',
    'skill-system',
    'Nezha Skill System Architecture - PostgreSQL-first skill management with security scanning and quality gates.',
    '1.0.0',
    'architecture',
    ARRAY['skills', 'architecture', 'postgresql', 'security', 'clawhub'],
    'ai-built',
    'Nezha',
    '{"instructions": "## Nezha Skill System Architecture\n\n### Core Principle\nPostgreSQL-first. File system only when inevitable.\n\n### Skill Sources\n1. **ClawHub Marketplace** - External skills with full safety pipeline\n   - Static code analysis\n   - Dangerous pattern detection\n   - Safety scoring (0-100)\n   - User approval required\n   - Auto-block malicious skills\n\n2. **Internally-Built** - AI-generated skills\n   - Full control over content\n   - No external dependencies\n   - Builder/maintainer tracked\n   - Version controlled\n\n3. **Task Review** - Auto-learned from QC\n   - Quality assessment\n   - Issue detection\n   - Pattern extraction\n\n### DB-Only Loading\nDisk files NEVER loaded. All skills from PostgreSQL.\nEnforced by DatabaseSkillLoader.\n\n### CLI Commands\n```bash\n# Search and browse\nnezha skills search <query>\nnezha skills browse\n\n# Install from ClawHub\nnezha skills install <skill-name>\n\n# Build new skill\nnezha skills build <name> <purpose>\n\n# Improve existing skill\nnezha skills improve <skill-id> \"<improvement>\"\n```", "useCases": ["skill management", "security review", "skill building"]}',
    'nezha-ai',
    'nezha-ai',
    '{"builtAt": "2026-03-20", "builtBy": "nezha-ai", "sourceFile": "docs/SKILL_SYSTEM.md"}',
    'Extracted from docs/SKILL_SYSTEM.md - Skill system architecture'
)
ON CONFLICT (id) DO UPDATE SET
    updated_at = NOW();

-- =============================================
-- Skill: testing-strategy
-- =============================================
INSERT INTO skills (id, name, description, version, category, tags, source, author, content, builder, maintainer, build_metadata, generation_prompt)
VALUES (
    'a1000000-0000-0000-0000-000000000004',
    'testing-strategy',
    'Comprehensive testing strategy for Nezha: unit, integration, E2E tests with coverage targets.',
    '1.0.0',
    'development',
    ARRAY['testing', 'coverage', 'unit-tests', 'integration-tests', 'e2e'],
    'ai-built',
    'Nezha',
    '{"instructions": "## Testing Strategy\n\n### Testing Pyramid\n1. **E2E Tests** - Top, few critical paths\n2. **Integration Tests** - Component collaboration\n3. **Unit Tests** - Individual functions/classes\n4. **Database Tests** - SQL operations\n\n### Coverage Targets\n| Type | Target |\n|------|--------|\n| Database operations | 90% |\n| Memory Skills | 85% |\n| Prompt Builder | 80% |\n| Integration | 70% |\n| E2E | 100% critical paths |\n\n### Test Principles\n1. Fast feedback - Unit < 1s, Integration < 10s\n2. Independence - Each test standalone\n3. Repeatability - Consistent results\n4. Meaningful assertions\n5. Clear naming\n\n### Test Locations\n- `src/__tests__/db/` - Database tests\n- `src/__tests__/unit/` - Unit tests\n- `src/__tests__/integration/` - Integration tests\n- `src/__tests__/e2e/` - E2E tests", "useCases": ["writing tests", "coverage analysis", "test planning"]}',
    'nezha-ai',
    'nezha-ai',
    '{"builtAt": "2026-03-20", "builtBy": "nezha-ai", "sourceFile": "docs/TESTING_STRATEGY.md"}',
    'Extracted from docs/TESTING_STRATEGY.md - Testing strategy'
)
ON CONFLICT (id) DO UPDATE SET
    updated_at = NOW();

-- =============================================
-- Skill: learned-patterns
-- =============================================
INSERT INTO skills (id, name, description, version, category, tags, source, author, content, builder, maintainer, build_metadata, generation_prompt)
VALUES (
    'a1000000-0000-0000-0000-000000000005',
    'learned-patterns',
    'Key patterns and best practices learned during Nezha development.',
    '1.0.0',
    'development',
    ARRAY['patterns', 'best-practices', 'typescript', 'types'],
    'ai-built',
    'Nezha',
    '{"instructions": "## Learned Patterns\n\n### TypeScript: Use `export type` for Type-Only Exports\n\nWhen re-exporting interfaces and types, use `export type` instead of `export`.\n\n**Correct:**\n```typescript\nexport type { EmbeddingProvider, EmbeddingConfig } from ''./types.js'';\n```\n\n**Incorrect (will fail at runtime):**\n```typescript\nexport { EmbeddingProvider, EmbeddingConfig } from ''./types.js'';\n```\n\n**Why:** TypeScript strips interfaces from JavaScript output. Regular exports fail at runtime because interfaces dont exist in .js files.\n\n**Files affected:**\n- src/services/embedding/index.ts\n- src/services/ai/index.ts", "useCases": ["typescript best practices", "avoiding runtime errors", "type exports"]}',
    'nezha-ai',
    'nezha-ai',
    '{"builtAt": "2026-03-20", "builtBy": "nezha-ai", "sourceFile": "docs/LEARNED_PATTERNS.md"}',
    'Extracted from docs/LEARNED_PATTERNS.md - Learned patterns'
)
ON CONFLICT (id) DO UPDATE SET
    updated_at = NOW();

-- =============================================
-- Verify Skills Created
-- =============================================
SELECT name, category, source, builder FROM skills ORDER BY created_at;
