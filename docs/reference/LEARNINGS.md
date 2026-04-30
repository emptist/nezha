# Learnings

## 2026-04-30

### Free Model Discovery: tencent/hy3-preview:free

**Background**: Testing local model integration for QC tasks to reduce external API dependency.

**Tests Conducted**:
1. **qwen3:4b (Ollama)**
   - Issue: Very verbose, over-thinks simple questions
   - /no_think flag does not work reliably
   - Verdict: UNSUITABLE

2. **tencent/hy3-preview:free (OpenRouter)**
   - Test 1 - Simple math (2+2): Correctly answered "four"
   - Test 2 - Commit message QC ("fix bug"): Correctly identified as NOT good
   - Speed: ~5-10 seconds
   - Verdict: SUITABLE for routine QC tasks

**Implementation**:
- Created `.env` file with `NEZHA_SECRET` for AES-256-GCM encryption
- OpenRouter API key stored in `provider_api_keys` table (encrypted)
- Encryption: PBKDF2 key derivation (100k iterations) + AES-256-GCM
- **NEW**: Added `OpenRouterProvider` class at `src/services/ai/OpenRouterProvider.ts`
- Provider auto-detected in `AIProviderFactory.createFromEnv()` when `OPENROUTER_API_KEY` is set
- Default model: `tencent/hy3-preview:free` (free, works well)

**Next Steps**:
- Add OpenRouter provider to nezha ✅ DONE
- Use hy3-preview:free for QC tasks (not yet)
- Test inter-review request detection

**References**:
- Issue: #d9fa71fa "Ollama Trials - Local Model Integration" (RESOLVED)
- Model: tencent/hy3-preview:free on OpenRouter ($0 cost)

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
