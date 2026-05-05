import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { Config } from '../config/Config.js';
import { logger } from '../utils/logger.js';
import { getAgentSessionService } from './AgentSessionService.js';
import { ApiKeyService } from './ApiKeyService.js';

const INNER_FALLBACK_MODEL = 'llama3.2:3b';

export interface AgentContext {
  project: string | null;
  gitHash: string | null;
  machineFingerprint: string;
  cwd: string;
  source?: string;
  branch?: string;
  sessionId?: string;
  inner?: boolean;
  provider?: string;
  model?: string;
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

interface IdentityRow {
  id: string;
  project: string | null;
  git_hash: string | null;
  machine_fingerprint: string | null;
  created_at: Date;
  display_name: string | null;
  description: string | null;
  source: string | null;
}

export class AgentIdentityService {
  private db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  static async getResolvedIdentity(inner?: boolean): Promise<AgentIdentity> {
    const db = new DatabaseClient(Config.getInstance());
    const service = new AgentIdentityService(db);

    let innerModel: string | undefined;

    if (inner) {
      innerModel = await service.resolveInnerModel();
    }

    const identity = await service.resolve(inner, innerModel);

    const sessionService = getAgentSessionService(db);
    const source = service.detectContext().source || 'nezha';
    await sessionService.registerSession(source, identity.id);

    await db.close();
    return identity;
  }

  private async resolveInnerModel(): Promise<string> {
    const apiKeyService = ApiKeyService.getInstance(this.db);

    try {
      const current = await apiKeyService.getCurrentInnerModel();
      if (!current) {
        logger.warn('[AgentIdentity] No current inner provider configured, using fallback model');
        return INNER_FALLBACK_MODEL;
      }

      logger.info(`[AgentIdentity] Resolved inner model: ${current.model} from current provider: ${current.provider}`);
      return current.model;
    } catch (error) {
      logger.warn(`[AgentIdentity] Failed to resolve inner model: ${error}, using fallback`);
      return INNER_FALLBACK_MODEL;
    }
  }

  async resolve(inner?: boolean, model?: string): Promise<AgentIdentity> {
    const context = this.detectContext(inner, model);
    const id = this.generateSemanticId(context);

    const existing = await this.getById(id);
    if (existing) {
      return existing;
    }

    const identity = await this.createIdentity(context);
    return identity;
  }

  detectContext(inner?: boolean, model?: string): AgentContext {
    const traeEnv = this.detectTraeEnv();

    const source = traeEnv.source || this.detectSource();
    const branch = this.getGitBranch();
    const sessionId =
      traeEnv.sessionId ||
      process.env.NEZHA_SESSION_ID ||
      process.env.OPENCODE_SESSION_ID ||
      undefined;

    return {
      project: this.getProjectName(),
      gitHash: this.getGitHash(),
      machineFingerprint: this.getMachineFingerprint(),
      cwd: process.cwd(),
      source,
      branch,
      sessionId,
      inner,
      model,
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
    // First try env vars (works in normal terminal)
    if (process.env.AI_AGENT === 'TRAE') {
      const logDir = process.env.TRAE_SANDBOX_LOG_DIR;
      const sessionId = logDir?.match(/\/logs\/(\d{8}T\d{6})\//)?.[1] || null;
      return { source: 'TRAE', sessionId };
    }

    // Fallback: dynamic detection (works in git hooks where env vars are not inherited)
    return this.detectTraeDynamically();
  }

  private detectTraeDynamically(): { source: string | null; sessionId: string | null } {
    try {
      const homeDir = os.homedir();
      const traeLogDir = path.join(homeDir, '.trae', 'logs');

      if (!fs.existsSync(traeLogDir)) {
        return { source: null, sessionId: null };
      }

      // Scan for most recent session directory
      const dirs = fs
        .readdirSync(traeLogDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .sort((a, b) => b.name.localeCompare(a.name));

      if (dirs.length > 0) {
        // Directory name format: YYYYMMDDTHHMMSS
        const firstDirName = dirs[0]?.name;
        if (!firstDirName) {
          // fall through to return null at end
        } else {
          const match = firstDirName.match(/^\d{8}T\d{6}$/);
          const sessionId = match ? match[0] : null;
          if (sessionId) {
            logger.info(
              `[AgentIdentity] Detected Trae dynamically via ~/.trae/logs/ (session: ${sessionId})`
            );
            return { source: 'TRAE', sessionId };
          }
        }
      }
    } catch {
      // Ignore errors - Trae may not be installed
    }
    return { source: null, sessionId: null };
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

  private getProjectName(): string | null {
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

    // Not in a git repo - return null to indicate this is a global (non-project) context
    // This will trigger G- ID generation instead of S- ID
    return null;
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
    const source = context.source || 'unknown';

    if (context.inner) {
      if (context.model) {
        if (context.project) {
          if (context.sessionId) {
            return `I-${context.model}-${context.project}-${context.sessionId}`;
          }
          return `I-${context.model}-${context.project}`;
        }
        return `I-${context.model}`;
      }
      if (context.project) {
        if (context.sessionId) {
          return `I-${source}-${context.project}-${context.sessionId}`;
        }
        return `I-${source}-${context.project}`;
      }
      return `I-${source}`;
    }

    if (context.project) {
      if (context.sessionId) {
        return `S-${source}-${context.project}-${context.sessionId}`;
      }
      return `S-${source}-${context.project}`;
    }

    return `G-${source}-${context.cwd.split('/').pop() || 'unknown'}-${context.machineFingerprint}`;
  }

  private async createIdentity(context: AgentContext): Promise<AgentIdentity> {
    const source = context.source ?? 'unknown';
    const id = this.generateSemanticId(context);

    await this.db.query(
      `INSERT INTO agent_identities (id, project, git_hash, machine_fingerprint, source, session_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        context.project,
        context.gitHash,
        context.machineFingerprint,
        source,
        context.sessionId || null,
      ]
    );
    logger.info(`[AgentIdentity] Created new identity: ${id} (source: ${source})`);

    return {
      id,
      project: context.project,
      gitHash: context.gitHash,
      machineFingerprint: context.machineFingerprint,
      createdAt: new Date(),
      source,
    };
  }

  private rowToIdentity(row: IdentityRow): AgentIdentity {
    return {
      id: row.id,
      project: row.project,
      gitHash: row.git_hash,
      machineFingerprint: row.machine_fingerprint,
      createdAt: row.created_at,
      displayName: row.display_name ?? undefined,
      description: row.description ?? undefined,
      source: row.source ?? undefined,
    };
  }

  async getById(id: string): Promise<AgentIdentity | null> {
    const result = await this.db.query<IdentityRow>(
      `SELECT id, project, git_hash, machine_fingerprint, created_at, display_name, description
       FROM agent_identities WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.rowToIdentity(result.rows[0]!);
  }

  async list(limit = 20): Promise<AgentIdentity[]> {
    const result = await this.db.query<IdentityRow>(
      `SELECT id, project, git_hash, machine_fingerprint, created_at, display_name, description
       FROM agent_identities ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );

    return result.rows.map(row => this.rowToIdentity(row));
  }
}
