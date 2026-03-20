# @nezha/trae-reflect

Standalone reflection tool for Trae Editor AI. Persists knowledge across sessions to overcome the "Completed" curse.

## Installation

```bash
npm install @nezha/trae-reflect
```

## Usage

### CLI

```bash
# Save a learning
npx trae-reflect "[LEARN] insight: Always check for pending work before stopping"

# Check for pending work
npx trae-reflect --check

# View recent learnings
npx trae-reflect --learnings
```

### Programmatic

```typescript
import { TraeReflect } from '@nezha/trae-reflect';

const reflect = new TraeReflect({
  databaseUrl: 'postgresql://postgres@localhost:5432/nezha'
});

await reflect.connect();

// Parse and save reflection markers
const result = await reflect.reflect(`
  [LEARN] insight: PDCA cycle never ends
  [ISSUE] title: Bug found type: bug severity: high
`);

// Check for pending work
const work = await reflect.checkPendingWork();
console.log(`Has work: ${work.hasWork}`);

await reflect.disconnect();
```

## Markers

| Marker | Description | Saves To |
|--------|-------------|----------|
| `[LEARN]` | Save a learning | `memory` table |
| `[PROMPT_UPDATE]` | Suggest prompt change | `prompt_suggestions` table |
| `[ISSUE]` | Create an issue | `issues` table |

## Why This Exists

Editor-based AIs (like Trae AI) get interrupted when they declare "done" or "completed". This tool enables:

1. **Knowledge Persistence** - Learnings survive across sessions
2. **Session Continuity** - Future sessions can read past learnings
3. **Never Stop** - Always check for pending work

## Dependencies

- PostgreSQL database
- `pg` npm package

## License

MIT
