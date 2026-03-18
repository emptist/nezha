import { spawn, type ChildProcess } from 'child_process';

const MAX_PROMPT_LENGTH = 100000;
const MAX_SERVER_URL_LENGTH = 2048;

function sanitizeStringForCli(input: string): string {
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

function validateServerUrl(url: string): void {
  if (url.length > MAX_SERVER_URL_LENGTH) {
    throw new Error(`Server URL exceeds maximum length of ${MAX_SERVER_URL_LENGTH}`);
  }
  if (!/^[a-zA-Z0-9._~:/\-]+$/.test(url)) {
    throw new Error('Server URL contains invalid characters');
  }
}

function validatePrompt(prompt: string): void {
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new Error(`Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH}`);
  }
  const nullBytes = prompt.match(/\x00/g);
  if (nullBytes) {
    throw new Error('Prompt contains null bytes');
  }
}

/**
 * Transport mode determines how the agent communicates with the backend.
 * - 'http': REST API communication via HTTP requests
 * - 'cli': Spawns opencode CLI process for local execution
 */
export type TransportMode = 'http' | 'cli';

/**
 * Configuration for creating a transport instance.
 */
export interface TransportConfig {
  /** Transport mode: 'http' or 'cli' */
  mode: TransportMode;
  /** Server URL for HTTP transport or CLI server address */
  serverUrl: string;
  /** Request timeout in milliseconds */
  timeout: number;
}

/**
 * Response structure from transport operations.
 */
export interface TransportResponse {
  /** The response content as a string */
  content: string;
  /** List of file artifacts mentioned in the response */
  artifacts: string[];
}

/**
 * Callback function for streaming responses.
 * @param chunk - The text chunk received
 * @param type - Type of chunk: 'text' (normal output), 'thinking' (reasoning), 'error' (error message)
 */
export interface StreamingCallback {
  (chunk: string, type: 'text' | 'thinking' | 'error'): void;
}

/**
 * Interface for session management across transport implementations.
 * All transports must implement this interface to ensure consistent session handling.
 */
export interface SessionManager {
  /** Get the current session ID, or null if no session exists */
  getSessionId(): string | null;
  /** Set the session ID */
  setSessionId(id: string | null): void;
  /** Clear/reset the current session */
  clearSession(): void;
}

/**
 * HTTP-based transport for communicating with OpenCode server via REST API.
 * Maintains persistent sessions and provides reliable request/response handling.
 */
export class HttpTransport implements SessionManager {
  private readonly serverUrl: string;
  private readonly timeout: number;
  private sessionId: string | null = null;
  private sessionCreationLock: Promise<string> | null = null;

  /**
   * Creates a new HttpTransport instance.
   * @param serverUrl - Base URL of the OpenCode server
   * @param timeout - Request timeout in milliseconds
   */
  constructor(serverUrl: string, timeout: number) {
    this.serverUrl = serverUrl;
    this.timeout = timeout;
  }

  /** @inheritDoc */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /** @inheritDoc */
  setSessionId(id: string | null): void {
    this.sessionId = id;
  }

  /** @inheritDoc */
  clearSession(): void {
    this.sessionId = null;
  }

  /**
   * Creates a new session with the server.
   * Returns existing session ID if already created (thread-safe).
   * @returns The session ID
   */
  async createSession(): Promise<string> {
    if (this.sessionId) {
      return this.sessionId;
    }

    if (this.sessionCreationLock) {
      return this.sessionCreationLock;
    }

    this.sessionCreationLock = this.doCreateSession();
    try {
      const sessionId = await this.sessionCreationLock;
      return sessionId;
    } finally {
      this.sessionCreationLock = null;
    }
  }

