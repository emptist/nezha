import http from 'http';
import crypto from 'node:crypto';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { Config } from '../config/Config.js';
import { logger } from '../utils/logger.js';
import { AgentIdentityService } from '../services/AgentIdentityService.js';
import { BroadcastService } from '../services/BroadcastService.js';
import { PiSDKExecutor } from '../services/PiSDKExecutor.js';
import { AIProviderFactory } from '../services/ai/index.js';
import { UserService } from '../services/UserService.js';
import { JwtAuthMiddleware } from '../services/JwtAuthMiddleware.js';
import { jwtService } from '../services/JwtService.js';
import { EventBus } from '../core/EventBus.js';
import { SCHEDULER_EVENTS } from '../core/Scheduler.js';

const PORT = process.env.NUPI_PORT || 5999;
const DEFAULT_MODEL = 'zai:glm-4.5-flash';
const MAX_BODY_SIZE = 1024 * 1024;

interface ParsedBody {
  [key: string]: unknown;
}

interface TaskCreateData extends ParsedBody {
  title?: string;
  description?: unknown;
  priority?: unknown;
  category?: unknown;
  project_id?: unknown;
  depends_on?: unknown;
  max_retries?: unknown;
  timeout_seconds?: unknown;
  assigned_to?: unknown;
}

interface BroadcastData extends ParsedBody {
  message?: unknown;
  to?: unknown;
  priority?: unknown;
}

interface MemoryData extends ParsedBody {
  content?: unknown;
  insight?: unknown;
  source?: unknown;
  tags?: unknown;
}

interface PromptData extends ParsedBody {
  model?: unknown;
  system_prompt?: unknown;
  task?: unknown;
}

interface ChatMessage {
  role: string;
  content?: string;
}

interface ChatCompletionData extends ParsedBody {
  model?: unknown;
  messages?: ChatMessage[];
}

interface ReminderData extends ParsedBody {
  message?: unknown;
  type?: unknown;
}

interface RecoveryData extends ParsedBody {
  max_retries?: unknown;
  delay_ms?: unknown;
}

function safeJsonParse<T = ParsedBody>(body: string): T | null {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function str(value: unknown, fallback: string = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function num(value: unknown, fallback: number = 0): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseInt(value, 10) || fallback;
  return fallback;
}

function validateBodySize(body: string, maxBytes: number = MAX_BODY_SIZE): boolean {
  return Buffer.byteLength(body, 'utf-8') <= maxBytes;
}

class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number = 60000, maxRequests: number = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    setInterval(() => this.cleanup(), this.windowMs);
  }

  isAllowed(key: string): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];

    const validTimestamps = timestamps.filter(t => now - t < this.windowMs);

    if (validTimestamps.length >= this.maxRequests) {
      return false;
    }

    validTimestamps.push(now);
    this.requests.set(key, validTimestamps);
    return true;
  }

  getRemaining(key: string): number {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];
    const validCount = timestamps.filter(t => now - t < this.windowMs).length;
    return Math.max(0, this.maxRequests - validCount);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, timestamps] of this.requests) {
      const valid = timestamps.filter(t => now - t < this.windowMs);
      if (valid.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, valid);
      }
    }
  }
}

const rateLimiter = new RateLimiter(60000, 100);

class NuPIServer {
  private server: http.Server | null = null;
  private db: DatabaseClient;
  private userService: UserService | null = null;
  private jwtAuth: JwtAuthMiddleware;
  private eventBus: EventBus;

  constructor() {
    this.db = new DatabaseClient(Config.getInstance());
    this.jwtAuth = new JwtAuthMiddleware(this.db);
    this.eventBus = new EventBus();
  }

  private async getUserService(): Promise<UserService> {
    if (!this.userService) {
      this.userService = await UserService.create(this.db);
    }
    return this.userService;
  }

