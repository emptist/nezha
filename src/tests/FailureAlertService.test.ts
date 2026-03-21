import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FailureAlertService, AlertType, AlertSeverity } from '../services/FailureAlertService.js';

const mockQuery = vi.fn();
const mockDb = {
  query: mockQuery,
} as any;

describe('FailureAlertService', () => {
  let service: FailureAlertService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FailureAlertService(mockDb, {
      checkIntervalMs: 60000,
      repeatedFailureThreshold: 3,
      consecutiveFailureThreshold: 5,
      dlqSizeThreshold: 10,
      enableWebhooks: false,
    });
  });

  afterEach(() => {
    service.stop();
  });

  describe('start/stop', () => {
    it('should start and stop the service', () => {
      service.start();
      expect(service['isRunning']).toBe(true);

      service.stop();
      expect(service['isRunning']).toBe(false);
    });
  });

  describe('createAlert', () => {
    it('should create an alert for repeated failure', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            id: 'alert-1',
            alert_type: 'repeated_failure',
            task_id: 'task-1',
            title: 'Test Task',
            error_category: 'NETWORK',
            error_message: 'Connection failed',
            failure_count: 3,
            threshold: 3,
            acknowledged: false,
            created_at: new Date(),
          },
        ],
        rowCount: 1,
      });

      const alert = await service.createAlert(
        AlertType.REPEATED_FAILURE,
        'Repeated failure: Test Task',
        {
          taskId: 'task-1',
          errorCategory: 'NETWORK',
          errorMessage: 'Connection failed',
          failureCount: 3,
          threshold: 3,
        }
      );

      expect(alert).toBeTruthy();
      expect(alert?.alertType).toBe(AlertType.REPEATED_FAILURE);
      expect(alert?.title).toBe('Test Task');
    });

    it('should respect cooldown period', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await service.createAlert(AlertType.REPEATED_FAILURE, 'Alert 1', {
        taskId: 'task-1',
        failureCount: 3,
      });

      const alert2 = await service.createAlert(AlertType.REPEATED_FAILURE, 'Alert 2', {
        taskId: 'task-1',
        failureCount: 3,
      });

      expect(alert2).toBeNull();
    });

    it('should calculate correct severity', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            id: 'alert-1',
            alert_type: 'consecutive_failures',
            task_id: 'task-1',
            title: 'Critical Task',
            error_category: null,
            error_message: null,
            failure_count: 10,
            threshold: 5,
            acknowledged: false,
            created_at: new Date(),
          },
        ],
        rowCount: 1,
      });

      const alert = await service.createAlert(AlertType.CONSECUTIVE_FAILURES, 'Critical Task', {
        taskId: 'task-1',
        failureCount: 10,
        threshold: 5,
      });

      expect(alert?.severity).toBe(AlertSeverity.CRITICAL);
    });
  });

  describe('categorizeAndRecordFailure', () => {
    it('should categorize network errors', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const category = await service.categorizeAndRecordFailure(
        'task-1',
        'Test Task',
        new Error('Connection refused: ECONNREFUSED'),
        1
      );

      expect(category).toBe('NETWORK');
    });

    it('should categorize timeout errors', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const category = await service.categorizeAndRecordFailure(
        'task-2',
        'Timeout Task',
        new Error('Request timed out after 30000ms'),
        2
      );

      expect(category).toBe('TIMEOUT');
    });

    it('should categorize auth errors', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const category = await service.categorizeAndRecordFailure(
        'task-3',
        'Auth Task',
        new Error('401 Unauthorized'),
        1
      );

      expect(category).toBe('AUTH');
    });

    it('should categorize server errors', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const category = await service.categorizeAndRecordFailure(
        'task-4',
        'Server Task',
        new Error('500 Internal Server Error'),
        1
      );

      expect(category).toBe('SERVER');
    });
  });

  describe('acknowledgeAlert', () => {
    it('should acknowledge an alert', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await service.acknowledgeAlert('alert-1', 'admin');
      expect(result).toBe(true);
    });

    it('should return false for non-existent alert', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const result = await service.acknowledgeAlert('non-existent', 'admin');
      expect(result).toBe(false);
    });
  });

  describe('getUnacknowledgedAlerts', () => {
    it('should return unacknowledged alerts', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            id: 'alert-1',
            alert_type: 'repeated_failure',
            task_id: 'task-1',
            original_task_id: null,
            title: 'Alert 1',
            error_category: 'NETWORK',
            error_message: 'Error 1',
            failure_count: 3,
            threshold: 3,
            acknowledged: false,
            acknowledged_by: null,
            acknowledged_at: null,
            created_at: new Date(),
          },
          {
            id: 'alert-2',
            alert_type: 'stuck_task',
            task_id: 'task-2',
            original_task_id: null,
            title: 'Alert 2',
            error_category: null,
            error_message: 'Task stuck',
            failure_count: 1,
            threshold: 1,
            acknowledged: false,
            acknowledged_by: null,
            acknowledged_at: null,
            created_at: new Date(),
          },
        ],
        rowCount: 2,
      });

      const alerts = await service.getUnacknowledgedAlerts();

      expect(alerts).toHaveLength(2);
      expect(alerts[0]!.alertType).toBe(AlertType.REPEATED_FAILURE);
      expect(alerts[1]!.alertType).toBe(AlertType.STUCK_TASK);
    });
  });

  describe('updateRule', () => {
    it('should update alert rule settings', () => {
      service.updateRule(AlertType.REPEATED_FAILURE, {
        threshold: 5,
        enabled: false,
      });

      const rule = service.getRule(AlertType.REPEATED_FAILURE);
      expect(rule?.threshold).toBe(5);
      expect(rule?.enabled).toBe(false);
    });
  });

  describe('setWebhookCallback', () => {
    it('should set webhook callback', () => {
      const callback = vi.fn().mockResolvedValue(undefined);
      service.setWebhookCallback(callback);
      expect(service['webhookCallback']).toBe(callback);
    });
  });

  describe('checkForAlerts', () => {
    beforeEach(() => {
      service.start();
    });

    afterEach(() => {
      service.stop();
    });

    it('should not run if service is not running', async () => {
      service.stop();
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await service.checkForAlerts();

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should check for repeated failures', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await service.checkForAlerts();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('consecutive_failures'),
        expect.any(Array)
      );
    });

    it('should check for stuck tasks', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await service.checkForAlerts();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_stuck'),
        expect.any(Array)
      );
    });

    it('should check DLQ size', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: '5' }], rowCount: 1 });

      await service.checkForAlerts();

      const dlqCall = mockQuery.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('dead_letter_queue')
      );
      expect(dlqCall).toBeDefined();
    });

    it('should check for consecutive failures', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await service.checkForAlerts();

      expect(mockQuery).toHaveBeenCalled();
    });

    it('should auto-acknowledge old alerts', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await service.checkForAlerts();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('auto-acknowledge'),
        expect.anything()
      );
    });

    it('should skip auto-acknowledge when autoAcknowledgeAfterMs is 0', async () => {
      const serviceNoAutoAck = new FailureAlertService(mockDb, {
        autoAcknowledgeAfterMs: 0,
        enableWebhooks: false,
      });
      serviceNoAutoAck.start();
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await serviceNoAutoAck.checkForAlerts();

      expect(mockQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('auto-acknowledge'),
        expect.anything()
      );
      serviceNoAutoAck.stop();
    });
  });

  describe('getAlertStats', () => {
    it('should return alert statistics', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '100' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '25' }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            { alert_type: 'repeated_failure', count: '10' },
            { alert_type: 'stuck_task', count: '5' },
          ],
          rowCount: 2,
        })
        .mockResolvedValueOnce({
          rows: [
            { severity: 'critical', count: '3' },
            { severity: 'high', count: '10' },
          ],
          rowCount: 2,
        });

      const stats = await service.getAlertStats();

      expect(stats.total).toBe(100);
      expect(stats.unacknowledged).toBe(25);
      expect(stats.byType).toHaveProperty('repeated_failure', 10);
      expect(stats.byType).toHaveProperty('stuck_task', 5);
      expect(stats.bySeverity).toHaveProperty('critical', 3);
      expect(stats.bySeverity).toHaveProperty('high', 10);
    });

    it('should handle empty stats', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const stats = await service.getAlertStats();

      expect(stats.total).toBe(0);
      expect(stats.unacknowledged).toBe(0);
      expect(Object.keys(stats.byType).length).toBe(0);
      expect(Object.keys(stats.bySeverity).length).toBe(0);
    });
  });

  describe('createAlert edge cases', () => {
    it('should return null when rule is disabled', async () => {
      service.updateRule(AlertType.REPEATED_FAILURE, { enabled: false });

      const alert = await service.createAlert(AlertType.REPEATED_FAILURE, 'Test alert');

      expect(alert).toBeNull();
    });

    it('should return null when rule does not exist', async () => {
      const alert = await service.createAlert('nonexistent' as AlertType, 'Test alert');

      expect(alert).toBeNull();
    });

    it('should return null when insert returns no rows', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const alert = await service.createAlert(AlertType.REPEATED_FAILURE, 'Test alert');

      expect(alert).toBeNull();
    });

    it('should handle database errors gracefully', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const alert = await service.createAlert(AlertType.REPEATED_FAILURE, 'Test alert');

      expect(alert).toBeNull();
    });

    it('should create alert with originalTaskId', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            id: 'alert-1',
            alert_type: 'stuck_task',
            task_id: null,
            original_task_id: 'original-1',
            title: 'Test',
            error_category: null,
            error_message: null,
            failure_count: 1,
            threshold: 1,
            acknowledged: false,
            created_at: new Date(),
          },
        ],
        rowCount: 1,
      });

      const alert = await service.createAlert(AlertType.STUCK_TASK, 'Task stuck', {
        originalTaskId: 'original-1',
      });

      expect(alert).toBeTruthy();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO failure_alerts'),
        expect.arrayContaining(['stuck_task', null, 'original-1', 'Task stuck'])
      );
    });
  });

  describe('calculateSeverity', () => {
    it('should return CRITICAL for consecutive failures ratio >= 2', () => {
      const severity = service['calculateSeverity'](AlertType.CONSECUTIVE_FAILURES, 10, 5);
      expect(severity).toBe(AlertSeverity.CRITICAL);
    });

    it('should return HIGH for consecutive failures ratio >= 1.5', () => {
      const severity = service['calculateSeverity'](AlertType.CONSECUTIVE_FAILURES, 8, 5);
      expect(severity).toBe(AlertSeverity.HIGH);
    });

    it('should return MEDIUM for consecutive failures ratio >= 1', () => {
      const severity = service['calculateSeverity'](AlertType.CONSECUTIVE_FAILURES, 5, 5);
      expect(severity).toBe(AlertSeverity.MEDIUM);
    });

    it('should return HIGH for stuck task', () => {
      const severity = service['calculateSeverity'](AlertType.STUCK_TASK, 1, 1);
      expect(severity).toBe(AlertSeverity.HIGH);
    });

    it('should return CRITICAL for DLQ threshold ratio >= 2', () => {
      const severity = service['calculateSeverity'](AlertType.DLQ_THRESHOLD, 20, 10);
      expect(severity).toBe(AlertSeverity.CRITICAL);
    });

    it('should return HIGH for DLQ threshold ratio >= 1', () => {
      const severity = service['calculateSeverity'](AlertType.DLQ_THRESHOLD, 10, 10);
      expect(severity).toBe(AlertSeverity.HIGH);
    });

    it('should return HIGH for default alert type ratio >= 2', () => {
      const severity = service['calculateSeverity'](AlertType.REPEATED_FAILURE, 6, 3);
      expect(severity).toBe(AlertSeverity.HIGH);
    });

    it('should return MEDIUM for default alert type ratio >= 1', () => {
      const severity = service['calculateSeverity'](AlertType.REPEATED_FAILURE, 3, 3);
      expect(severity).toBe(AlertSeverity.MEDIUM);
    });

    it('should return LOW for default alert type ratio < 1', () => {
      const severity = service['calculateSeverity'](AlertType.REPEATED_FAILURE, 1, 3);
      expect(severity).toBe(AlertSeverity.LOW);
    });
  });

  describe('stop', () => {
    it('should not throw when already stopped', () => {
      service.stop();
      expect(() => service.stop()).not.toThrow();
    });

    it('should clear the timer', () => {
      service.start();
      expect(service['timer']).not.toBeNull();

      service.stop();
      expect(service['timer']).toBeNull();
    });
  });

  describe('start', () => {
    it('should warn when already running', () => {
      service.start();
      expect(service['isRunning']).toBe(true);

      service.start();
      expect(service['isRunning']).toBe(true);
    });
  });

  describe('event emission', () => {
    it('should emit alert event when alert is created', async () => {
      const alertHandler = vi.fn();
      service.on('alert', alertHandler);

      mockQuery.mockResolvedValue({
        rows: [
          {
            id: 'alert-1',
            alert_type: 'repeated_failure',
            task_id: 'task-1',
            title: 'Test',
            error_category: null,
            error_message: null,
            failure_count: 3,
            threshold: 3,
            acknowledged: false,
            created_at: new Date(),
          },
        ],
        rowCount: 1,
      });

      await service.createAlert(AlertType.REPEATED_FAILURE, 'Test alert');

      expect(alertHandler).toHaveBeenCalled();
    });
  });
});
