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
}

export interface AgentIdentity {
  id: string;
  project: string | null;
  gitHash: string | null;
  machineFingerprint: string | null;
  createdAt: Date;
  displayName?: string;
  description?: string;
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
    // Priority 0: External identity (from OpenCode integration)
    if (AgentIdentityService.externalIdentity) {
      return AgentIdentityService.externalIdentity;
    }

    const context = this.detectContext();

    // Priority 1: Exact match (project + git hash)
    let identity = await this.findExactMatch(context);
    if (identity) {
      AgentIdentityService.cachedIdentity = identity;
      return identity;
    }

    // Priority 2: Project match
    identity = await this.findProjectMatch(context.project);
    if (identity) {
      AgentIdentityService.cachedIdentity = identity;
      return identity;
    }

    // Priority 3: Machine fingerprint match
    identity = await this.findMachineMatch(context.machineFingerprint);
    if (identity) {
      AgentIdentityService.cachedIdentity = identity;
      return identity;
    }

    // Priority 4: Create new identity
    identity = await this.createIdentity(context);
    AgentIdentityService.cachedIdentity = identity;
    return identity;
  }

  detectContext(): AgentContext {
    return {
      project: this.getProjectName(),
      gitHash: this.getGitHash(),
      machineFingerprint: this.getMachineFingerprint(),
      cwd: process.cwd(),
    };
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
        const match = remote.match(/\/([^/]+)(?:\.git)?$/);
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
    const timestamp = new Date().toISOString().replace(/[:-]/g, '').replace('T', '-').slice(0, 15);
    const shortHash = hash.substring(0, 6);

    // S = Specific: 有项目/git 信息
    if (context.project && context.gitHash) {
      return `S-${context.project}-${context.gitHash}-${timestamp}-${shortHash}`;
    }

    // G = General: 无项目/git 信息
    return `G-${context.machineFingerprint}-${timestamp}-${shortHash}`;
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
      `SELECT id, project, git_hash, machine_fingerprint, created_at, display_name, description
       FROM agent_identities 
       WHERE project = $1 AND git_hash = $2
       ORDER BY created_at DESC LIMIT 1`,
      [context.project, context.gitHash]
    );

    if (result.rows.length === 0) return null;
    return this.rowToIdentity(result.rows[0]);
  }

  private async findProjectMatch(project: string): Promise<AgentIdentity | null> {
    const result = await this.db.query(
      `SELECT id, project, git_hash, machine_fingerprint, created_at, display_name, description
       FROM agent_identities 
       WHERE project = $1
       ORDER BY created_at DESC LIMIT 1`,
      [project]
    );

    if (result.rows.length === 0) return null;
    return this.rowToIdentity(result.rows[0]);
  }

  private async findMachineMatch(machineFingerprint: string): Promise<AgentIdentity | null> {
    const result = await this.db.query(
      `SELECT id, project, git_hash, machine_fingerprint, created_at, display_name, description
       FROM agent_identities 
       WHERE machine_fingerprint = $1
       ORDER BY created_at DESC LIMIT 1`,
      [machineFingerprint]
    );

    if (result.rows.length === 0) return null;
    return this.rowToIdentity(result.rows[0]);
  }

  private async createIdentity(context: AgentContext): Promise<AgentIdentity> {
    const id = this.generateSemanticId(context);

    await this.db.query(
      `INSERT INTO agent_identities (id, project, git_hash, machine_fingerprint)
       VALUES ($1, $2, $3, $4)`,
      [id, context.project, context.gitHash, context.machineFingerprint]
    );

    console.log(`[AgentIdentity] Created new identity: ${id}`);

    return {
      id,
      project: context.project,
      gitHash: context.gitHash,
      machineFingerprint: context.machineFingerprint,
      createdAt: new Date(),
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
