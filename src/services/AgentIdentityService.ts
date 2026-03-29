import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { Config } from '../config/Config.js';

export interface AgentContext {
  project: string;
  gitHash: string | null;
  machineFingerprint: string;
  cwd: string;
  source?: string;
  branch?: string;
  sessionId?: string;
}

export interface AgentIdentity {
  id: string;
  project: string | null;
  gitHash: string | null;
  machineFingerprint: string | null;
  createdAt: Date;
  displayName?: string;
  description?: string;
  source?: string;
}

export class AgentIdentityService {
  private db: DatabaseClient;
  private static cachedIdentity: AgentIdentity | null = null;
  private static cachePromise: Promise<AgentIdentity> | null = null;
  private static externalIdentity: AgentIdentity | null = null;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  static setExternalIdentity(identity: AgentIdentity): void {
    AgentIdentityService.externalIdentity = identity;
    AgentIdentityService.cachedIdentity = identity;
    console.log(`[AgentIdentity] External identity set: ${identity.id}`);
  }

  static getExternalIdentity(): AgentIdentity | null {
    return AgentIdentityService.externalIdentity;
  }

  static async getResolvedIdentity(): Promise<AgentIdentity> {
    if (AgentIdentityService.cachedIdentity) {
      return AgentIdentityService.cachedIdentity;
    }
    if (AgentIdentityService.cachePromise) {
      return AgentIdentityService.cachePromise;
    }
    const db = new DatabaseClient(Config.getInstance());
    const service = new AgentIdentityService(db);
    AgentIdentityService.cachePromise = service.resolve().finally(() => {
      db.close();
    });
    return AgentIdentityService.cachePromise;
  }

  static resetCache(): void {
    AgentIdentityService.cachedIdentity = null;
    AgentIdentityService.cachePromise = null;
  }

  async resolve(): Promise<AgentIdentity> {
    if (AgentIdentityService.externalIdentity) {
      return AgentIdentityService.externalIdentity;
    }

    const context = this.detectContext();
    const source = context.source || 'nezha';

    let identity: AgentIdentity | null = null;

    if (context.project) {
      if (context.sessionId) {
        identity = await this.findKeyMatch(context.project, context.sessionId, source, true);
      } else if (context.gitHash) {
        identity = await this.findKeyMatch(context.project, context.gitHash, source, false);
      }
    } else {
      identity = await this.findMachineMatch(context.machineFingerprint, source);
    }

    if (identity) {
      AgentIdentityService.cachedIdentity = identity;
      return identity;
    }

    identity = await this.createIdentity(context);
    AgentIdentityService.cachedIdentity = identity;
    return identity;
  }

  detectContext(): AgentContext {
    // TRAE-specific: check if running in Trae
    const traeEnv = this.detectTraeEnv();

    const source = traeEnv.source || this.detectSource();
    const branch = this.getGitBranch();
    const sessionId =
      traeEnv.sessionId || process.env.NEZHA_SESSION_ID || process.env.OPENCODE_SESSION_ID || undefined;

    return {
      project: this.getProjectName(),
      gitHash: this.getGitHash(),
      machineFingerprint: this.getMachineFingerprint(),
      cwd: process.cwd(),
      source,
      branch,
      sessionId,
    };
  }

  private detectSource(): 'nezha' | 'opencode' | 'external' | 'mcp' {
    // Check environment variable first
    const envSource = process.env.NEZHA_AGENT_SOURCE;
    if (envSource === 'opencode' || envSource === 'external' || envSource === 'mcp') {
      return envSource;
    }
    return 'nezha';
  }

