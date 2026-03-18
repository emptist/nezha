import { describe, it, expect, beforeEach } from 'vitest';
import {
  EnhancedCircuitBreaker,
  CircuitOpenError,
  ResilientCircuitBreaker,
} from '../utils/EnhancedCircuitBreaker.js';

describe('EnhancedCircuitBreaker', () => {
  let circuitBreaker: EnhancedCircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new EnhancedCircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      halfOpenAttempts: 2,
    });
  });

  describe('initial state', () => {
    it('should start in closed state', () => {
      expect(circuitBreaker.getState().state).toBe('closed');
    });

    it('should be available initially', () => {
      expect(circuitBreaker.isAvailable()).toBe(true);
    });
  });

  describe('execute', () => {
    it('should return result on success', async () => {
      const result = await circuitBreaker.execute(() => Promise.resolve('success'));
      expect(result).toBe('success');
    });

    it('should propagate errors', async () => {
      await expect(
        circuitBreaker.execute(() => Promise.reject(new Error('test error')))
      ).rejects.toThrow('test error');
    });
  });

  describe('circuit opening', () => {
    it('should open after failure threshold', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(() => Promise.reject(new Error('fail')));
        } catch {}
      }

      expect(circuitBreaker.getState().state).toBe('open');
    });

    it('should reject requests when open', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(() => Promise.reject(new Error('fail')));
        } catch {}
      }

      await expect(circuitBreaker.execute(() => Promise.resolve('success'))).rejects.toThrow(
        CircuitOpenError
      );
    });

    it('should transition to half-open after timeout', async () => {
      const cb = new EnhancedCircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 50,
      });

      try {
        await cb.execute(() => Promise.reject(new Error('fail')));
      } catch {}

      expect(cb.getState().state).toBe('open');

      await new Promise(resolve => setTimeout(resolve, 100));
      expect(cb.isAvailable()).toBe(true);
    });
  });

  describe('recovery', () => {
    it('should close after successful request in half-open state', async () => {
      const cb = new EnhancedCircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 50,
        halfOpenAttempts: 1,
      });

      try {
        await cb.execute(() => Promise.reject(new Error('fail')));
      } catch {}

      expect(cb.getState().state).toBe('open');

      await new Promise(resolve => setTimeout(resolve, 100));

      const result = await cb.execute(() => Promise.resolve('recovered'));
      expect(result).toBe('recovered');
      expect(cb.getState().state).toBe('closed');
    });
  });

  describe('reset', () => {
    it('should reset circuit breaker state', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(() => Promise.reject(new Error('fail')));
        } catch {}
      }

      circuitBreaker.reset();

      expect(circuitBreaker.getState().state).toBe('closed');
      expect(circuitBreaker.getState().failureCount).toBe(0);
      expect(circuitBreaker.isAvailable()).toBe(true);
    });
  });

  describe('force operations', () => {
    it('should force open circuit', () => {
      circuitBreaker.forceOpen();
      expect(circuitBreaker.getState().state).toBe('open');
    });

    it('should force closed circuit', () => {
      circuitBreaker.forceOpen();
      circuitBreaker.forceClosed();
      expect(circuitBreaker.getState().state).toBe('closed');
    });
  });

  describe('state change callbacks', () => {
    it('should call onStateChange callback', async () => {
      let stateChanges: [string, string][] = [];
      const cb = new EnhancedCircuitBreaker({
        failureThreshold: 1,
        onStateChange: (from: string, to: string) => stateChanges.push([from, to]),
      });

      try {
        await cb.execute(() => Promise.reject(new Error('fail')));
      } catch {}

      expect(stateChanges.length).toBeGreaterThan(0);
      expect(stateChanges[0]).toEqual(['closed', 'open']);
    });

    it('should call onFailure callback', async () => {
      let failures: number[] = [];
      const cb = new EnhancedCircuitBreaker({
        failureThreshold: 3,
        onFailure: (_: Error, count: number) => failures.push(count),
      });

      for (let i = 0; i < 2; i++) {
        try {
          await cb.execute(() => Promise.reject(new Error('fail')));
        } catch {}
      }

      expect(failures).toEqual([1, 2]);
    });
  });

  describe('getAvailabilityPercentage', () => {
    it('should calculate availability correctly', async () => {
      const cb = new EnhancedCircuitBreaker({
        failureThreshold: 10,
      });

      await cb.execute(() => Promise.resolve('success'));
      await cb.execute(() => Promise.resolve('success'));
      try {
        await cb.execute(() => Promise.reject(new Error('fail')));
      } catch {}

      expect(cb.getAvailabilityPercentage()).toBe(67);
    });
  });
});

describe('CircuitOpenError', () => {
  it('should include retry information', () => {
    const error = new CircuitOpenError('Circuit is open', 5000);
    expect(error.retryAfterMs).toBe(5000);
    expect(error.name).toBe('CircuitOpenError');
  });
});

describe('ResilientCircuitBreaker', () => {
  it('should execute fallback when circuit is open', async () => {
    const cb = new ResilientCircuitBreaker({
      failureThreshold: 1,
      fallbackFn: () => Promise.resolve('fallback result'),
    });

    try {
      await cb.execute(() => Promise.reject(new Error('fail')));
    } catch {}

    const result = await cb.executeWithFallback(
      () => Promise.resolve('primary'),
      () => Promise.resolve('fallback')
    );

    expect(result).toBe('fallback');
  });
});
