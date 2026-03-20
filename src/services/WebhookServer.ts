import http from 'http';
import { logger } from '../utils/logger.js';
import { getPluginManager, type WebhookContext } from '../core/PluginManager.js';

export interface WebhookServerConfig {
  port: number;
  path: string;
  token?: string;
  enabled: boolean;
}

export interface WebhookMapping {
  path: string;
  action: 'wake' | 'task';
  taskTemplate?: string;
  priority?: number;
}

const DEFAULT_CONFIG: WebhookServerConfig = {
  port: 8789,
  path: '/webhook',
  enabled: true,
};

const DEFAULT_MAPPINGS: WebhookMapping[] = [
  { path: 'wake', action: 'wake' },
  { path: 'task', action: 'task', priority: 5 },
];

export class WebhookServer {
  private server: http.Server | null = null;
  private config: WebhookServerConfig;
  private mappings: WebhookMapping[];
  private createTaskCallback?: (options: {
    title: string;
    description: string;
    priority: number;
    category: string;
    metadata?: Record<string, unknown>;
  }) => Promise<{ id: string }>;

  constructor(
    config: Partial<WebhookServerConfig> = {},
    mappings: WebhookMapping[] = DEFAULT_MAPPINGS
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.mappings = mappings;
  }

  setCreateTaskCallback(
    cb: (options: {
      title: string;
      description: string;
      priority: number;
      category: string;
      metadata?: Record<string, unknown>;
    }) => Promise<{ id: string }>
  ): void {
    this.createTaskCallback = cb;
  }

  private authenticate(req: http.IncomingMessage): boolean {
    if (!this.config.token) return true;
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return false;
    return auth.slice(7) === this.config.token;
  }

  private async parseBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString();
          resolve(body ? JSON.parse(body) : {});
        } catch {
          resolve({});
        }
      });
      req.on('error', reject);
    });
  }

  private renderTemplate(template: string, ctx: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, p) => {
      const val = p
        .split('.')
        .reduce(
          (o: unknown, k: string) =>
            o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined,
          ctx
        );
      return val !== undefined ? String(val) : '';
    });
  }

  async start(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('WebhookServer disabled');
      return;
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', `http://localhost:${this.config.port}`);

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        if (!url.pathname.startsWith(this.config.path)) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }

        if (!this.authenticate(req)) {
          res.writeHead(401);
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }

        try {
          const body = await this.parseBody(req);
          const webhookPath = url.pathname.slice(this.config.path.length) || '/';
          const mapping = this.mappings.find(m => webhookPath.endsWith(m.path));

          const ctx: WebhookContext = {
            path: webhookPath,
            payload: body,
            headers: req.headers as Record<string, string | string[] | undefined>,
            timestamp: new Date(),
            source: 'http',
          };

          const pm = getPluginManager();
          await pm.executeOnWebhook(ctx);

          if (mapping?.action === 'wake' && mapping) {
            await pm.executeOnWake({ ...ctx, message: JSON.stringify(body) });
            logger.info(`Webhook wake: ${webhookPath}`);
          } else if (mapping?.action === 'task' && this.createTaskCallback) {
            const desc = mapping.taskTemplate
              ? this.renderTemplate(mapping.taskTemplate, { payload: body, path: webhookPath })
              : JSON.stringify(body);

            const task = await this.createTaskCallback({
              title: `Webhook: ${webhookPath}`,
              description: desc,
              priority: mapping.priority || 5,
              category: 'webhook',
              metadata: { path: webhookPath, source: 'webhook' },
            });

            await pm.executeOnWebhookTask(ctx, task);
            logger.info(`Webhook task created: ${task.id}`);
          }

          res.writeHead(200);
          res.end(JSON.stringify({ status: 'ok' }));
        } catch (error) {
          logger.error('Webhook handler error:', error);
          res.writeHead(500);
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      });

      this.server.on('error', reject);
      this.server.listen(this.config.port, () => {
        logger.info(`WebhookServer listening on ${this.config.port}${this.config.path}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise(resolve => {
      this.server?.close(() => {
        logger.info('WebhookServer stopped');
        resolve();
      });
    });
  }
}

let webhookServerInstance: WebhookServer | null = null;

export function getWebhookServer(): WebhookServer {
  if (!webhookServerInstance) {
    webhookServerInstance = new WebhookServer();
  }
  return webhookServerInstance;
}
