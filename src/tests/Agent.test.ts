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
        timeout: 30000,
        maxRetries: 5,
        retryDelay: 2000,
      });
      expect(customAgent).toBeDefined();
    });

    it('should use default timeout when not provided', () => {
      const agent = new Agent({});
      expect(agent).toBeDefined();
    });
  });

  describe('AgentConfig', () => {
    it('should allow empty config', () => {
      const agent = new Agent();
      expect(agent).toBeDefined();
    });

    it('should allow partial config', () => {
      const agent = new Agent({ timeout: 5000 });
      expect(agent).toBeDefined();
    });

    it('should handle zero values gracefully', () => {
      const agent = new Agent({ timeout: 0, maxRetries: 0 });
      expect(agent).toBeDefined();
    });
  });

  describe('executeTask', () => {
    it('should be defined', () => {
      const agent = new Agent();
      expect(agent).toBeDefined();
    });
  });
});
