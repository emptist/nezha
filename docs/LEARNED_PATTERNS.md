# Learned Patterns

## TypeScript Best Practices

### Use `export type` for Type-Only Exports

When re-exporting interfaces and types from a module, use `export type` instead of `export`. This is because TypeScript strips interfaces from JavaScript output, so a regular `export` will fail at runtime with "does not provide an export named X".

**Correct pattern:**
```typescript
export type { EmbeddingProvider, EmbeddingConfig, EmbeddingResult } from './types.js';
```

**Incorrect pattern (will fail at runtime):**
```typescript
export { EmbeddingProvider, EmbeddingConfig, EmbeddingResult } from './types.js';
```

**Files affected:** 
- `src/services/embedding/index.ts`
- `src/services/ai/index.ts`

**Why this matters:** 
The build (TypeScript compilation) succeeds because TypeScript knows about the interfaces. But at runtime, when Node.js tries to load the .js file, it fails because the interfaces were stripped during compilation and don't exist in the output.