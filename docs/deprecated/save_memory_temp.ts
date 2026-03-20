import { DatabaseClient } from './src/db/DatabaseClient.js';
import { MemoryService } from './src/core/Memory.js';
import { OllamaEmbedding } from './src/services/embedding/OllamaEmbedding.js';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  const db = new DatabaseClient();
  await db.connect();

  const embedding = new OllamaEmbedding({
    baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: 'nomic-embed-text',
    provider: 'ollama',
  });

  const memory = new MemoryService(db, undefined, embedding);

  const id = uuidv4();
  await memory.save({
    id,
    content: `## Bug Fix: GitAutoCommitPlugin Commit Message Pollution

### Problem
Git history had 19 commits with the same message "docs: Add database-first principle for AI communication in PHILOSOPHY.md"

### Root Cause
getCommittedMessage() scanned ALL diff lines including file headers (e.g., "# PHILOSOPHY.md"), picking up 'docs:' from modified file content instead of actual commit messages.

### Fix Applied
Only scan lines AFTER @@ hunk markers:
- Track firstCodeLineFound and inHunkHeader state
- Skip diff metadata lines (diff, index, ---, +++)
- Skip comment lines (#, //, *, /*, <!--)

### Status
- Fix committed: 7df03c1
- 19 polluted commits left as known issue

source: src/plugins/GitAutoCommitPlugin.ts
tags: git-hygiene-fix, auto-commit, bug-fix
`,
    importance: 5,
    source: 'src/plugins/GitAutoCommitPlugin.ts',
  });

  console.log('Saved to memory:', id);
  await db.disconnect();
}

main().catch(console.error);
