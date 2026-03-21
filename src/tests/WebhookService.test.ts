import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhookService, type WebhookConfig } from '../services/WebhookService.js';
import { AlertType, AlertSeverity } from '../services/FailureAlertService.js';

global.fetch = vi.fn();

const mockFetch = vi.mocked(fetch);

describe('WebhookService', () => {
  let service: WebhookService;
  const baseConfig: WebhookConfig = {
    url: 'https://example.com/webhook',
    secret: 'test-secret',
    enabled: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WebhookService(baseConfig);
  });

  describe('constructor', () => {
    it('should create service with config', () => {
      expect(service).toBeDefined();
    });

    it('should use default retry values', () => {
      const serviceWithDefaults = new WebhookService({ url: 'https://example.com' });
      expect(serviceWithDefaults).toBeDefined();
    });
  });

  describe('isEnabled', () => {
    it('should return true when enabled', () => {
      expect(service.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      const disabledService = new WebhookService({ ...baseConfig, enabled: false });
      expect(disabledService.isEnabled()).toBe(false);
    });

    it('should return false when enabled is undefined', () => {
      const undefinedService = new WebhookService({ url: 'https://example.com' });
      expect(undefinedService.isEnabled()).toBe(false);
    });
  });

  describe('sendTaskCompleted', () => {
    it('should send task completed webhook', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true } as Response);

      const result = await service.sendTaskCompleted(
        'task-123',
        'Test Task',
        'Task description',
        'Task result'
      );

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should include correct payload', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true } as Response);

      await service.sendTaskCompleted('task-123', 'Test Task', 'Description', 'Result');

      const fetchCall = mockFetch.mock.calls[0] as [string, Record<string, unknown>];
      const body = JSON.parse(fetchCall[1].body as string);
      expect(body.event).toBe('task:completed');
      expect(body.task.id).toBe('task-123');
      expect(body.task.title).toBe('Test Task');
      expect(body.task.status).toBe('COMPLETED');
    });
  });

  describe('sendTaskFailed', () => {
    it('should send task failed webhook', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true } as Response);

      const result = await service.sendTaskFailed(
        'task-123',
        'Test Task',
        'Description',
        'Error message'
      );

      expect(result).toBe(true);
      const fetchCall = mockFetch.mock.calls[0] as [string, Record<string, unknown>];
      const body = JSON.parse(fetchCall[1].body as string);
      expect(body.event).toBe('task:failed');
      expect(body.task.status).toBe('FAILED');
      expect(body.task.error).toBe('Error message');
    });
  });

  describe('sendAlert', () => {
    it('should send alert webhook', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true } as Response);

      const alert = {
        id: 'alert-123',
        alertType: AlertType.REPEATED_FAILURE,
        title: 'Test Alert',
        severity: AlertSeverity.HIGH,
        errorCategory: 'test',
        errorMessage: 'Some error',
        failureCount: 5,
        threshold: 3,
        acknowledged: false,
        createdAt: new Date(),
      };

      const result = await service.sendAlert(alert);

      expect(result).toBe(true);
      const fetchCall = mockFetch.mock.calls[0] as [string, Record<string, unknown>];
      const body = JSON.parse(fetchCall[1].body as string);
      expect(body.event).toBe('alert:created');
      expect(body.alert.id).toBe('alert-123');
      expect(body.alert.severity).toBe('high');
    });
  });

  describe('error handling', () => {
    it('should return false when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.sendTaskCompleted(
        'task-123',
        'Test Task',
        'Description',
        'Result'
      );

      expect(result).toBe(false);
    });

    it('should return false when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 } as Response);

      const result = await service.sendTaskCompleted(
        'task-123',
        'Test Task',
        'Description',
        'Result'
      );

      expect(result).toBe(false);
    });

    it('should return false when service is disabled', async () => {
      const disabledService = new WebhookService({ ...baseConfig, enabled: false });

      const result = await disabledService.sendTaskCompleted(
        'task-123',
        'Test Task',
        'Description',
        'Result'
      );

      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return false when URL is empty', async () => {
      const noUrlService = new WebhookService({ url: '', enabled: true });

      const result = await noUrlService.sendTaskCompleted(
        'task-123',
        'Test Task',
        'Description',
        'Result'
      );

      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('retry behavior', () => {
    it('should retry on failure', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
        .mockResolvedValueOnce({ ok: true } as Response);

      const result = await service.sendTaskCompleted(
        'task-123',
        'Test Task',
        'Description',
        'Result'
      );

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should return false after max retries', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 } as Response);

      const result = await service.sendTaskCompleted(
        'task-123',
        'Test Task',
        'Description',
        'Result'
      );

      expect(result).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });
});
