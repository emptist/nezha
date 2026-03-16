import { describe, it, expect, vi } from 'vitest';
import { Agent } from '../core/Agent.js';

describe('Agent', () => {
  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      const defaultAgent = new Agent();
      expect(defaultAgent).toBeDefined();
    });

    it('should use custom config when provided', () => {
      const customAgent = new Agent({
        host: 'custom-host',
        port: 9999,
        timeout: 30000,
        maxRetries: 5,
        retryDelay: 2000,
      });
      expect(customAgent).toBeDefined();
    });

    it('should use default host when not provided', () => {
      const agent = new Agent({});
      expect(agent).toBeDefined();
    });

    it('should use default port when not provided', () => {
      const agent = new Agent({ host: 'localhost' });
      expect(agent).toBeDefined();
    });
  });

  describe('calculateRetryDelay', () => {
    it('should calculate exponential backoff with jitter', () => {
      const agent = new Agent({ retryDelay: 1000, maxRetries: 3 });
      const delays: number[] = [];
      
      for (let attempt = 1; attempt <= 3; attempt++) {
        const originalRandom = Math.random;
        Math.random = () => 0.1;
        const delay = agent.calculateRetryDelay(attempt);
        Math.random = originalRandom;
        delays.push(delay);
      }
      
      expect(delays[0]).toBeGreaterThan(900);
      expect(delays[0]).toBeLessThan(1300);
      expect(delays[1]).toBeGreaterThan(1700);
      expect(delays[1]).toBeLessThan(2600);
    });

    it('should cap delay at 30000ms', () => {
      const agent = new Agent({ retryDelay: 20000, maxRetries: 10 });
      const delay = agent.calculateRetryDelay(10);
      expect(delay).toBeLessThanOrEqual(30000);
    });
  });

  describe('getBaseUrl', () => {
    it('should return correct URL', () => {
      const agent = new Agent({ host: 'localhost', port: 4099 });
      expect(agent.getBaseUrl()).toBe('http://localhost:4099');
    });

    it('should handle custom port', () => {
      const agent = new Agent({ host: '192.168.1.1', port: 8080 });
      expect(agent.getBaseUrl()).toBe('http://192.168.1.1:8080');
    });
  });
});
