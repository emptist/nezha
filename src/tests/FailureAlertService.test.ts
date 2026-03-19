import { describe, it, expect, beforeEach, vi } from 'vitest';
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
        rows: [{
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
        }],
        rowCount: 1,
      });

      const alert = await service.createAlert(AlertType.REPEATED_FAILURE, 'Repeated failure: Test Task', {
        taskId: 'task-1',
        errorCategory: 'NETWORK',
        errorMessage: 'Connection failed',
        failureCount: 3,
        threshold: 3,
      });

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
        rows: [{
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
        }],
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
      expect(alerts[0].alertType).toBe(AlertType.REPEATED_FAILURE);
      expect(alerts[1].alertType).toBe(AlertType.STUCK_TASK);
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
});
