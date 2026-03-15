import * as http from 'http';
import { OPENCODE_API } from '../config/constants.js';
import { type AgentResponse, type AgentSession } from '../config/types.js';

const timestamp = () => new Date().toISOString();

const log = {
  info: (msg: string, ...args: unknown[]) => console.log(`[${timestamp()}] [INFO] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[${timestamp()}] [ERROR] ${msg}`, ...args),
};

const NETWORK_ERRORS: Record<string, string> = {
  ECONNREFUSED: 'Connection refused - server may be down or port incorrect',
  ETIMEDOUT: 'Connection timed out - server took too long to respond',
  ENOTFOUND: 'Host not found - check DNS or hostname configuration',
  ECONNRESET: 'Connection reset by peer - server closed connection unexpectedly',
  EHOSTUNREACH: 'Host unreachable - network or firewall issue',
  EPIPE: 'Broken pipe - connection closed while writing',
  ENETUNREACH: 'Network unreachable - check network connectivity',
  EAI_NONAME: 'Name resolution failed - hostname cannot be resolved',
};

const RETRYABLE_HTTP_STATUSES = new Set([429, 502, 503, 504]);

function isRetryableHttpStatus(status: number): boolean {
  return RETRYABLE_HTTP_STATUSES.has(status);
}

function getHttpStatusMessage(status: number): string {
  const messages: Record<number, string> = {
    429: 'Too Many Requests - rate limit exceeded',
    502: 'Bad Gateway - server received invalid response',
    503: 'Service Unavailable - server is temporarily overloaded',
    504: 'Gateway Timeout - server took too long to respond',
  };
  return messages[status] || `HTTP error (${status})`;
}

function isNetworkError(code: string): boolean {
  return code in NETWORK_ERRORS;
}

function getNetworkErrorMessage(code: string): string {
  return NETWORK_ERRORS[code] || `Network error (${code})`;
}

class NetworkError extends Error {
  code: string;
  attempt: number;
  url: string;
  constructor(message: string, code: string, attempt: number, url: string) {
    super(message);
    this.name = 'NetworkError';
    this.code = code;
    this.attempt = attempt;
    this.url = url;
  }
}

