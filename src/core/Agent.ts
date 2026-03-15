import http from 'http';
import { OPENCODE_API } from '../config/constants.js';
import { type AgentResponse, type AgentSession } from '../config/types.js';

export interface AgentConfig {
  host?: string;
  port?: number;
  timeout?: number;
}

export class Agent {
  private readonly host: string;
  private readonly port: number;
  private readonly timeout: number;

  constructor(config?: AgentConfig) {
    this.host = config?.host ?? OPENCODE_API.DEFAULT_HOST;
    this.port = config?.port ?? OPENCODE_API.DEFAULT_PORT;
    this.timeout = config?.timeout ?? 60000;
  }

  private getBaseUrl(): string {
    return `http://${this.host}:${this.port}`;
  }

  private async httpRequest(path: string, method: string, body?: string): Promise<{ ok: boolean; data?: unknown; status:
   number }> {
    return new Promise((resolve) => {
      const options = {
        hostname: this.host,
        port: this.port,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ ok: res.statusCode === 200, data: parsed, status: res.statusCode ?? 0 });
          } catch {
            resolve({ ok: false, status: res.statusCode ?? 0 });
          }
        });
      });

      req.on('error', (e) => {
        resolve({ ok: false, status: 0 });
      });

      req.setTimeout(this.timeout, () => {
        req.destroy();
        resolve({ ok: false, status: 0 });
      });

      if (body) {
        req.write(body);
      }
      req.end();
    });
  }

  async createSession(): Promise<AgentSession> {
    const result = await this.httpRequest('/session', 'POST', '{}');

    if (!result.ok) {
      throw new Error(`Failed to create session: ${result.status}`);
    }

    const data = result.data as {
      id: string;
      projectID: string;
      time: { created: number };
    };
    
    return {
      id: data.id,
      projectId: data.projectID,
      createdAt: new Date(data.time.created),
    };
  }

  async sendMessage(sessionId: string, message: string): Promise<AgentResponse> {
    const body = JSON.stringify({
      parts: [{ type: 'text', text: message }],
    });

    const result = await this.httpRequest(`/session/${sessionId}/message`, 'POST', body);

    if (!result.ok) {
      return {
        success: false,
        message: `Failed to send message: ${result.status}`,
      };
    }

    return {
      success: true,
      sessionId,
    };
  }

  async executeTask(message: string): Promise<AgentResponse> {
    try {
      const session = await this.createSession();
      return await this.sendMessage(session.id, message);
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
