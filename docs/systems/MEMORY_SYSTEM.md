# Nezha Memory System Design

> **Design Principle**: PostgreSQL-first. File system only when inevitable.

## Core Principle

```
┌─────────────────────────────────────────────────────────────────┐
│                    PostgreSQL (Primary)                          │
│   • All structured data (memories, skills, conversations)     │
│   • Queryable, indexed, relational                               │
│   • ACID transactions, concurrent access                       │
│   • The ONE source of truth                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Only when unavoidable
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    File System (Fallback)                         │
│   • Source code (git)                                           │
│   • Config files (config.yaml)                                  │
│   • Logs (temporary, rotation)                                  │
│   • NOT for knowledge/memory storage                            │
└─────────────────────────────────────────────────────────────────┘
```

## Why PostgreSQL-First?

| Aspect        | PostgreSQL                       | File System         |
| ------------- | -------------------------------- | ------------------- |
| **Query**     | SQL queries, JOINs, aggregations | Grep, limited       |
| **Index**     | B-tree, GIN, GiST, vector        | None native         |
| **Access**    | Concurrent, row-level locking    | File locks          |
| **Backup**    | pg_dump, point-in-time           | cp, rsync           |
| **Sync**      | Replication, CDC                 | Git (for text only) |
| **Size**      | TB scale                         | Host-dependent      |
| **Integrity** | Constraints, triggers            | None                |

## When File System IS Used

File system is acceptable ONLY for:

1. **Source Code** - Git-tracked project files
2. **Configuration** - config.yaml, .env (small, text-based)
3. **Temporary Logs** - Rotation, external tools
4. **Bootstrap Templates** - Initial setup prompts

File system is **NEVER** used for:

- Knowledge/memory storage
- Skill definitions
- Conversation history
- Learned patterns
- User data

## Architecture: Dual Mode Memory

```
┌─────────────────────────────────────────────────────────────────┐
│                     Development Mode (Nezha self)                 │
│                                                                  │
│   ┌─────────────────┐    ┌──────────────────────────────────┐   │
│   │  File System   │    │          PostgreSQL              │   │
│   │  (Bootstrap)    │    │  (Supplement, optional)        │   │
│   │                 │    │                                  │   │
│   │  • AGENTS.md   │    │  • memory table (if DB works)   │   │
│   │  • SOUL.md     │    │  • conversations (if DB works)  │   │
│   │  • memory/     │    │  • tasks (if DB works)          │   │
│   └────────┬────────┘    └──────────────┬───────────────────┘   │
│            │                               │                       │
│            └───────────┬───────────────────┘                       │
│                        ↓                                            │
│               MarkdownKnowledgeLoader                                │
│                        ↓                                            │
│              PostgreSQL (if available)                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     Product Mode (Customer Projects)              │
│                                                                  │
│   ┌─────────────────┐                                             │
│   │  File System   │  ← Bootstrap only (minimal)               │
│   │  (Bootstrap)    │                                             │
│   │                 │                                             │
│   │  • AGENTS.md   │                                             │
│   │  • config.yaml  │                                             │
│   └─────────────────┘                                             │
│            │                                                      │
│            ↓                                                      │
│   ┌──────────────────────────────────────────────────────────┐   │
│   │                    PostgreSQL (Required)                    │   │
│   │                                                          │   │
│   │  • memory        • skills         • conversations        │   │
│   │  • tasks         • knowledge      • audit_logs           │   │
│   │  • task_outcomes• patterns       • learning_insights     │   │
│   │                                                          │   │
│   └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## OpenClaw vs Nezha

| OpenClaw                  | Nezha                    |
| ------------------------- | ------------------------ |
| `memory/*.md` daily files | `memory` table           |
| `SOUL.md` on disk         | `SOUL.md` → memory table |
| Skills as `.md` files     | Skills in `skills` table |
| JSONL for logs            | `conversations` table    |
| File system primary       | PostgreSQL primary       |

## Implementation

### MemoryService

```typescript
class MemoryService {
  // All data goes to PostgreSQL
  async save(input: SaveMemoryInput): Promise<string>;
  async search(query: string): Promise<Memory[]>;
  async vectorSearch(query: string): Promise<VectorSearchResult[]>;
}
```

### MarkdownKnowledgeLoader

```typescript
// File → DB pipeline (only exception to file-first)
class MarkdownKnowledgeLoader {
  // Read markdown files
  // Parse content
  // Save to PostgreSQL memory table
  // File becomes optional after import
}
```

### File System → DB Pipeline

```
Bootstrap Files (minimal)     →    PostgreSQL (permanent storage)
├── AGENTS.md                →    skills table
├── SOUL.md                  →    memory table
├── memory/*.md              →    memory table
└── docs/*.md               →    memory table
```

## Migration Strategy

For existing OpenClaw users:

1. **Import** - Use `MarkdownKnowledgeLoader` to import files to DB
2. **Sync** - Optional periodic sync from files to DB
3. **Retire** - Files become read-only reference after import

## Summary

- **Default**: Everything in PostgreSQL
- **File system**: Only for bootstrap/config that MUST be on disk
- **Knowledge**: ALWAYS in database, NEVER in files
- **Skills**: ALWAYS in database, NEVER executed from disk directly

> "PostgreSQL is the brain. File system is just temporary scaffolding."
