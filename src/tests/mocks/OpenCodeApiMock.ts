import { vi } from 'vitest';

export interface MockOpenCodeConfig {
  success?: boolean;
  responseText?: string;
  error?: string;
  delay?: number;
  callCount?: number;
  statusCode?: number;
  responseHeaders?: Record<string, string>;
}

export interface MockOpenCodeCall {
  message: string;
  timestamp: Date;
  serverUrl: string;
  command: string;
  options?: Record<string, unknown>;
}

export interface MockResponse {
  type: string;
  part: {
    text: string;
    metadata?: Record<string, unknown>;
  };
}

export class OpenCodeApiMock {
  private static mockExecSync: ReturnType<typeof vi.fn> | null = null;
  private static calls: MockOpenCodeCall[] = [];
  private static config: MockOpenCodeConfig = {};
  private static callCount: number = 0;
  private static responseSequence: MockResponse[] = [];

  static setup(config: MockOpenCodeConfig = {}): void {
    this.config = { success: true, responseText: 'Mock response', delay: 0, ...config };
    this.calls = [];
    this.callCount = 0;
    this.responseSequence = [];

    this.mockExecSync = vi.fn((command: string, options: Record<string, unknown>) => {
      const messageMatch = command.match(/--format json "(.*)"/);
      const urlMatch = command.match(/--attach (\S+)/);

      this.callCount++;

      this.calls.push({
        message: messageMatch?.[1] ?? '',
        timestamp: new Date(),
        serverUrl: urlMatch?.[1] ?? 'http://localhost:4096',
        command,
        options,
      });

      if (this.config.delay) {
        return new Promise(resolve => setTimeout(resolve, this.config.delay));
      }

      if (!this.config.success) {
        const error = new Error(this.config.error || 'Mock error');
        (error as any).statusCode = this.config.statusCode || 500;
        throw error;
      }

      if (this.responseSequence.length > 0) {
        const response = this.responseSequence.shift();
        if (response) {
          return this.formatResponse(response.part.text);
        }
      }

      return this.formatResponse(this.config.responseText || 'Mock response');
    });
  }

  static setupSequence(responses: MockResponse[]): void {
    this.responseSequence = responses;
  }

  static addResponse(response: MockResponse): void {
    this.responseSequence.push(response);
  }

  static formatResponse(text: string, metadata?: Record<string, unknown>): string {
    return JSON.stringify({
      type: 'text',
      part: { text, ...(metadata && { metadata }) },
    });
  }

  static formatError(error: string, code: number = 500): string {
    return JSON.stringify({
      type: 'error',
      part: { text: error, code },
    });
  }

  static getMock(): ReturnType<typeof vi.fn> | null {
    return this.mockExecSync;
  }

  static getCalls(): MockOpenCodeCall[] {
    return [...this.calls];
  }

  static getLastCall(): MockOpenCodeCall | undefined {
    return this.calls[this.calls.length - 1];
  }

  static getCallCount(): number {
    return this.callCount;
  }

  static clearCalls(): void {
    this.calls = [];
    this.callCount = 0;
    this.responseSequence = [];
  }

  static teardown(): void {
    this.mockExecSync = null;
    this.calls = [];
    this.config = {};
    this.callCount = 0;
    this.responseSequence = [];
  }

  static reset(): void {
    this.clearCalls();
    this.responseSequence = [];
  }
}

export const createOpenCodeMock = (config?: MockOpenCodeConfig) => {
  return {
    setup: (cfg?: MockOpenCodeConfig) => OpenCodeApiMock.setup(cfg || config),
    setupSequence: (responses: MockResponse[]) => OpenCodeApiMock.setupSequence(responses),
    addResponse: (response: MockResponse) => OpenCodeApiMock.addResponse(response),
    formatResponse: (text: string, metadata?: Record<string, unknown>) =>
      OpenCodeApiMock.formatResponse(text, metadata),
    formatError: (error: string, code?: number) => OpenCodeApiMock.formatError(error, code),
    getMock: () => OpenCodeApiMock.getMock(),
    getCalls: () => OpenCodeApiMock.getCalls(),
    getLastCall: () => OpenCodeApiMock.getLastCall(),
    getCallCount: () => OpenCodeApiMock.getCallCount(),
    clearCalls: () => OpenCodeApiMock.clearCalls(),
    teardown: () => OpenCodeApiMock.teardown(),
    reset: () => OpenCodeApiMock.reset(),
  };
};