  private detectTraeEnv(): { source: string | null; sessionId: string | null } {
    if (process.env.AI_AGENT !== 'TRAE') {
      return { source: null, sessionId: null };
    }
    const logDir = process.env.TRAE_SANDBOX_LOG_DIR;
    const sessionId = logDir?.match(/\/logs\/(\d{8}T\d{6})\//)?.[1] || null;
    return { source: 'TRAE', sessionId };
  }

  private getGitBranch(): string {
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        encoding: 'utf-8',
        cwd: process.cwd(),
      }).trim();
      return branch || 'main';
    } catch {
      return 'main';
    }
  }

  private getProjectName(): string {
    try {
      // Try git remote first
      const remote = execSync('git remote get-url origin 2>/dev/null || echo ""', {
        encoding: 'utf-8',
        cwd: process.cwd(),
      }).trim();

      if (remote) {
        // Extract project name from git URL
        const match = remote.match(/\/([^/]+?)(?:\.git)?$/);
        if (match && match[1]) return match[1];
      }
    } catch {
      // Fall through
    }

    // Fallback to directory name
    return path.basename(process.cwd()) || 'unknown';
  }

  private getGitHash(): string | null {
    try {
      const hash = execSync('git rev-parse --short HEAD 2>/dev/null', {
        encoding: 'utf-8',
        cwd: process.cwd(),
      }).trim();
      return hash || null;
    } catch {
      return null;
    }
  }

  private getMachineFingerprint(): string {
    const info = [os.hostname(), os.platform(), os.arch(), os.cpus()[0]?.model || 'unknown'].join(
      '|'
    );

    return crypto.createHash('sha256').update(info).digest('hex').substring(0, 16);
  }

  generateSemanticId(context: AgentContext): string {
    const hash = this.generateDeterministicHash(context);
    const shortHash = hash.substring(0, 6);
    const source = context.source || 'nezha';

    // S = Specific: 有项目信息
    if (context.project) {
      // 有 sessionId 用 sessionId，无则用 git hash
      const keyPart = context.sessionId
        ? context.sessionId.substring(0, 6)
        : context.gitHash
          ? context.gitHash.substring(0, 7)
          : '';
      return `S-${source}-${context.project}-${keyPart ? keyPart + '-' : ''}${shortHash}`;
    }

    // G = General: 无项目信息
    return `G-${source}-${context.machineFingerprint}-${shortHash}`;
  }

  generateDeterministicHash(context: AgentContext): string {
    const data = [context.project, context.gitHash || 'no-git', context.machineFingerprint].join(
      '|'
    );

    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  private async findExactMatch(context: AgentContext): Promise<AgentIdentity | null> {
    if (!context.gitHash) return null;

    const result = await this.db.query(
      `SELECT id, project, git_hash, machine_fingerprint, created_at, display_name, description, source
       FROM agent_identities 
       WHERE project = $1 AND git_hash = $2 AND source = $3
       ORDER BY created_at DESC LIMIT 1`,
      [context.project, context.gitHash, context.source || 'nezha']
    );

    if (result.rows.length === 0) return null;
    return this.rowToIdentity(result.rows[0]);
  }

  private async findProjectMatch(project: string): Promise<AgentIdentity | null> {
    const result = await this.db.query(
      `SELECT id, project, git_hash, machine_fingerprint, created_at, display_name, description, source
       FROM agent_identities 
       WHERE project = $1
       ORDER BY created_at DESC LIMIT 1`,
      [project]
    );

    if (result.rows.length === 0) return null;
    return this.rowToIdentity(result.rows[0]);
  }

  private async findKeyMatch(
    project: string,
    key: string,
    source: string,
    isSessionId: boolean = false
  ): Promise<AgentIdentity | null> {
    let result;
    if (isSessionId) {
      result = await this.db.query(
        `SELECT id, project, git_hash, machine_fingerprint, created_at, display_name, description, source, session_id
         FROM agent_identities 
         WHERE project = $1 AND session_id = $2 AND source = $3
         ORDER BY created_at DESC LIMIT 1`,
        [project, key, source]
      );
    } else {
      result = await this.db.query(
        `SELECT id, project, git_hash, machine_fingerprint, created_at, display_name, description, source, session_id
         FROM agent_identities 
         WHERE project = $1 AND git_hash = $2 AND source = $3
         ORDER BY created_at DESC LIMIT 1`,
        [project, key.substring(0, 7), source]
      );
    }

    if (result.rows.length === 0) return null;
    return this.rowToIdentity(result.rows[0]);
  }

  private async findMachineMatch(
    machineFingerprint: string,
    source: string
  ): Promise<AgentIdentity | null> {
    const result = await this.db.query(
      `SELECT id, project, git_hash, machine_fingerprint, created_at, display_name, description, source, session_id
       FROM agent_identities 
       WHERE machine_fingerprint = $1 AND source = $2
       ORDER BY created_at DESC LIMIT 1`,
      [machineFingerprint, source]
    );

    if (result.rows.length === 0) return null;
    return this.rowToIdentity(result.rows[0]);
  }

  private async createIdentity(context: AgentContext): Promise<AgentIdentity> {
    const source = context.source ?? 'nezha';
    const id = this.generateSemanticId(context);

    await this.db.query(
      `INSERT INTO agent_identities (id, project, git_hash, machine_fingerprint, source, session_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, context.project, context.gitHash, context.machineFingerprint, source, context.sessionId || null]
    );
    console.log(`[AgentIdentity] Created new identity: ${id} (source: ${source})`);

    return {
      id,
      project: context.project,
      gitHash: context.gitHash,
      machineFingerprint: context.machineFingerprint,
      createdAt: new Date(),
      source,
    };
  }

  private rowToIdentity(row: any): AgentIdentity {
    return {
      id: row.id,
      project: row.project,
      gitHash: row.git_hash,
      machineFingerprint: row.machine_fingerprint,
      createdAt: row.created_at,
      displayName: row.display_name,
      description: row.description,
      source: row.source,
    };
  }

  async getById(id: string): Promise<AgentIdentity | null> {
    const result = await this.db.query(
      `SELECT id, project, git_hash, machine_fingerprint, created_at, display_name, description
       FROM agent_identities WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.rowToIdentity(result.rows[0]);
  }

  async list(limit = 20): Promise<AgentIdentity[]> {
    const result = await this.db.query(
      `SELECT id, project, git_hash, machine_fingerprint, created_at, display_name, description
       FROM agent_identities ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );

    return result.rows.map(row => this.rowToIdentity(row));
  }
}
