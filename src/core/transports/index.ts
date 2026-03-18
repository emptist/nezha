import { spawn, type ChildProcess } from 'child_process';

export type TransportMode = 'http' | 'cli';

export interface TransportConfig {
  mode: TransportMode;
  serverUrl: string;
  timeout: number;
}

export interface TransportResponse {
  content: string;
  artifacts: string[];
}

export interface StreamingCallback {
  (chunk: string, type: 'text' | 'thinking' | 'error'): void;
}

export interface SessionManager {
  getSessionId(): string | null;
  setSessionId(id: string | null): void;
  clearSession(): void;
}

export class HttpTransport {
  private readonly serverUrl: string;
  private readonly timeout: number;
  private sessionId: string | null = null;

  constructor(serverUrl: string, timeout: number) {
    this.serverUrl = serverUrl;
    this.timeout = timeout;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  setSessionId(id: string | null): void {
    this.sessionId = id;
  }

  clearSession(): void {
    this.sessionId = null;
  }

  async createSession(): Promise<string> {
    const response = await fetch(`${this.serverUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'nezha-agent-session' }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { id: string };
    this.sessionId = data.id;
    return data.id;
  }

  async sendMessage(message: string): Promise<string> {
    if (!this.sessionId) {
      await this.createSession();
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.serverUrl}/session/${this.sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parts: [{ type: 'text', text: message }],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as {
        parts?: Array<{ type: string; text: string }>;
      };

      if (data.parts) {
        return data.parts
          .filter(p => p.type === 'text')
          .map(p => p.text)
          .join('\n');
      }

      return JSON.stringify(data);
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}

export class CliTransport {
  private readonly serverUrl: string;
  private readonly timeout: number;

  constructor(serverUrl: string, timeout: number) {
    this.serverUrl = serverUrl;
    this.timeout = timeout;
  }

  getSessionId(): null {
    return null;
  }

  setSessionId(_id: string | null): void {
    // CLI mode doesn't use sessions
  }

  clearSession(): void {
    // CLI mode doesn't use sessions
  }

  async sendMessage(message: string): Promise<string> {
    return this.runCommand(message, false);
  }

  async sendMessageStreaming(message: string, onChunk: StreamingCallback): Promise<string> {
    return this.runCommand(message, true, onChunk);
  }

  private runCommand(
    prompt: string,
    streaming: boolean,
    onChunk?: StreamingCallback
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        'run',
        '--attach',
        this.serverUrl,
        '--format',
        'json',
        ...(streaming ? ['--thinking'] : []),
        prompt,
      ];

      const proc = spawn('opencode', args, {
        stdio: ['pipe', 'pipe', streaming ? 'pipe' : 'pipe'],
        env: { ...process.env },
      });

      let output = '';
      let errorOutput = '';
      let stderrBuffer = '';

      if (streaming && onChunk) {
        proc.stderr?.on('data', data => {
          stderrBuffer += data.toString();
          const lines = stderrBuffer.split('\n');
          stderrBuffer = lines.pop() || '';

          for (const line of lines) {
            try {
              const event = JSON.parse(line);
              if (event.type === 'text') {
                output += event.part?.text || '';
                onChunk(event.part?.text || '', 'text');
              } else if (event.type === 'thinking') {
                onChunk(event.part?.text || '', 'thinking');
              }
            } catch {
              // Not JSON, ignore
            }
          }
        });
      } else {
        proc.stderr?.on('data', data => {
          errorOutput += data.toString();
        });
      }

      proc.stdout?.on('data', data => {
        if (!streaming) {
          output += data.toString();
        }
      });

      const timeoutId = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error(`Command timed out after ${this.timeout}ms`));
      }, this.timeout);

      proc.on('close', code => {
        clearTimeout(timeoutId);

        if (code === 0) {
          if (!streaming) {
            const response = this.parseJsonOutput(output);
            resolve(response);
          } else {
            resolve(output);
          }
        } else {
          reject(new Error(`opencode exited with code ${code}: ${errorOutput}`));
        }
      });

      proc.on('error', err => {
        clearTimeout(timeoutId);
        reject(new Error(`Failed to spawn opencode: ${err.message}`));
      });
    });
  }

  private parseJsonOutput(output: string): string {
    const lines = output.trim().split('\n');
    const textParts: string[] = [];

    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.type === 'text' && event.part?.text) {
          textParts.push(event.part.text);
        }
      } catch {
        continue;
      }
    }

    return textParts.join('');
  }
}

export function createTransport(config: TransportConfig): HttpTransport | CliTransport {
  if (config.mode === 'cli') {
    return new CliTransport(config.serverUrl, config.timeout);
  }
  return new HttpTransport(config.serverUrl, config.timeout);
}
