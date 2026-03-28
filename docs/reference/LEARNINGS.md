# Learnings

## 2026-03-20

### InterReview→Memory→SelfImprovement Pipeline

- **Pattern**: Reviews generate learnings → Memory stores them → SelfImprovementService consumes them for prompt suggestions
- **Benefit**: Creates a closed feedback loop for AI self-improvement
- **Use case**: AI Code Review → extract learnings → store in memory → generate prompt improvement suggestions

### Integration Best Practices

- Check for duplicate tests before adding new ones
- Use consistent string comparison (case sensitivity)
- Test integration points with unit tests

### InterReviewService Design Fix

- **Issue**: InterReviewService required external API key, but Nezha already has OpenCode integration via UnifiedAgent
- **Root Cause**: InterReviewService created its own AIProvider instead of using UnifiedAgent
- **Fix**: Modified InterReviewService to accept optional UnifiedAgent parameter, matching HeartbeatService pattern
- **Lesson**: Always check for existing integration patterns before adding new dependencies

### PostgreSQL Array Format

- **Issue**: `malformed array literal` error when inserting into text[] column
- **Cause**: Using `JSON.stringify()` on arrays for PostgreSQL text[] columns
- **Fix**: Pass arrays directly to pg client, don't stringify
- **Pattern**: PostgreSQL driver handles array serialization automatically

### Database Schema Consistency

- **Issue**: Code expected `status` column in `skills` table, but it doesn't exist
- **Fix**: Remove non-existent columns from INSERT/UPDATE queries
- **Recommendation**: Add migration to add status column if skill approval workflow is needed
- **Pattern**: Always verify schema matches code expectations
