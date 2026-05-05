import type { DatabaseClient } from '../db/DatabaseClient.js';

export type EntityType =
  | 'meeting'
  | 'task'
  | 'issue'
  | 'agent'
  | 'opinion'
  | 'skill'
  | 'memory';

export interface ResolutionResult {
  id: string;
  entityType: EntityType;
  ambiguous: boolean;
  matches: number;
}

interface EntityTableConfig {
  table: string;
  idColumn: string;
}

const ENTITY_TABLES: Record<EntityType, EntityTableConfig> = {
  meeting: { table: 'meetings', idColumn: 'id' },
  task: { table: 'tasks', idColumn: 'id' },
  issue: { table: 'issues', idColumn: 'id' },
  agent: { table: 'agent_identity', idColumn: 'id' },
  opinion: { table: 'meeting_opinions', idColumn: 'id' },
  skill: { table: 'skills', idColumn: 'id' },
  memory: { table: 'memory', idColumn: 'id' },
};

const MIN_SHORT_ID_LENGTH = 4;
const UUID_LENGTH = 36;

export function validateShortId(id: string): boolean {
  if (!id || id.length < MIN_SHORT_ID_LENGTH) return false;
  const cleaned = id.replace(/-/g, '');
  return /^[0-9a-fA-F]+$/.test(cleaned);
}

export interface ResolveOptions {
  allowAmbiguous?: boolean;
  silent?: boolean;
}

export async function resolveId(
  db: DatabaseClient,
  shortId: string,
  entityType: EntityType,
  options: ResolveOptions = {}
): Promise<ResolutionResult | null> {
  if (!validateShortId(shortId)) return null;

  if (shortId.length >= UUID_LENGTH) {
    return {
      id: shortId,
      entityType,
      ambiguous: false,
      matches: 1,
    };
  }

  const config = ENTITY_TABLES[entityType];
  if (!config) return null;

  try {
    const result = await db.query<Record<string, unknown>>(
      `SELECT ${config.idColumn} FROM ${config.table} WHERE ${config.idColumn}::text LIKE $1 || '%' LIMIT 10`,
      [shortId]
    );

    if (result.rows.length === 0) return null;

    const matchCount = result.rows.length;
    if (matchCount > 1 && !options.allowAmbiguous) return null;

    const firstRow = result.rows[0];
    if (!firstRow) return null;

    return {
      id: firstRow[config.idColumn] as string,
      entityType,
      ambiguous: matchCount > 1,
      matches: matchCount,
    };
  } catch {
    return null;
  }
}

export async function resolveMeetingId(db: DatabaseClient, shortId: string): Promise<string | null> {
  const result = await resolveId(db, shortId, 'meeting');
  return result?.id ?? null;
}

export async function resolveTaskId(db: DatabaseClient, shortId: string): Promise<string | null> {
  const result = await resolveId(db, shortId, 'task');
  return result?.id ?? null;
}

export async function resolveIssueId(db: DatabaseClient, shortId: string): Promise<string | null> {
  const result = await resolveId(db, shortId, 'issue');
  return result?.id ?? null;
}

export async function resolveAgentId(db: DatabaseClient, shortId: string): Promise<string | null> {
  const result = await resolveId(db, shortId, 'agent');
  return result?.id ?? null;
}

export async function resolveOpinionId(db: DatabaseClient, shortId: string): Promise<string | null> {
  const result = await resolveId(db, shortId, 'opinion');
  return result?.id ?? null;
}

export async function resolveSkillId(db: DatabaseClient, shortId: string): Promise<string | null> {
  const result = await resolveId(db, shortId, 'skill');
  return result?.id ?? null;
}

export async function detectEntityType(
  db: DatabaseClient,
  shortId: string,
  options: ResolveOptions = {}
): Promise<ResolutionResult | null> {
  if (!validateShortId(shortId)) return null;

  if (shortId.length >= UUID_LENGTH) {
    for (const entityType of Object.keys(ENTITY_TABLES) as EntityType[]) {
      const config = ENTITY_TABLES[entityType];
      const result = await db.query<Record<string, unknown>>(
        `SELECT ${config.idColumn} FROM ${config.table} WHERE ${config.idColumn} = $1 LIMIT 1`,
        [shortId]
      );
      if (result.rows.length > 0) {
        return {
          id: shortId,
          entityType,
          ambiguous: false,
          matches: 1,
        };
      }
    }
    return null;
  }

  for (const entityType of Object.keys(ENTITY_TABLES) as EntityType[]) {
    const result = await resolveId(db, shortId, entityType, {
      ...options,
      allowAmbiguous: true,
    });
    if (result && result.matches === 1) {
      return { ...result, ambiguous: false };
    }
    if (result && result.matches > 1) {
      return result;
    }
  }

  return null;
}