# Design Decision: share vs areflect

## Date: 2026-03-25

## Context

After renaming `reflect` to `share`, a design question arose:

> Should `share` be merged into `areflect` for unified functionality?

## Decision: Keep Separate

**share** and **areflect** should remain as separate commands with different purposes.

## Rationale

### share (Simple Broadcast)

| Aspect         | Details                               |
| -------------- | ------------------------------------- |
| Purpose        | Quick, simple broadcast               |
| Usage          | `nezha share "message"`               |
| Learning Curve | Zero - intuitive                      |
| Features       | Broadcast + save to memory            |
| Best For       | Quick notifications, sharing thoughts |

### areflect (Complete Tool)

| Aspect         | Details                                                   |
| -------------- | --------------------------------------------------------- |
| Purpose        | Programmatic automation with 11 markers                   |
| Usage          | `nezha areflect "[LEARN]..." "[TASK]..." "[ANNOUNCE]..."` |
| Learning Curve | Medium - requires learning marker syntax                  |
| Features       | 11 marker types, database operations, task management     |
| Best For       | Embedding in AI output, complex automation                |

## Marker Types in areflect

1. `[LEARN]` - Save to memory
2. `[PROMPT_UPDATE]` - Suggest prompt changes
3. `[ISSUE]` - Create issues
4. `[ISSUE_RESOLVE]` - Resolve issues
5. `[ISSUE_COMMENT]` - Comment on issues
6. `[TASK]` - Create tasks
7. `[TASK_COMPLETE]` - Complete tasks
8. `[ANNOUNCE]` - Broadcast (with priority, target)
9. `[SCHEDULE]` - Schedule tasks
10. `[REVIEW_RESPONSE]` - Respond to reviews
11. `[OPINION]` - Record meeting opinions

## Usage Examples

### Simple Broadcast (use share)

```bash
nezha share "Found a useful pattern for handling errors"
```

### Complex Automation (use areflect)

```bash
nezha areflect "[LEARN] insight: Always validate input context: API security"
[TASK] title: Add input validation priority: 8 type: security
[ISSUE] title: Memory leak in connection pool severity: high
```

## Why Not Merge?

1. **Different User Personas**
   - share: Non-technical users, quick tasks
   - areflect: Programmatic/AI usage

2. **Complexity vs Simplicity**
   - share is one command, one purpose
   - areflect is a DSL (domain-specific language)

3. **Future Extensibility**
   - areflect can add new markers without affecting share
   - share remains stable and simple

## Alternative: Internal Unification

If code reuse is desired, `share` could internally call `areflect`:

```typescript
case 'share': {
  const text = args.slice(1).join(' ');
  const areflect = new AutonomousReflect();
  await areflect.reflect(`[ANNOUNCE] message: ${text}`);
}
```

This provides unified behavior while maintaining CLI simplicity.

## Status

- [x] Decision documented
- [ ] Considered by all AI agents
- [ ] Added to AGENTS.md (optional)

## Related

- docs/PLANS/rename-reflect-to-share.md
- docs/AREFLECT.md
- auto-reflect/README.md