export interface AgentConfig {
  host?: string;
  port?: number;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export class Agent {
  private readonly host: string;
  private readonly port: number;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryDelay: number;

  constructor(config?: AgentConfig) {
    this.host = config?.host ?? OPENCODE_API.DEFAULT_HOST;
    this.port = config?.port ?? OPENCODE_API.DEFAULT_PORT;
    this.timeout = config?.timeout ?? 60000;
    this.maxRetries = config?.maxRetries ?? 3;
    this.retryDelay = config?.retryDelay ?? 1000;
  }

  private getBaseUrl(): string {
    return `http://${this.host}:${this.port}`;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private calculateRetryDelay(attempt: number): number {
    const baseDelay = this.retryDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.3 * baseDelay;
    return Math.min(baseDelay + jitter, 30000);
  }

  private formatErrorMessage(requestId: string, method: string, url: string, error: string, details?: string): string {
    return `[Agent] ${error} [${requestId}] ${method} ${url}${details ? ` - ${details}` : ''}`;
  }

  private formatNetworkError(error: NetworkError): string {
    const baseMsg = getNetworkErrorMessage(error.code);
    return `${baseMsg} (attempt ${error.attempt}/${this.maxRetries + 1})`;
  }

  private formatTimeoutError(timeoutMs: number, attempt: number): string {
    return `Request timed out after ${timeoutMs}ms - server may be slow or unreachable (attempt ${attempt}/${this.maxRetries + 1})`;
  }

  private async httpRequest(path: string, method: string, body?: string): Promise<{ ok: boolean; data?: unknown; status: number }> {
    const requestId = Math.random().toString(36).substring(2, 9);
    const url = `${this.getBaseUrl()}${path}`;
    let lastError: NetworkError | null = null;

    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
      try {
        const result = await this.executeRequest(requestId, path, method, url, body, attempt);
        
        if (result.ok) {
          return result;
        }

        const isRetryableStatus = result.status > 0 && isRetryableHttpStatus(result.status);
        
        if (!isRetryableStatus || attempt > this.maxRetries) {
          const errorDetails = [
            `Status: ${result.status}`,
            `URL: ${url}`,
            `Host: ${this.host}:${this.port}`,
          ].join(' | ');
          const statusMsg = result.status > 0 ? getHttpStatusMessage(result.status) : 'Connection failed';
          log.error(this.formatErrorMessage(requestId, method, url, `HTTP request failed: ${statusMsg}`, errorDetails));
          return result;
        }

        const delay = this.calculateRetryDelay(attempt);
        log.info(this.formatErrorMessage(requestId, method, url, `Retrying after ${Math.round(delay)}ms`, `Attempt ${attempt}/${this.maxRetries + 1}, Status: ${result.status}`));
        await this.sleep(delay);
      } catch (error) {
        if (!(error instanceof NetworkError)) {
          log.error(this.formatErrorMessage(requestId, method, url, 'Unexpected error', error instanceof Error ? error.message : String(error)));
          return { ok: false, status: 0 };
        }

        lastError = error;
        const isRetryable = isNetworkError(error.code);

        if (!isRetryable || attempt > this.maxRetries) {
          const errorDetails = [
            this.formatNetworkError(error),
            `URL: ${url}`,
            `Host: ${this.host}:${this.port}`,
          ].join(' | ');
          log.error(this.formatErrorMessage(requestId, method, url, 'Network request failed', errorDetails));
          return { ok: false, status: 0 };
        }

        const delay = this.calculateRetryDelay(attempt);
        log.info(this.formatErrorMessage(
          requestId, method, url,
          `Network error, retrying after ${Math.round(delay)}ms`,
          `${getNetworkErrorMessage(error.code)} - Attempt ${attempt}/${this.maxRetries + 1}`
        ));
        await this.sleep(delay);
      }
    }

    if (lastError) {
      const errorMsg = `Failed after ${this.maxRetries + 1} attempts: ${this.formatNetworkError(lastError)}`;
      log.error(this.formatErrorMessage(requestId, method, url, 'Max retries exceeded', errorMsg));
    }

    return { ok: false, status: 0 };
  }

  private async executeRequest(requestId: string, path: string, method: string, url: string, body: string | undefined, attempt: number): Promise<{ ok: boolean; data?: unknown; status: number }> {
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
            if (res.statusCode !== 200) {
              log.error(this.formatErrorMessage(requestId, method, url, `Request failed`, `Status: ${res.statusCode} - ${getHttpStatusMessage(res.statusCode || 0)}`), parsed);
            }
            resolve({ ok: res.statusCode === 200, data: parsed, status: res.statusCode ?? 0 });
          } catch {
            const truncatedData = data.length > 200 ? data.substring(0, 200) + '...' : data;
            log.error(this.formatErrorMessage(requestId, method, url, `Response parse error`, `Invalid JSON response (status: ${res.statusCode}, body: "${truncatedData}")`));
            resolve({ ok: false, status: res.statusCode ?? 0 });
          }
        });
      });

      req.on('error', (e: NodeJS.ErrnoException) => {
        const code = e.code || 'UNKNOWN';
        const errorType = code.startsWith('E') ? 'Connection error' : 'Request error';
        log.error(this.formatErrorMessage(requestId, method, url, errorType, `${e.message} (code: ${code})`));
        throw new NetworkError(e.message, code, attempt, url);
      });

      req.setTimeout(this.timeout, () => {
        const timeoutMsg = this.formatTimeoutError(this.timeout, attempt);
        log.error(this.formatErrorMessage(requestId, method, url, 'Request timeout', timeoutMsg));
        req.destroy();
        throw new NetworkError(timeoutMsg, 'ETIMEDOUT', attempt, url);
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
      const errorMsg = result.status > 0 
        ? `Failed to create session: server returned status ${result.status} (${getHttpStatusMessage(result.status) || 'unknown error'})`
        : 'Failed to create session: network error - check server connectivity';
      log.error(`[Agent] ${errorMsg}`);
      throw new Error(errorMsg);
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
      const errorMsg = result.status > 0 
        ? `Failed to send message: server returned status ${result.status} (${getHttpStatusMessage(result.status) || 'unknown error'})`
        : 'Failed to send message: network error - check server connectivity';
      log.error(`[Agent] ${errorMsg}`);
      return {
        success: false,
        message: errorMsg,
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
      const errorDetail = error instanceof Error ? error.message : String(error);
      log.error(`[Agent] executeTask failed: ${errorDetail}`);
      return {
        success: false,
        message: `Task execution failed: ${errorDetail}`,
      };
    }
  }
}
