import http from 'http';
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

const PORT = process.env.NUPI_PORT || 4099;

class NuPIServer {
  private server: http.Server | null = null;
  private db: DatabaseClient;
  private userService: UserService | null = null;
  private jwtAuth: JwtAuthMiddleware;

  constructor() {
    this.db = new DatabaseClient(Config.getInstance());
    this.jwtAuth = new JwtAuthMiddleware(this.db);
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

      const url = req.url?.split('?')[0] ?? '';
      const method = req.method ?? 'GET';

      try {
        let body = '';
        if (method === 'POST' || method === 'PUT') {
          body = await new Promise<string>((resolve, reject) => {
            req.on('data', chunk => (body += chunk));
            req.on('end', () => resolve(body));
            req.on('error', reject);
          });
        }

        const response = await this.handleRequest(method, url, body, headers, req);
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
      const identity = await AgentIdentityService.getResolvedIdentity();
      return { status: 200, body: JSON.stringify(identity) };
    }

    if (path[0] === 'tasks') {
      if (method === 'GET') {
        const queryParams = new URLSearchParams(url.split('?')[1] || '');
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
        const data = JSON.parse(body);
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
      const data = JSON.parse(body);
      const broadcastService = await BroadcastService.create(this.db);
      const id = await broadcastService.sendBroadcast(data.message, {
        targetAgent: data.to,
        priority: (data.priority as any) || 'normal',
      });
      return { status: 201, body: JSON.stringify({ id }) };
    }

    if (path[0] === 'memory') {
      if (method === 'GET') {
        const query = path[1] || '';
        const limit = parseInt(
          new URLSearchParams(url.split('?')[1] || '').get('limit') || '20',
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
        const data = JSON.parse(body);
        const result = await this.db.query<any>(
          `INSERT INTO memory (content, source, tags)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [data.content || data.insight || '', data.source || 'nupi', data.tags || []]
        );
        return { status: 201, body: JSON.stringify({ id: result.rows[0]?.id }) };
      }
    }

    if (path[0] === 'prompt' && method === 'POST') {
      const data = JSON.parse(body);
      const result = await this.executePrompt(data);
      return { status: 200, body: JSON.stringify(result) };
    }

    if (path[0] === 'v1' && path[1] === 'chat' && path[2] === 'completions' && method === 'POST') {
      const data = JSON.parse(body);
      const result = await this.executeOpenAIChat(data);
      return { status: 200, body: JSON.stringify(result) };
    }

    if (path[0] === 'remind' && method === 'POST') {
      const data = JSON.parse(body);
      const result = await this.executeReminder(data);
      return { status: 200, body: JSON.stringify(result) };
    }

    if (path[0] === 'admin' && path[1] === 'recovery') {
      return await this.handleRecoveryRequest(method, path, body);
    }

    if (path[0] === 'tasks' && path[2] === 'status' && method === 'PUT') {
      const taskId = path[1];
      const data = JSON.parse(body || '{}');
      await this.db.query(
        `UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2`,
        [data.status, taskId]
      );
      return { status: 200, body: JSON.stringify({ id: taskId, status: data.status }) };
    }

    if (path[0] === 'tasks' && path[2] === 'result' && method === 'PUT') {
      const taskId = path[1];
      const data = JSON.parse(body || '{}');
      await this.db.query(
        `UPDATE tasks SET result = $1, completed_at = NOW() WHERE id = $2`,
        [JSON.stringify(data.result), taskId]
      );
      return { status: 200, body: JSON.stringify({ id: taskId }) };
    }

    if (path[0] === 'tasks' && path[2] === 'error' && method === 'PUT') {
      const taskId = path[1];
      const data = JSON.parse(body || '{}');
      await this.db.query(
        `UPDATE tasks SET error = $1, updated_at = NOW() WHERE id = $2`,
        [data.error, taskId]
      );
      return { status: 200, body: JSON.stringify({ id: taskId }) };
    }

    if (path[0] === 'issues' && method === 'GET') {
      const limit = parseInt(
        new URLSearchParams(url.split('?')[1] || '').get('limit') || '10', 10
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
      const query = new URLSearchParams(url.split('?')[1] || '');
      const q = query.get('q') || '';
      const limit = parseInt(query.get('limit') || '5', 10);
      const result = await this.db.query<any>(
        `SELECT content, created_at FROM memory
         WHERE content ILIKE $1 ORDER BY created_at DESC LIMIT $2`,
        [`%${q}%`, limit]
      );
      return { status: 200, body: JSON.stringify(result) };
    }

    if (path[0] === 'status' && method === 'GET') {
      const [tasks, issues, memories] = await Promise.all([
        this.db.query<{ count: string }>("SELECT COUNT(*) as count FROM tasks WHERE status = 'PENDING'"),
        this.db.query<{ count: string }>("SELECT COUNT(*) as count FROM issues WHERE status NOT IN ('resolved', 'closed')"),
        this.db.query<{ count: string }>('SELECT COUNT(*) as count FROM memory'),
      ]);
      return {
        status: 200,
        body: JSON.stringify({
          pendingTasks: parseInt(tasks.rows[0]?.count || '0', 10),
          openIssues: parseInt(issues.rows[0]?.count || '0', 10),
          memoryCount: parseInt(memories.rows[0]?.count || '0', 10),
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
        const data = JSON.parse(body);
        const result = await userService.register({
          email: data.email,
          username: data.username,
          password: data.password,
          display_name: data.display_name,
        });
        return {
          status: 201,
          body: JSON.stringify({ user: result.user, accessToken: result.tokens.accessToken }),
        };
      }

      if (action === 'login' && method === 'POST') {
        const data = JSON.parse(body);
        const result = await userService.login({
          email: data.email,
          username: data.username,
          password: data.password,
        });
        return {
          status: 200,
          body: JSON.stringify({ user: result.user, accessToken: result.tokens.accessToken }),
        };
      }

      if (action === 'refresh' && method === 'POST') {
        const data = JSON.parse(body);
        const tokens = await userService.refreshToken(data.refresh_token);
        return { status: 200, body: JSON.stringify(tokens) };
      }

      if (action === 'logout' && method === 'POST') {
        const authHeader = path[3];
        const token = authHeader?.replace('Bearer ', '') || '';
        const payload = jwtService.verifyToken(token);
        if (payload) {
          await userService.logout(payload.sub, body ? JSON.parse(body).refresh_token : undefined);
        }
        return { status: 200, body: JSON.stringify({ message: 'Logged out' }) };
      }

      if (action === 'password-reset' && method === 'POST') {
        const data = JSON.parse(body);
        const token = await userService.requestPasswordReset(data.email);
        return {
          status: 200,
          body: JSON.stringify({
            token: token || null,
            message: token ? 'Password reset token sent' : 'If email exists, reset token sent',
          }),
        };
      }

      if (action === 'reset-password' && method === 'POST') {
        const data = JSON.parse(body);
        await userService.resetPassword(data.token, data.password);
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
          const data = JSON.parse(body);
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

        const data = JSON.parse(body);
        await userService.changePassword(
          authResult.user.id,
          data.current_password,
          data.new_password
        );
        return { status: 200, body: JSON.stringify({ message: 'Password changed successfully' }) };
      }

      return { status: 404, body: JSON.stringify({ error: 'User endpoint not found' }) };
    } catch (error: any) {
      const status =
        error.message.includes('exists') || error.message.includes('Invalid') ? 400 : 500;
      return { status, body: JSON.stringify({ error: error.message }) };
    }
  }

  private async createTask(data: any): Promise<string> {
    const result = await this.db.query<any>(
      `INSERT INTO tasks (title, description, type, priority, status, category)
       VALUES ($1, $2, $3, $4, 'PENDING', $5)
       RETURNING id`,
      [
        data.title,
        data.description || '',
        data.type || 'implementation',
        data.priority !== undefined ? data.priority : 50,
        data.category || 'general'
      ]
    );
    return result.rows[0]?.id;
  }

  private async saveMemory(data: any): Promise<string> {
    const result = await this.db.query<any>(
      `INSERT INTO memory (topic, insight, source)
       VALUES ($1, $2, 'nupi')
       RETURNING id`,
      [data.topic, data.insight]
    );
    return result.rows[0]?.id;
  }

  private async handleRecoveryRequest(
    method: string,
    path: string[],
    body: string
  ): Promise<{ status: number; body: string }> {
    const action = path[2];

    if (action === 'failed' && method === 'POST') {
      const data = JSON.parse(body || '{}');
      const maxRetries = data.max_retries || 3;
      const delayMs = (data.delay_ms || 300000) / 1000;

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
      return { status: 200, body: JSON.stringify({ recovered: result.rows.length, tasks: result.rows }) };
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
      return { status: 200, body: JSON.stringify({ recovered: result.rows.length, tasks: result.rows }) };
    }

    if (action === 'dlq-retry' && method === 'POST') {
      const data = JSON.parse(body || '{}');
      const maxRetries = data.max_retries || 3;
      const delayMs = (data.delay_ms || 300000) / 1000;

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
          const newTaskId = await this.createTask({
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

      return { status: 200, body: JSON.stringify({ retried: successCount, total: dlqItems.rows.length }) };
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

  private async executePrompt(data: any): Promise<any> {
    const model = data.model || 'llama3.2:3b';
    const systemPrompt = data.system_prompt || 'You are a helpful AI assistant.';
    const userPrompt = data.task || 'Hello';

    try {
      const provider = AIProviderFactory.createFromEnv();
      const result = await provider.complete(userPrompt, systemPrompt);
      return { success: true, output: result, model };
    } catch (error) {
      logger.error(`[NuPI] AI error: ${error}`);
      return { success: false, error: String(error), model };
    }
  }

  private async executeOpenAIChat(data: any): Promise<any> {
    const model = data.model || 'glm-4-flash';
    const messages = data.messages || [];

    const systemMessage = messages.find((m: any) => m.role === 'system')?.content || '';
    const userMessage = messages.find((m: any) => m.role === 'user')?.content || '';

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

  private async executeReminder(data: any): Promise<any> {
    const interval = data.interval_ms || 3600000;
    const count = data.count || 1;
    const results = [];

    const systemPrompt =
      data.system_prompt ||
      '你是Nezha的自我提醒助手。遵循NEVER DECLARE DONE原则：1.永远不要宣布完成 2.总是以问题结尾 3.禁止Done/Completed/Finished 4.定期检查任务队列';

    for (let i = 0; i < count; i++) {
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, interval));
      }

      const tasks = await this.db.query<any>(
        `SELECT COUNT(*) as count FROM tasks WHERE status = 'PENDING'`
      );
      const pendingCount = parseInt(tasks.rows[0]?.count || '0', 10);

      const memories = await this.db.query<any>(
        `SELECT content FROM memory ORDER BY created_at DESC LIMIT 3`
      );
      const recentInsights = memories.rows.map((r: any) => r.content).join('; ');

      const task = `当前状态检查：
- 待处理任务: ${pendingCount}个
- 最近学习: ${recentInsights || '无'}

请用一句话总结并以问号结尾提醒AI继续工作。`;

      const executor = new PiSDKExecutor({ model: data.model || 'zai:glm-4.5-flash' });
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
server.start().catch(err => {
  logger.error(`[NuPI] Failed to start: ${err}`);
  process.exit(1);
});
