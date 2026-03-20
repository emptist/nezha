import { Database } from './src/database/Database.js';
import { MemoryService } from './src/core/Memory.js';
import { OllamaEmbedding } from './src/services/OllamaEmbedding.js';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  const db = new Database();
  await db.connect();

  const embeddingConfig = {
    baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: 'nomic-embed-text',
  };

  const memory = new MemoryService(db, undefined, new OllamaEmbedding(embeddingConfig));

  const id = uuidv4();
  await memory.save({
    id,
    content: `## Bug Fix: GitAutoCommitPlugin Commit Message Pollution

### Problem
Git history had 20+ commits with identical message "docs: Add database-first principle for AI communication in PHILOSOPHY.md"

### Root Cause
The getCommittedMessage() method extracted messages from staged diff comments. When the same file was modified repeatedly with the same comment format, identical messages were generated.

### Solution
Added timestamp and short hash to commit messages when using actual commit message to ensure uniqueness.

### Historical Pollution
Already-pushed identical commits require force push to fix. Options:
1. Interactive rebase to squash identical commits
2. Accept as known issue (risky for shared repos)
3. git-filter-repo to rewrite with uniqueness

### Prevention
New commits now automatically include timestamp and parent commit hash for uniqueness.`,
    tags: ['git-hygiene-fix', 'bug-fix', 'git'],
    importance: 6,
    source: 'src/plugins/GitAutoCommitPlugin.ts',
    generateEmbedding: true,
  });

  console.log('Memory saved with ID:', id);
  await db.close();
}

main().catch(console.error);
