import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ErrorClassifier,
  categorizeError,
  isRetryableError,
  formatErrorMessage,
  ErrorCategory,
} from '../utils/ErrorClassifier.js';

describe('ErrorClassifier', () => {
  describe('categorize', () => {
    it('should categorize network errors', () => {
      const error = new Error('ECONNREFUSED: Connection refused');
      const result = categorizeError(error);
      expect(result.category).toBe(ErrorCategory.NETWORK);
      expect(result.retryable).toBe(true);
    });

    it('should categorize timeout errors', () => {
      const error = new Error('Request timed out after 30000ms');
      const result = categorizeError(error);
      expect(result.category).toBe(ErrorCategory.TIMEOUT);
      expect(result.retryable).toBe(true);
    });

    it('should categorize authentication errors', () => {
      const error = new Error('401 Unauthorized: Invalid API key');
      const result = categorizeError(error);
      expect(result.category).toBe(ErrorCategory.AUTH);
      expect(result.retryable).toBe(false);
    });

    it('should categorize server errors', () => {
      const error = new Error('500 Internal Server Error');
      const result = categorizeError(error);
      expect(result.category).toBe(ErrorCategory.SERVER);
      expect(result.retryable).toBe(true);
    });

    it('should categorize transport errors', () => {
      const error = new Error('Failed to spawn opencode: ENOENT');
      const result = categorizeError(error);
      expect(result.category).toBe(ErrorCategory.TRANSPORT);
      expect(result.retryable).toBe(true);
    });

    it('should provide troubleshooting hints', () => {
      const error = new Error('ECONNREFUSED');
      const result = categorizeError(error);
      expect(result.troubleshooting).toBeDefined();
      expect(result.troubleshooting!.length).toBeGreaterThan(0);
    });
  });

  describe('isRetryableError', () => {
    it('should return true for network errors', () => {
      const error = new Error('Network error');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for auth errors', () => {
      const error = new Error('401 Unauthorized');
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return true for unknown errors by default', () => {
      const error = new Error('Something went wrong');
      expect(isRetryableError(error)).toBe(true);
    });
  });

  describe('formatErrorMessage', () => {
    it('should include troubleshooting hints', () => {
      const error = new Error('ECONNREFUSED');
      const categorized = categorizeError(error);
      const formatted = formatErrorMessage(categorized);

      expect(formatted).toContain('NETWORK');
      expect(formatted).toContain('Troubleshooting');
      expect(formatted).toContain('Check your network connection');
    });
  });

  describe('custom patterns', () => {
    it('should support custom classification patterns', () => {
      const classifier = new ErrorClassifier({
        networkPatterns: [/my-custom-network-error/i],
      });

      const error = new Error('my-custom-network-error occurred');
      const result = classifier.categorize(error);
      expect(result.category).toBe(ErrorCategory.NETWORK);
    });
  });
});
