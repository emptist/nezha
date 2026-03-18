import { vi } from 'vitest';

export interface MockOpenCodeConfig {
  success?: boolean;
  responseText?: string;
  error?: string;
  delay?: number;
  callCount?: number;
}

export interface MockOpenCodeCall {
  message: string;
  timestamp: Date;
  serverUrl: string;
}

export class OpenCodeApiMock {
  private static mockExecSync: ReturnType<typeof vi.fn> | null = null;
  private static calls: MockOpenCodeCall[] = [];
  private static config: MockOpenCodeConfig = {};

  static setup(config: MockOpenCodeConfig = {}): void {
    this.config = { success: true, responseText: 'Mock response', delay: 0, ...config };
    this.calls = [];
    
    this.mockExecSync = vi.fn((command: string, options: Record<string, unknown>) => {
      const messageMatch = command.match(/--format json "(.*)"/);
      const urlMatch = command.match(/--attach (\S+)/);
      
      this.calls.push({
        message: messageMatch ? messageMatch[1] : '',
        timestamp: new Date(),
        serverUrl: urlMatch ? urlMatch[1] : 'http://localhost:4096',
      });

      if (this.config.delay) {
        return new Promise((resolve) => setTimeout(resolve, this.config.delay));
      }

      if (!this.config.success) {
        throw new Error(this.config.error || 'Mock error');
      }

      return this.formatResponse(this.config.responseText || 'Mock response');
    });
  }

  static formatResponse(text: string): string {
    return JSON.stringify({
      type: 'text',
      part: { text },
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

  static clearCalls(): void {
    this.calls = [];
  }

  static teardown(): void {
    this.mockExecSync = null;
    this.calls = [];
    this.config = {};
  }
}

export const createOpenCodeMock = (config?: MockOpenCodeConfig) => {
  return {
    setup: () => OpenCodeApiMock.setup(config),
    getMock: () => OpenCodeApiMock.getMock(),
    getCalls: () => OpenCodeApiMock.getCalls(),
    getLastCall: () => OpenCodeApiMock.getLastCall(),
    clearCalls: () => OpenCodeApiMock.clearCalls(),
    teardown: () => OpenCodeApiMock.teardown(),
  };
};