  private async doCreateSession(): Promise<string> {
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

  /**
   * Sends a message to the agent via HTTP.
   * Automatically creates/uses a session for stateful communication.
   * @param message - The message to send
   * @returns The response content
   */
  async sendMessage(message: string): Promise<string> {
    const sessionId = await this.createSession();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.serverUrl}/session/${sessionId}/message`, {
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
        throw new Error(`HTTP ${response.status} to ${this.serverUrl}: ${errorText}`);
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

/**
 * CLI-based transport that spawns opencode process for local execution.
 * Supports streaming responses via stderr parsing.
 */
export class CliTransport implements SessionManager {
  private readonly serverUrl: string;
  private readonly timeout: number;

  /**
   * Creates a new CliTransport instance.
   * @param serverUrl - Server address to pass to opencode
   * @param timeout - Process timeout in milliseconds
   */
  constructor(serverUrl: string, timeout: number) {
    validateServerUrl(serverUrl);
    this.serverUrl = sanitizeStringForCli(serverUrl);
    this.timeout = timeout;
  }

  /** @inheritDoc - CLI mode always returns null (no session concept) */
  getSessionId(): null {
    return null;
  }

  /** @inheritDoc - CLI mode doesn't use sessions */
  setSessionId(_id: string | null): void {}

  /** @inheritDoc - CLI mode doesn't use sessions */
  clearSession(): void {}

  /**
   * Sends a message by spawning opencode CLI process.
   * @param message - The message to send
   * @returns The response content
   */
  async sendMessage(message: string): Promise<string> {
    return this.runCommand(message, false);
  }

  /**
   * Sends a message with streaming response callback.
   * Only available in CLI mode.
   * @param message - The message to send
   * @param onChunk - Callback for each streaming chunk
   * @returns The complete response content
   */
  async sendMessageStreaming(message: string, onChunk: StreamingCallback): Promise<string> {
    return this.runCommand(message, true, onChunk);
  }

  private runCommand(
    prompt: string,
    streaming: boolean,
    onChunk?: StreamingCallback
  ): Promise<string> {
    validatePrompt(prompt);
    const sanitizedPrompt = sanitizeStringForCli(prompt);

    return new Promise((resolve, reject) => {
      const args = [
        'run',
        '--attach',
        this.serverUrl,
        '--format',
        'json',
        ...(streaming ? ['--thinking'] : []),
        sanitizedPrompt,
      ];

      let proc: ChildProcess;
      let procKilled = false;

      try {
        proc = spawn('opencode', args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env },
        });
        proc.stdin?.end();
      } catch (err) {
        reject(
          new Error(`Failed to spawn opencode: ${err instanceof Error ? err.message : String(err)}`)
        );
        return;
      }

      const outputParts: string[] = [];
      const errorOutputParts: string[] = [];
      let stderrBuffer = '';

      const cleanup = () => {
        if (!procKilled && proc && !proc.killed) {
          procKilled = true;
          proc.kill('SIGTERM');
          setTimeout(() => {
            if (proc && !proc.killed) {
              proc.kill('SIGKILL');
            }
          }, 5000);
        }
      };

      process.on('SIGTERM', cleanup);
      process.on('SIGINT', cleanup);

      if (streaming && onChunk) {
        proc.stderr?.on('data', data => {
          stderrBuffer += data.toString();
          const lines = stderrBuffer.split('\n');
          stderrBuffer = lines.pop() || '';

          for (const line of lines) {
            try {
              const event = JSON.parse(line);
              if (event.type === 'text') {
                outputParts.push(event.part?.text || '');
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
          errorOutputParts.push(data.toString());
        });
      }

      proc.stdout?.on('data', data => {
        if (!streaming) {
          outputParts.push(data.toString());
        }
      });

      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Command timed out after ${this.timeout}ms`));
      }, this.timeout);

      proc.on('close', code => {
        clearTimeout(timeoutId);
        process.removeListener('SIGTERM', cleanup);
        process.removeListener('SIGINT', cleanup);

        const output = outputParts.join('');
        const errorOutput = errorOutputParts.join('');

        if (code === 0) {
          if (!streaming) {
            const response = this.parseJsonOutput(output);
            resolve(response);
          } else {
            resolve(output);
          }
        } else if (!procKilled) {
          const sanitizedError = errorOutput.slice(0, 500).replace(/[\x00-\x1F\x7F]/g, '');
          reject(new Error(`opencode exited with code ${code}: ${sanitizedError}`));
        }
      });

      proc.on('error', err => {
        clearTimeout(timeoutId);
        process.removeListener('SIGTERM', cleanup);
        process.removeListener('SIGINT', cleanup);
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

/**
 * Factory function to create the appropriate transport based on configuration.
 * @param config - Transport configuration
 * @returns HttpTransport or CliTransport instance
 */
export function createTransport(config: TransportConfig): HttpTransport | CliTransport {
  if (config.mode === 'cli') {
    return new CliTransport(config.serverUrl, config.timeout);
  }
  return new HttpTransport(config.serverUrl, config.timeout);
}