  private isLocalhost(req: http.IncomingMessage): boolean {
    const remote = req.socket.remoteAddress;
    if (!remote) return false;
    return remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
  }

  async start(): Promise<void> {
    this.server = http.createServer(async (req, res) => {
      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json',
      };

      if (req.method === 'OPTIONS') {
        res.writeHead(204, headers);
        res.end();
        return;
      }

      const rawUrl = req.url ?? '';
      const url = rawUrl.split('?')[0] ?? '';
      const method = req.method ?? 'GET';

      const clientIp = req.socket.remoteAddress || 'unknown';
      if (!rateLimiter.isAllowed(clientIp)) {
        res.writeHead(429, {
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': '0',
        });
        res.end(JSON.stringify({ error: 'Too many requests', retryAfter: 60 }));
        return;
      }

      try {
        let body = '';
        if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
          body = await new Promise<string>((resolve, reject) => {
            let size = 0;
            req.on('data', (chunk: Buffer) => {
              size += chunk.length;
              if (size > MAX_BODY_SIZE) {
                req.destroy();
                reject(new Error(`Request body too large: ${size} bytes exceeds ${MAX_BODY_SIZE}`));
                return;
              }
              body += chunk.toString('utf-8');
            });
            req.on('end', () => resolve(body));
            req.on('error', reject);
          });
        }

        const response = await this.handleRequest(method, url, rawUrl, body, headers, req);
        res.writeHead(response.status, { ...headers, ...response.headers });
        res.end(response.body);
      } catch (error) {
        logger.error(`[NuPI] Error: ${error}`);
        res.writeHead(500, headers);
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });

