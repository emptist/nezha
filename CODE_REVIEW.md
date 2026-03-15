# Code Review: src/db Directory

## Overview
This directory contains the database client and configuration for the PostgreSQL connection using the `pg` library.

---

## Issues Found

### 1. **Security: Hardcoded Default Password** (config.ts:16)
**Severity:** High

The default password "postgres" is hardcoded, which is a security risk in production environments.

```typescript
password: process.env.DB_PASSWORD ?? "postgres",
```

**Recommendation:** Remove the default password and require it to be set via environment variable:
```typescript
password: process.env.DB_PASSWORD ?? (() => { throw new Error("DB_PASSWORD is required"); })(),
```

---

### 2. **Security: Password Exposed in Connection String** (config.ts:32)
**Severity:** High

The `getDbConnectionString` function returns a connection string containing the plain-text password, which could be logged or exposed.

```typescript
return `postgresql://${config.user}:${config.password}@${config.host}:${config.port}/${config.name}`;
```

**Recommendation:** Either remove this function if unused, or create a safer version that doesn't include credentials:
```typescript
export function getDbConnectionString(): string {
  const config = getDbConfig();
  return `postgresql://${config.host}:${config.port}/${config.name}`;
}
```

---

### 3. **Missing Input Validation** (config.ts:10-18)
**Severity:** Medium

No validation on parsed values. Invalid port numbers or negative connection counts could cause runtime errors.

**Recommendation:** Add validation:
```typescript
function loadDbConfig(): DbConfig {
  const port = parseInt(process.env.DB_PORT ?? "5432", 10);
  const maxConnections = parseInt(process.env.DB_MAX_CONNECTIONS ?? "10", 10);
  
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error("Invalid DB_PORT");
  }
  if (isNaN(maxConnections) || maxConnections < 1) {
    throw new Error("Invalid DB_MAX_CONNECTIONS");
  }
  
  return {
    host: process.env.DB_HOST ?? "localhost",
    port,
    name: process.env.DB_NAME ?? "nezha",
    user: process.env.DB_USER ?? "postgres",
    password: process.env.DB_PASSWORD ?? "postgres",
    maxConnections,
  };
}
```

---

### 4. **No Error Handling in Query Function** (client.ts:23-26)
**Severity:** Medium

The `query` function has no try-catch, so database errors propagate without context.

**Recommendation:** Add error handling with context:
```typescript
export async function query<T = pg.QueryResult>(text: string, params?: unknown[]): Promise<T> {
  const pool = getPool();
  try {
    return await pool.query(text, params) as T;
  } catch (error) {
    throw new Error(`Database query failed: ${text}`, { cause: error });
  }
}
```

---

### 5. **Missing Pool Configuration Options** (client.ts:11-18)
**Severity:** Low

Only `max` connections is configured. Missing useful pool options.

**Recommendation:** Add additional pool settings:
```typescript
pool = new Pool({
  host: config.host,
  port: config.port,
  database: config.name,
  user: config.user,
  password: config.password,
  max: config.maxConnections,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
```

---

### 6. **No Graceful Shutdown Handler** (client.ts)
**Severity:** Low

There's no automatic cleanup on process termination.

**Recommendation:** Add signal handlers:
```typescript
export function setupGracefulShutdown(): void {
  process.on("SIGTERM", async () => {
    await closePool();
    process.exit(0);
  });
  process.on("SIGINT", async () => {
    await closePool();
    process.exit(0);
  });
}
```

---

### 7. **Type Safety Issue** (client.ts:25)
**Severity:** Low

The cast `as Promise<T>` bypasses TypeScript's type checking.

**Recommendation:** Use proper typing or a type guard. Consider using `pg.QueryResultRow` for better type inference.

---

## Summary

| Issue | Severity | File:Line |
|-------|----------|-----------|
| Hardcoded default password | High | config.ts:16 |
| Password exposed in connection string | High | config.ts:32 |
| Missing input validation | Medium | config.ts:10-18 |
| No error handling in query | Medium | client.ts:23-26 |
| Missing pool configuration | Low | client.ts:11-18 |
| No graceful shutdown | Low | client.ts |
| Type safety issue | Low | client.ts:25 |

## Overall Assessment

The code provides a basic functional database layer but has security concerns that should be addressed before production use. The most critical issues are the default password and the exposure of credentials in the connection string.
