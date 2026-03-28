import http from 'http';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { Config } from '../config/Config.js';
import { logger } from '../utils/logger.js';
import { AgentIdentityService } from '../services/AgentIdentityService.js';
import { BroadcastService } from '../services/BroadcastService.js';
import { PiSDKExecutor } from '../services/PiSDKExecutor.js';
import { AIProviderFactory } from '../services/ai/index.js';

const PORT = process.env.NEZHAPI_PORT || 4099;

class NezhaApiServer {
  private server: http.Server | null = null;
  private db: DatabaseClient;

  constructor() {
    this.db = new DatabaseClient(Config.getInstance());
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

        const response = await this.handleRequest(method, url, body, headers);
        res.writeHead(response.status, { ...headers, ...response.headers });
        res.end(response.body);
      } catch (error) {
        logger.error(`[NezhaApi] Error: ${error}`);
        res.writeHead(500, headers);
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });

    this.server.listen(PORT, () => {
      logger.info(`[NezhaApi] Server running on port ${PORT}`);
    });
  }

  private async handleRequest(
    method: string,
    url: string,
    body: string,
    _headers: Record<string, string>
  ): Promise<{ status: number; body: string; headers?: Record<string, string> }> {
    const path = url.split('/').filter(Boolean);

    if (path[0] === 'health') {
      return { status: 200, body: JSON.stringify({ status: 'ok', service: 'nezhapi' }) };
    }

    if (path[0] === 'identity' && method === 'GET') {
      const identity = await AgentIdentityService.getResolvedIdentity();
      return { status: 200, body: JSON.stringify(identity) };
    }

    if (path[0] === 'tasks') {
      if (method === 'GET') {
        const limit = parseInt(path[1] || '10', 10);
        const result = await this.db.query<any>(
          `SELECT id, title, description, priority, status, category, type, created_at 
           FROM tasks WHERE status = 'PENDING' ORDER BY priority DESC, created_at ASC LIMIT $1`,
          [limit]
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
        const result = await this.db.query<any>(
          `SELECT id, topic, insight, source, created_at 
           FROM memory WHERE topic ILIKE $1 OR insight ILIKE $1 
           ORDER BY created_at DESC LIMIT 20`,
          [`%${query}%`]
        );
        return { status: 200, body: JSON.stringify(result) };
      }

      if (method === 'POST') {
        const data = JSON.parse(body);
        const id = await this.saveMemory(data);
        return { status: 201, body: JSON.stringify({ id }) };
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

    return { status: 404, body: JSON.stringify({ error: 'Not found' }) };
  }

  private async createTask(data: any): Promise<string> {
    const result = await this.db.query<any>(
      `INSERT INTO tasks (title, description, type, priority, status, category, created_by_identity)
       VALUES ($1, $2, $3, $4, 'PENDING', $5, $6)
       RETURNING id`,
      [
        data.title,
        data.description || '',
        data.type || 'implementation',
        data.priority !== undefined ? data.priority : 50,
        data.category || 'general',
        data.created_by || 'S-nezha-e33f9a0-20260325-133422-64db91',
      ]
    );
    return result.rows[0]?.id;
  }

  private async saveMemory(data: any): Promise<string> {
    const result = await this.db.query<any>(
      `INSERT INTO memory (topic, insight, source)
       VALUES ($1, $2, 'nezhapi')
       RETURNING id`,
      [data.topic, data.insight]
    );
    return result.rows[0]?.id;
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
      logger.error(`[NezhaApi] AI error: ${error}`);
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
      logger.error(`[NezhaApi] OpenAI chat error: ${error}`);
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
      logger.info('[NezhaApi] Server stopped');
    }
  }
}

const server = new NezhaApiServer();
server.start().catch(err => {
  logger.error(`[NezhaApi] Failed to start: ${err}`);
  process.exit(1);
});

process.on('SIGINT', async () => {
  await server.stop();
  process.exit(0);
});