    this.server.listen(PORT, () => {
      logger.info(`[NuPI] Server running on port ${PORT}`);
    });
  }

  private async handleRequest(
    method: string,
    url: string,
    rawUrl: string,
    body: string,
    _headers: Record<string, string>,
    req: http.IncomingMessage
  ): Promise<{ status: number; body: string; headers?: Record<string, string> }> {
    const path = url.split('/').filter(Boolean);

    if (path[0] === 'health') {
      return { status: 200, body: JSON.stringify({ status: 'ok', service: 'nupi' }) };
    }

    const SENSITIVE_PATHS = ['tasks', 'memory', 'broadcast', 'prompt', 'v1'];
    if (path[0] && SENSITIVE_PATHS.includes(path[0]) && !this.isLocalhost(req)) {
      const addr = String(req.socket.remoteAddress || 'unknown');
      logger.warn(`[NuPI] Rejected non-localhost request to /${path[0]} from ${addr}`);
      return { status: 403, body: JSON.stringify({ error: 'Forbidden: local access only' }) };
    }

    if (path[0] === 'api' && path[1] === 'users') {
      return await this.handleUserRequest(method, path, body);
    }

    if (path[0] === 'identity' && method === 'GET') {
      if (!this.isLocalhost(req)) {
        return { status: 403, body: JSON.stringify({ error: 'Forbidden: local access only' }) };
      }
      const identity = await AgentIdentityService.getResolvedIdentity();
      return { status: 200, body: JSON.stringify(identity) };
    }

    if (path[0] === 'tasks') {
      console.log('[TASKS] path length:', path.length, 'method:', method);
      if (method === 'GET') {
        const queryParams = new URLSearchParams(rawUrl.split('?')[1] || '');
        const status = queryParams.get('status') || 'PENDING';
        const limit = parseInt(queryParams.get('limit') || '10', 10);
        const result = await this.db.query<any>(
          `SELECT id, title, description, priority, status, category, type, created_at 
           FROM tasks WHERE status = $1 ORDER BY priority DESC, created_at ASC LIMIT $2`,
          [status, limit]
        );
        return { status: 200, body: JSON.stringify(result) };
      }

      if (method === 'POST') {
        const data = safeJsonParse(body);
        if (!data || !data.title) {
          return {
            status: 400,
            body: JSON.stringify({ error: 'Invalid request: title is required' }),
          };
        }
        const id = await this.createTask(data);
        return { status: 201, body: JSON.stringify({ id }) };
      }
    }

    if (path[0] === 'broadcast' && method === 'GET') {
      const limit = parseInt(path[1] || '20', 10);
      const result = await this.db.query<any>(
        `SELECT id, from_ai, message_type, content, priority, created_at 
         FROM project_communications ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
      return { status: 200, body: JSON.stringify(result) };
    }

    if (path[0] === 'broadcast' && method === 'POST') {
      const data = safeJsonParse(body);
      if (!data || !data.message) {
        return {
          status: 400,
          body: JSON.stringify({ error: 'Invalid request: message is required' }),
        };
      }
      const broadcastService = await BroadcastService.create(this.db);
      const id = await broadcastService.sendBroadcast(str(data.message), {
        targetAgent: str(data.to),
        priority: str(data.priority, 'normal') as never,
      });
      return { status: 201, body: JSON.stringify({ id }) };
    }

    if (path[0] === 'memory') {
      if (method === 'GET') {
        const query = path[1] || '';
        const limit = parseInt(
          new URLSearchParams(rawUrl.split('?')[1] || '').get('limit') || '20',
          10
        );
        const result = await this.db.query<any>(
          `SELECT id, content, source, tags, created_at 
           FROM memory WHERE content ILIKE $1 
           ORDER BY created_at DESC LIMIT $2`,
          [`%${query}%`, limit]
        );
        return { status: 200, body: JSON.stringify(result) };
      }

      if (method === 'POST') {
        const data = safeJsonParse<MemoryData>(body);
        if (!data) {
          return { status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
        }
        const result = await this.db.query<{ id: string }>(
          `INSERT INTO memory (content, source, tags)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [str(data.content) || str(data.insight), str(data.source, 'nupi'), data.tags]
        );
        return { status: 201, body: JSON.stringify({ id: result.rows[0]?.id }) };
      }
    }

    if (path[0] === 'prompt' && method === 'POST') {
      const data = safeJsonParse(body);
      if (!data) return { status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
      const result = await this.executePrompt(data);
      return { status: 200, body: JSON.stringify(result) };
    }

    if (path[0] === 'v1' && path[1] === 'chat' && path[2] === 'completions' && method === 'POST') {
      const data = safeJsonParse(body);
      if (!data) return { status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
      const result = await this.executeOpenAIChat(data);
      return { status: 200, body: JSON.stringify(result) };
    }

    if (path[0] === 'remind' && method === 'POST') {
      const data = safeJsonParse(body);
      if (!data) return { status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
      const result = await this.executeReminder(data);
      return { status: 200, body: JSON.stringify(result) };
    }

    if (path[0] === 'admin' && path[1] === 'recovery') {
      return await this.handleRecoveryRequest(method, path, body);
    }

    if (path[0] === 'tasks' && path[2] === 'status' && method === 'PUT') {
      const taskId = path[1];
      const data = safeJsonParse(body || '{}');
      if (!data) return { status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
      const isCompleted = data.status === 'COMPLETED';

      const taskResult = await this.db.query<{ title: string; description: string }>(
        `SELECT title, description FROM tasks WHERE id = $1`,
        [taskId]
      );
      const task = taskResult.rows[0];

      await this.db.query(
        `UPDATE tasks SET status = $1, updated_at = NOW()${isCompleted ? ', completed_at = NOW()' : ''} WHERE id = $2`,
        [data.status, taskId]
      );

      if (isCompleted && task) {
        this.eventBus.publish(SCHEDULER_EVENTS.TASK_COMPLETED, {
          taskId,
          title: task.title,
          description: task.description,
          timestamp: new Date(),
        });
      }

      return { status: 200, body: JSON.stringify({ id: taskId, status: data.status }) };
    }

    if (path[0] === 'tasks' && path[2] === 'result' && method === 'PUT') {
      const taskId = path[1];
      const data = safeJsonParse(body || '{}');
      if (!data) return { status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
      await this.db.query(`UPDATE tasks SET result = $1, completed_at = NOW() WHERE id = $2`, [
        JSON.stringify(data.result),
        taskId,
      ]);
      return { status: 200, body: JSON.stringify({ id: taskId }) };
    }

    if (path[0] === 'tasks' && path[2] === 'error' && method === 'PUT') {
      const taskId = path[1];
      const data = safeJsonParse(body || '{}');
      if (!data) return { status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
      await this.db.query(`UPDATE tasks SET error = $1, updated_at = NOW() WHERE id = $2`, [
        data.error,
        taskId,
      ]);
      return { status: 200, body: JSON.stringify({ id: taskId }) };
    }

    if (path[0] === 'tasks' && path.length === 2 && method === 'PATCH') {
      const taskId = path[1];
      const data = safeJsonParse(body || '{}');
      console.log('[PATCH] taskId:', taskId, 'data:', JSON.stringify(data));
      if (!data) return { status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };

      const updates: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (data.priority !== undefined) {
        updates.push(`priority = $${paramIndex++}`);
        values.push(data.priority);
      }
      if (data.status !== undefined) {
        updates.push(`status = $${paramIndex++}`);
        values.push(data.status);
        if (data.status === 'COMPLETED') {
          updates.push(`completed_at = NOW()`);
        }
      }
      if (data.title !== undefined) {
        updates.push(`title = $${paramIndex++}`);
        values.push(data.title);
      }
      if (data.description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        values.push(data.description);
      }
      if (data.assigned_to !== undefined) {
        updates.push(`assigned_to = $${paramIndex++}`);
        values.push(data.assigned_to);
      }

      if (updates.length === 0) {
        return { status: 400, body: JSON.stringify({ error: 'No fields to update' }) };
      }

      values.push(taskId);
      await this.db.query(
        `UPDATE tasks SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex}`,
        values
      );
      return { status: 200, body: JSON.stringify({ id: taskId, updated: Object.keys(data) }) };
    }

    if (path[0] === 'issues' && method === 'GET') {
      const limit = parseInt(
        new URLSearchParams(rawUrl.split('?')[1] || '').get('limit') || '10',
        10
      );
      const result = await this.db.query<any>(
        `SELECT id, title, severity, status FROM issues
         WHERE status NOT IN ('resolved', 'closed')
         ORDER BY severity DESC LIMIT $1`,
        [limit]
      );
      return { status: 200, body: JSON.stringify(result) };
    }

    if (path[0] === 'memory' && path[1] === 'search' && method === 'GET') {
      const query = new URLSearchParams(rawUrl.split('?')[1] || '');
      const q = (query.get('q') || '').slice(0, 200);
      const limit = Math.min(Math.max(parseInt(query.get('limit') || '50', 10) || 50, 1), 100);
      const result = await this.db.query<any>(
        `SELECT content, created_at FROM memory
         WHERE content ILIKE $1 ORDER BY created_at DESC LIMIT $2`,
        [`%${q}%`, limit]
      );
      return { status: 200, body: JSON.stringify(result) };
    }

    if (path[0] === 'status' && method === 'GET') {
      const detailed = path[1] === 'full';

      const [
        pendingTasks,
        openIssues,
        totalMemories,
        failedTasks,
        recentMemories,
        criticalTasks,
        recentLearnings,
        openIssuesList,
      ] = await Promise.all([
        this.db.query<{ count: string }>(
          "SELECT COUNT(*) as count FROM tasks WHERE status = 'PENDING'"
        ),
        this.db.query<{ count: string }>(
          "SELECT COUNT(*) as count FROM issues WHERE status NOT IN ('resolved', 'closed')"
        ),
        this.db.query<{ count: string }>('SELECT COUNT(*) as count FROM memory'),
        this.db.query<{ count: string }>(
          "SELECT COUNT(*) as count FROM tasks WHERE status = 'FAILED' AND created_at > NOW() - INTERVAL '24 hours'"
        ),
        this.db.query<{ count: string }>(
          "SELECT COUNT(*) as count FROM memory WHERE created_at > NOW() - INTERVAL '24 hours'"
        ),
        detailed
          ? this.db.query<{ title: string; priority: number }>(
              "SELECT title, priority FROM tasks WHERE status = 'PENDING' AND priority >= 8 ORDER BY priority DESC LIMIT 5"
            )
          : { rows: [] },
        detailed
          ? this.db.query<{ content: string; tags: string[] }>(
              "SELECT content, tags FROM memory WHERE created_at > NOW() - INTERVAL '24 hours' ORDER BY importance DESC LIMIT 5"
            )
          : { rows: [] },
        detailed
          ? this.db.query<{
              id: string;
              title: string;
              severity: string;
              issue_type: string;
              status: string;
            }>(
              `SELECT id, title, severity, issue_type, status FROM issues WHERE status = 'open'
           ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
           created_at DESC LIMIT 10`
            )
          : { rows: [] },
      ]);

      const baseStatus = {
        pendingTasks: parseInt(pendingTasks.rows[0]?.count || '0', 10),
        openIssues: parseInt(openIssues.rows[0]?.count || '0', 10),
        memoryCount: parseInt(totalMemories.rows[0]?.count || '0', 10),
        failedTasks: parseInt(failedTasks.rows[0]?.count || '0', 10),
        recentMemories: parseInt(recentMemories.rows[0]?.count || '0', 10),
      };

      if (!detailed) {
        return { status: 200, body: JSON.stringify(baseStatus) };
      }

      return {
        status: 200,
        body: JSON.stringify({
          ...baseStatus,
          hasIssues:
            baseStatus.pendingTasks > 0 || baseStatus.failedTasks > 0 || baseStatus.openIssues > 0,
          criticalTasks: criticalTasks.rows,
          recentLearnings: recentLearnings.rows.map(r => ({
            content: r.content,
            tags: r.tags || [],
          })),
          suggestions: [
            'Review recent code changes',
            'Optimize slow queries',
            'Update documentation',
            'Run comprehensive tests',
          ],
          totalMemories: baseStatus.memoryCount,
          openIssuesList: openIssuesList.rows.map(i => ({
            id: i.id,
            title: i.title,
            severity: i.severity,
            issueType: i.issue_type,
            status: i.status,
          })),
        }),
      };
    }

    return { status: 404, body: JSON.stringify({ error: 'Not found' }) };
  }

  private async handleUserRequest(
    method: string,
    path: string[],
    body: string
  ): Promise<{ status: number; body: string }> {
    const userService = await this.getUserService();
    const action = path[2];

    try {
      if (action === 'register' && method === 'POST') {
        const data = safeJsonParse(body);
        if (!data) return { status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
        const result = await userService.register({
          email: str(data.email),
          username: str(data.username),
          password: str(data.password),
          display_name: str(data.display_name),
        });
        return {
          status: 201,
          body: JSON.stringify({ user: result.user, accessToken: result.tokens.accessToken }),
        };
      }

      if (action === 'login' && method === 'POST') {
        const data = safeJsonParse(body);
        if (!data) return { status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
        const result = await userService.login({
          email: str(data.email),
          username: str(data.username),
          password: str(data.password),
        });
        return {
          status: 200,
          body: JSON.stringify({ user: result.user, accessToken: result.tokens.accessToken }),
        };
      }

      if (action === 'refresh' && method === 'POST') {
        const data = safeJsonParse(body);
        if (!data) return { status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
        const tokens = await userService.refreshToken(str(data.refresh_token));
        return { status: 200, body: JSON.stringify(tokens) };
      }

      if (action === 'logout' && method === 'POST') {
        const authHeader = path[3];
        const token = authHeader?.replace('Bearer ', '') || '';
        const payload = jwtService.verifyToken(token);
        if (payload) {
          const bodyData = safeJsonParse(body);
          await userService.logout(payload.sub, str(bodyData?.refresh_token));
        }
        return { status: 200, body: JSON.stringify({ message: 'Logged out' }) };
      }

      if (action === 'password-reset' && method === 'POST') {
        const data = safeJsonParse(body);
        if (!data) return { status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
        const token = await userService.requestPasswordReset(str(data.email));
        return {
          status: 200,
          body: JSON.stringify({
            token: token || null,
            message: token ? 'Password reset token sent' : 'If email exists, reset token sent',
          }),
        };
      }

      if (action === 'reset-password' && method === 'POST') {
        const data = safeJsonParse(body);
        if (!data) return { status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
        await userService.resetPassword(str(data.token), str(data.password));
        return { status: 200, body: JSON.stringify({ message: 'Password reset successful' }) };
      }

      if (action === 'profile') {
        const authResult = await this.jwtAuth.authenticate(
          new Request(`http://localhost${path.join('/')}`, { method })
        );

        if (!authResult.authorized || !authResult.user) {
          return {
            status: 401,
            body: JSON.stringify({ error: authResult.error || 'Unauthorized' }),
          };
        }

        if (method === 'GET') {
          const profile = await userService.getProfile(authResult.user.id);
          return { status: 200, body: JSON.stringify(profile) };
        }

        if (method === 'PUT') {
          const data = safeJsonParse(body);
          if (!data) return { status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
          const updated = await userService.updateProfile(authResult.user.id, data);
          return { status: 200, body: JSON.stringify(updated) };
        }
      }

      if (action === 'change-password' && method === 'POST') {
        const authResult = await this.jwtAuth.authenticate(
          new Request(`http://localhost${path.join('/')}`, { method })
        );

        if (!authResult.authorized || !authResult.user) {
          return {
            status: 401,
            body: JSON.stringify({ error: authResult.error || 'Unauthorized' }),
          };
        }

        const data = safeJsonParse(body);
        if (!data) return { status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
        await userService.changePassword(
          authResult.user.id,
          str(data.current_password),
          str(data.new_password)
        );
        return { status: 200, body: JSON.stringify({ message: 'Password changed successfully' }) };
      }

      return { status: 404, body: JSON.stringify({ error: 'User endpoint not found' }) };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes('exists') || message.includes('Invalid') ? 400 : 500;
      return { status, body: JSON.stringify({ error: message }) };
    }
  }

  private async createTask(data: TaskCreateData): Promise<string> {
    const identity = await AgentIdentityService.getResolvedIdentity();
    const taskId = crypto.randomUUID();
    const maxRetries = num(data.max_retries, 3);
    const timeoutSeconds = num(data.timeout_seconds, 300);
    const isLongRunning = timeoutSeconds > 600;
    const projectId = data.project_id || '00000000-0000-0000-0000-000000000001';

    const result = await this.db.query<{ id: string }>(
      `INSERT INTO tasks (id, project_id, title, description, status, priority, depends_on, max_retries, timeout_seconds, is_long_running, assigned_to, category, created_by, created_by_identity)
       VALUES ($1, $2::uuid, $3, $4, 'PENDING', $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        taskId,
        projectId,
        str(data.title),
        str(data.description, ''),
        data.priority !== undefined ? num(data.priority, 50) : 50,
        data.depends_on || null,
        maxRetries,
        timeoutSeconds,
        isLongRunning,
        data.assigned_to || null,
        str(data.category, 'general'),
        identity.id,
        identity.id,
      ]
    );
    return result.rows[0]?.id || taskId;
  }

  private async handleRecoveryRequest(
    method: string,
    path: string[],
    body: string
  ): Promise<{ status: number; body: string }> {
    const action = path[2];

    if (action === 'failed' && method === 'POST') {
      const data = safeJsonParse<RecoveryData>(body || '{}');
      const maxRetries = num(data?.max_retries, 3);
      const delayMs = num(data?.delay_ms, 300000) / 1000;

      const result = await this.db.query<any>(
        `UPDATE tasks
         SET status = 'PENDING',
             error = NULL,
             next_retry_at = NOW() + ($3::text || '60 seconds')::INTERVAL,
             updated_at = NOW()
         WHERE status = 'FAILED'
           AND retry_count < $1
           AND completed_at < NOW() - ($2::text || '300 seconds')::INTERVAL
           AND error_category NOT IN ('FATAL', 'PERMANENT', 'INVALID_INPUT')
         RETURNING id, title, retry_count`,
        [maxRetries, String(delayMs), '60']
      );

      logger.info(`[NuPI] Recovered ${result.rows.length} failed tasks`);
      return {
        status: 200,
        body: JSON.stringify({ recovered: result.rows.length, tasks: result.rows }),
      };
    }

    if (action === 'stuck' && method === 'POST') {
      const result = await this.db.query<any>(
        `UPDATE tasks
         SET status = 'PENDING',
              error = 'Auto-recovered: stuck in RUNNING state',
              retry_count = COALESCE(retry_count, 0) + 1,
              updated_at = NOW()
         WHERE status = 'RUNNING'
           AND started_at < NOW() - INTERVAL '10 minutes'
           AND (updated_at IS NULL OR updated_at < NOW() - INTERVAL '5 minutes')
         RETURNING id, title`,
        []
      );

      if (result.rows.length > 0) {
        logger.warn(`[NuPI] Recovered ${result.rows.length} stuck tasks`);
      }
      return {
        status: 200,
        body: JSON.stringify({ recovered: result.rows.length, tasks: result.rows }),
      };
    }

    if (action === 'dlq-retry' && method === 'POST') {
      const data = safeJsonParse<RecoveryData>(body || '{}');
      const maxRetries = num(data?.max_retries, 3);
      const delayMs = num(data?.delay_ms, 300000) / 1000;

      const dlqItems = await this.db.query<any>(
        `SELECT id, original_task_id, title, description, error_message, retry_count
         FROM dead_letter_queue
         WHERE resolved = false
           AND retry_count < $1
           AND failed_at < NOW() - ($2::text || '300 seconds')::INTERVAL
         ORDER BY failed_at ASC
         LIMIT 10`,
        [maxRetries, String(delayMs)]
      );

      let successCount = 0;
      for (const item of dlqItems.rows) {
        try {
          const _newTaskId = await this.createTask({
            title: `[AUTO-RETRY] ${item.title}`,
            description: item.description || '',
            priority: 10,
          });

          await this.db.query(
            `UPDATE dead_letter_queue
             SET resolved = true,
                 review_status = 'resolved',
                 resolution_notes = 'Auto-retried by NuPI recovery API'
             WHERE id = $1`,
            [item.id]
          );

          logger.info(`[NuPI] Auto-retried DLQ item: ${item.title}`);
          successCount++;
        } catch (error) {
          logger.error(`[NuPI] Failed to retry DLQ item ${item.title}:`, error);
        }
      }

      return {
        status: 200,
        body: JSON.stringify({ retried: successCount, total: dlqItems.rows.length }),
      };
    }

    if (action === 'stats' && method === 'GET') {
      const [failed, stuck, dlq] = await Promise.all([
        this.db.query<{ count: string }>(
          `SELECT COUNT(*) FROM tasks
           WHERE status = 'FAILED'
           AND retry_count < 3
           AND error_category NOT IN ('FATAL', 'PERMANENT', 'INVALID_INPUT')`
        ),
        this.db.query<{ count: string }>(
          `SELECT COUNT(*) FROM tasks
           WHERE status = 'RUNNING'
           AND started_at < NOW() - INTERVAL '10 minutes'`
        ),
        this.db.query<{ count: string }>(
          `SELECT COUNT(*) FROM dead_letter_queue WHERE resolved = false`
        ),
      ]);

      return {
        status: 200,
        body: JSON.stringify({
          failedTasksRecoverable: parseInt(failed.rows[0]?.count || '0', 10),
          stuckTasks: parseInt(stuck.rows[0]?.count || '0', 10),
          dlqItemsPending: parseInt(dlq.rows[0]?.count || '0', 10),
        }),
      };
    }

    return { status: 404, body: JSON.stringify({ error: 'Unknown recovery action' }) };
  }

  private async executePrompt(data: PromptData): Promise<Record<string, unknown>> {
    const model = str(data.model, DEFAULT_MODEL);
    const systemPrompt = str(data.system_prompt, 'You are a helpful AI assistant.');
    const userPrompt = str(data.task, 'Hello');

    try {
      const provider = AIProviderFactory.createFromEnv();
      const result = await provider.complete(userPrompt, systemPrompt);
      return { success: true, output: result, model };
    } catch (error) {
      logger.error(`[NuPI] AI error: ${error}`);
      return { success: false, error: String(error), model };
    }
  }

  private async executeOpenAIChat(data: ChatCompletionData): Promise<Record<string, unknown>> {
    const model = str(data.model, DEFAULT_MODEL);
    const messages: ChatMessage[] = data.messages || [];

    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const userMessage = messages.find(m => m.role === 'user')?.content || '';

    try {
      const provider = AIProviderFactory.createFromEnv();
      const result = await provider.complete(userMessage, systemMessage);

      return {
        id: `nezha-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: result,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      };
    } catch (error) {
      logger.error(`[NuPI] OpenAI chat error: ${error}`);
      return { error: { message: String(error), type: 'internal_error', code: 500 } };
    }
  }

  private async executeReminder(data: ReminderData): Promise<Record<string, unknown>> {
    const interval = num(data.interval_ms, 3600000);
    const count = num(data.count, 1);
    const results: unknown[] = [];

    const systemPrompt =
      str(data.system_prompt) ||
      'You are the Nezha self-reminder assistant. Follow NEVER DECLARE DONE principle: 1. Never announce completion 2. Always end with questions 3. No Done/Completed/Finished 4. Check task queue regularly';

    for (let i = 0; i < count; i++) {
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, interval));
      }

      const tasks = await this.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM tasks WHERE status = 'PENDING'`
      );
      const pendingCount = parseInt(tasks.rows[0]?.count || '0', 10);

      const memories = await this.db.query<{ content: string }>(
        `SELECT content FROM memory ORDER BY created_at DESC LIMIT 3`
      );
      const recentInsights = memories.rows.map(r => r.content).join('; ');

      const task = `当前状态检查：
- 待处理任务: ${pendingCount}个
- 最近学习: ${recentInsights || '无'}

请用一句话总结并以问号结尾提醒AI继续工作。`;

      const executor = new PiSDKExecutor({ model: str(data.model, DEFAULT_MODEL) });
      const result = await executor.executeWithPrompt(systemPrompt, task, 60000);

      results.push({
        iteration: i + 1,
        pendingTasks: pendingCount,
        reminder: result.output,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      success: true,
      reminders: results,
      message: `完成${results.length}次提醒，间隔${interval}ms`,
    };
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
      logger.info('[NuPI] Server stopped');
    }
  }
}

export const server = new NuPIServer();
server
  .start()
  .then(() => {
    logger.info('[NuPI] API server started on port 4099 (auto-loaded on module import)');
  })
  .catch(err => {
    logger.error(`[NuPI] Failed to start: ${err}`);
    process.exit(1);
  });
