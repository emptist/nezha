import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AlertService, getAlertService } from '../services/AlertService.js';

describe('AlertService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create an alert service with default config', () => {
      const service = new AlertService();
      expect(service).toBeDefined();
    });

    it('should accept custom config', () => {
      const service = new AlertService({
        failureThreshold: 5,
        checkIntervalMs: 30000,
      });
      expect(service).toBeDefined();
    });
  });

  describe('trackFailure', () => {
    it('should track failures without creating alert', () => {
      const service = new AlertService();
      service.trackFailure('task-1', 'Error message');
      const alerts = service.getAlerts();
      expect(alerts).toHaveLength(0);
    });

    it('should create alert when threshold is reached', () => {
      const service = new AlertService({ failureThreshold: 3 });

      service.trackFailure('task-1', 'Error 1');
      service.trackFailure('task-1', 'Error 2');
      const alertsBefore = service.getAlerts();

      service.trackFailure('task-1', 'Error 3');
      const alertsAfter = service.getAlerts();

      expect(alertsBefore).toHaveLength(0);
      expect(alertsAfter).toHaveLength(1);
    });

    it('should track failure severity based on count', () => {
      const service = new AlertService({ failureThreshold: 2 });
      service.trackFailure('task-1', 'Error 1');
      service.trackFailure('task-1', 'Error 2');
      const alert = service.getAlerts()[0];
      expect(alert?.severity).toBe('warning');

      const service2 = new AlertService({ failureThreshold: 3 });
      service2.trackFailure('task-2', 'Error 1');
      service2.trackFailure('task-2', 'Error 2');
      service2.trackFailure('task-2', 'Error 3');
      const alert2 = service2.getAlerts()[0];
      expect(alert2?.severity).toBe('warning');
    });

    it('should not duplicate alerts for same task', () => {
      const service = new AlertService({ failureThreshold: 2 });

      service.trackFailure('task-1', 'Error 1');
      service.trackFailure('task-1', 'Error 2');
      const firstCount = service.getAlerts().length;

      service.trackFailure('task-1', 'Error 3');
      const secondCount = service.getAlerts().length;

      expect(firstCount).toBe(1);
      expect(secondCount).toBe(1);
    });

    it('should reset failure window after expiration', () => {
      const service = new AlertService({ failureThreshold: 3, checkIntervalMs: 60000 });

      const now = Date.now();
      vi.setSystemTime(now);

      service.trackFailure('task-1', 'Error 1');
      service.trackFailure('task-1', 'Error 2');
      expect(service.getAlerts()).toHaveLength(0);

      vi.setSystemTime(now + 20 * 60 * 1000);

      service.trackFailure('task-1', 'Error 3');
      expect(service.getAlerts()).toHaveLength(0);
    });
  });

  describe('trackCircuitBreaker', () => {
    it('should create alert when circuit opens', () => {
      const service = new AlertService();
      service.trackCircuitBreaker('payment-service', 'open');

      const alerts = service.getAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.type).toBe('circuit_breaker');
      expect(alerts[0]?.severity).toBe('error');
    });

    it('should not create alert when circuit is closed', () => {
      const service = new AlertService();
      service.trackCircuitBreaker('payment-service', 'closed');

      const alerts = service.getAlerts();
      expect(alerts).toHaveLength(0);
    });

    it('should include service name in metadata', () => {
      const service = new AlertService();
      service.trackCircuitBreaker('payment-service', 'open');

      const alerts = service.getAlerts();
      expect(alerts[0]?.metadata).toEqual({
        service: 'payment-service',
        state: 'open',
      });
    });
  });

  describe('trackDependencyBlocked', () => {
    it('should create alert for blocked task', () => {
      const service = new AlertService();
      service.trackDependencyBlocked('task-1', ['task-2', 'task-3']);

      const alerts = service.getAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('dependency_blocked');
      expect(alerts[0].severity).toBe('warning');
    });

    it('should include blocked dependencies in message', () => {
      const service = new AlertService();
      service.trackDependencyBlocked('task-1', ['task-2', 'task-3']);

      const alerts = service.getAlerts();
      expect(alerts[0].message).toContain('task-2');
      expect(alerts[0].message).toContain('task-3');
    });

    it('should include metadata with blocked tasks', () => {
      const service = new AlertService();
      service.trackDependencyBlocked('task-1', ['task-2', 'task-3']);

      const alerts = service.getAlerts();
      expect(alerts[0].metadata).toEqual({
        taskId: 'task-1',
        blockedBy: ['task-2', 'task-3'],
      });
    });
  });

  describe('getAlerts', () => {
    it('should return unacknowledged alerts by default', () => {
      const service = new AlertService();
      service.trackCircuitBreaker('test-service', 'open');
      const alerts = service.getAlerts();
      expect(alerts).toHaveLength(1);
    });

    it('should return all alerts when includeAcknowledged is true', () => {
      const service = new AlertService();
      service.trackCircuitBreaker('test-service', 'open');
      service.acknowledgeAlert('circuit_breaker_test-service');
      const alertsWithAck = service.getAlerts(true);
      const alertsWithoutAck = service.getAlerts(false);

      expect(alertsWithAck).toHaveLength(1);
      expect(alertsWithoutAck).toHaveLength(0);
    });
  });

  describe('acknowledgeAlert', () => {
    it('should acknowledge existing alert', () => {
      const service = new AlertService();
      service.trackCircuitBreaker('test-service', 'open');
      const acknowledged = service.acknowledgeAlert('circuit_breaker_test-service');

      expect(acknowledged).toBe(true);
      expect(service.getAlerts()).toHaveLength(0);
      expect(service.getAlerts(true)).toHaveLength(1);
    });

    it('should return false for non-existent alert', () => {
      const service = new AlertService();
      const acknowledged = service.acknowledgeAlert('nonexistent');

      expect(acknowledged).toBe(false);
    });
  });

  describe('clearAlert', () => {
    it('should clear existing alert', () => {
      const service = new AlertService();
      service.trackCircuitBreaker('test-service', 'open');
      const cleared = service.clearAlert('circuit_breaker_test-service');

      expect(cleared).toBe(true);
      expect(service.getAlerts(true)).toHaveLength(0);
    });

    it('should return false for non-existent alert', () => {
      const service = new AlertService();
      const cleared = service.clearAlert('nonexistent');

      expect(cleared).toBe(false);
    });
  });

  describe('clearOldAlerts', () => {
    it('should clear acknowledged alerts older than maxAgeMs', () => {
      vi.useRealTimers();
      const service = new AlertService();

      service.trackCircuitBreaker('old-alert', 'open');
      service.acknowledgeAlert('circuit_breaker_old-alert');

      const oldAlert = (service as any).alerts.get('circuit_breaker_old-alert');
      oldAlert.createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000);

      const cleared = service.clearOldAlerts(24 * 60 * 60 * 1000);

      expect(cleared).toBe(1);
      expect(service.getAlerts(true)).toHaveLength(0);
    });

    it('should not clear unacknowledged alerts', () => {
      vi.useRealTimers();
      const service = new AlertService();

      service.trackCircuitBreaker('old-alert', 'open');

      const oldAlert = (service as any).alerts.get('circuit_breaker_old-alert');
      oldAlert.createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000);

      const cleared = service.clearOldAlerts(24 * 60 * 60 * 1000);

      expect(cleared).toBe(0);
      expect(service.getAlerts(true)).toHaveLength(1);
    });

    it('should use default max age of 24 hours', () => {
      vi.useRealTimers();
      const service = new AlertService();

      service.trackCircuitBreaker('old-alert', 'open');
      service.acknowledgeAlert('circuit_breaker_old-alert');

      const oldAlert = (service as any).alerts.get('circuit_breaker_old-alert');
      oldAlert.createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000);

      const cleared = service.clearOldAlerts();

      expect(cleared).toBe(1);
    });
  });

  describe('createAlert (private)', () => {
    it('should set createdAt and acknowledged properties', () => {
      const service = new AlertService();
      service.trackCircuitBreaker('test-service', 'open');

      const alerts = service.getAlerts();
      expect(alerts[0].createdAt).toBeInstanceOf(Date);
      expect(alerts[0].acknowledged).toBe(false);
    });
  });
});

describe('getAlertService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return singleton instance', () => {
    const instance1 = getAlertService();
    const instance2 = getAlertService();

    expect(instance1).toBe(instance2);
  });
});
