import http from 'http';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { Config } from '../config/Config.js';
import { logger } from '../utils/logger.js';
import { AgentIdentityService } from '../services/AgentIdentityService.js';
import { BroadcastService } from '../services/BroadcastService.js';
import { PiExecutor } from '../services/PiExecutor.js';

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
    headers: Record<string, string>
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
        data.priority || 50,
        data.category || 'general',
        data.created_by || 'nezhapi',
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
    const executor = new PiExecutor({
      model: data.model || 'zai:glm-4.5-flash',
    });

    const result = await executor.executeWithPrompt(
      data.system_prompt || 'You are a helpful AI assistant.',
      data.task || 'Hello',
      data.timeout_ms || 600000
    );

    return result;
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
