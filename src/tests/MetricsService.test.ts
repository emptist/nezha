import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetricsService, Counter, Gauge, Histogram, type TransportHealth, type AgentHealth } from '../services/MetricsService.js';
import { logger } from '../utils/logger.js';

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MetricsService();
  });

  describe('constructor', () => {
    it('should create MetricsService instance', () => {
      expect(service).toBeDefined();
    });
  });

  describe('Counter', () => {
    it('should increment counter value', () => {
      const metrics = new Map();
      const counter = new Counter(metrics, 'test_counter');
      metrics.set('test_counter', { name: 'test_counter', type: 'counter' as const, help: '', value: 0, labels: {} });

      counter.inc();
      expect(counter.value).toBe(1);

      counter.inc(5);
      expect(counter.value).toBe(6);
    });

    it('should return 0 for non-existent metric', () => {
      const metrics = new Map();
      const counter = new Counter(metrics, 'missing');

      expect(counter.value).toBe(0);
    });

    it('should not increment if metric not found', () => {
      const metrics = new Map();
      const counter = new Counter(metrics, 'missing');

      counter.inc();
      expect(counter.value).toBe(0);
    });
  });

  describe('Gauge', () => {
    it('should increment gauge value', () => {
      const metrics = new Map();
      const gauge = new Gauge(metrics, 'test_gauge');
      metrics.set('test_gauge', { name: 'test_gauge', type: 'gauge' as const, help: '', value: 0, labels: {} });

      gauge.inc();
      expect(gauge.value).toBe(1);

      gauge.inc(3);
      expect(gauge.value).toBe(4);
    });

    it('should decrement gauge value', () => {
      const metrics = new Map();
      const gauge = new Gauge(metrics, 'test_gauge');
      metrics.set('test_gauge', { name: 'test_gauge', type: 'gauge' as const, help: '', value: 10, labels: {} });

      gauge.dec();
      expect(gauge.value).toBe(9);

      gauge.dec(4);
      expect(gauge.value).toBe(5);
    });

    it('should set gauge value', () => {
      const metrics = new Map();
      const gauge = new Gauge(metrics, 'test_gauge');
      metrics.set('test_gauge', { name: 'test_gauge', type: 'gauge' as const, help: '', value: 0, labels: {} });

      gauge.set(42);
      expect(gauge.value).toBe(42);
    });

    it('should return 0 for non-existent metric', () => {
      const metrics = new Map();
      const gauge = new Gauge(metrics, 'missing');

      expect(gauge.value).toBe(0);
    });
  });

  describe('Histogram', () => {
    it('should observe values', () => {
      const metrics = new Map();
      const histogram = new Histogram(metrics, 'test_histogram');
      metrics.set('test_histogram', {
        name: 'test_histogram',
        type: 'histogram' as const,
        help: '',
        value: 0,
        labels: {},
        buckets: [
          { le: 0.1, count: 0 },
          { le: 0.5, count: 0 },
          { le: 1, count: 0 },
          { le: 5, count: 0 },
        ],
        sum: 0,
        count: 0,
      });

      histogram.observe(0.3);
      expect(histogram.get().sum).toBe(0.3);
      expect(histogram.get().count).toBe(1);
    });

    it('should update correct buckets', () => {
      const metrics = new Map();
      const histogram = new Histogram(metrics, 'test_histogram');
      metrics.set('test_histogram', {
        name: 'test_histogram',
        type: 'histogram' as const,
        help: '',
        value: 0,
        labels: {},
        buckets: [
          { le: 0.1, count: 0 },
          { le: 0.5, count: 0 },
          { le: 1, count: 0 },
        ],
        sum: 0,
        count: 0,
      });

      histogram.observe(0.05);
      expect(histogram.get().buckets[0].count).toBe(1);
      expect(histogram.get().buckets[1].count).toBe(1);
      expect(histogram.get().buckets[2].count).toBe(1);
    });

    it('should return default values for non-existent metric', () => {
      const metrics = new Map();
      const histogram = new Histogram(metrics, 'missing');

      const result = histogram.get();
      expect(result.count).toBe(0);
      expect(result.sum).toBe(0);
    });
  });

  describe('recordTaskExecution', () => {
    it('should record task execution metrics', () => {
      service.recordTaskExecution(100, { totalTokens: 500 });
      expect(logger.info).toHaveBeenCalled();
    });

    it('should record execution without token usage', () => {
      service.recordTaskExecution(50);
      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe('recordConnectionStatus', () => {
    it('should record HTTP transport status', () => {
      service.recordConnectionStatus('http', true, 25);
      expect(logger.info).toHaveBeenCalled();
    });

    it('should record CLI transport status', () => {
      service.recordConnectionStatus('cli', true);
      expect(logger.info).toHaveBeenCalled();
    });

    it('should record failed transport', () => {
      service.recordConnectionStatus('http', false, undefined, 'Connection refused');
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('recordApiCall', () => {
    it('should record successful API call', () => {
      service.recordApiCall('/api/tasks', 200, 50);
      expect(logger.info).toHaveBeenCalled();
    });

    it('should record failed API call', () => {
      service.recordApiCall('/api/tasks', 500, 100);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should record 4xx as failure', () => {
      service.recordApiCall('/api/tasks', 404, 30);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('getTransportHealth', () => {
    it('should return HTTP transport health status', () => {
      service.recordConnectionStatus('http', true, 25);
      const health = service.getTransportHealth();
      expect(health.mode).toBe('http');
      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBe(25);
    });

    it('should return unhealthy when last check failed', () => {
      service.recordConnectionStatus('http', false, undefined, 'Error');
      const health = service.getTransportHealth();
      expect(health.healthy).toBe(false);
      expect(health.error).toBe('Error');
    });

    it('should report CLI transport healthy', () => {
      service.recordConnectionStatus('cli', true);
      const health = service.getTransportHealth();
      expect(health.mode).toBe('cli');
      expect(health.healthy).toBe(true);
    });
  });

  describe('getAgentHealth', () => {
    it('should return agent health status', () => {
      service.recordConnectionStatus('http', true, 25);
      const health = service.getAgentHealth();
      expect(health.healthy).toBe(true);
      expect(health.serverConnectivity).toBe(true);
      expect(health.transports).toHaveLength(1);
    });

    it('should include timestamp in health response', () => {
      const health = service.getAgentHealth();
      expect(health.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('getMetricsSummary', () => {
    it('should return metrics summary with defaults', () => {
      const summary = service.getMetricsSummary();
      expect(summary.tasksExecuted).toBe(0);
      expect(summary.totalTokenUsage).toBe(0);
      expect(summary.activeConnections).toBe(0);
      expect(summary.serverHealthy).toBe(true);
    });

    it('should return correct task count', () => {
      service.recordTaskExecution(100);
      service.recordTaskExecution(50);
      const summary = service.getMetricsSummary();
      expect(summary.tasksExecuted).toBe(2);
    });

    it('should return correct token usage', () => {
      service.recordTaskExecution(100, { totalTokens: 500 });
      service.recordTaskExecution(50, { totalTokens: 300 });
      const summary = service.getMetricsSummary();
      expect(summary.totalTokenUsage).toBe(800);
    });

    it('should report unhealthy when server down', () => {
      service.recordConnectionStatus('http', false, undefined, 'Down');
      const summary = service.getMetricsSummary();
      expect(summary.serverHealthy).toBe(false);
    });
  });

  describe('incrementActiveConnections', () => {
    it('should increment active connections', () => {
      service.incrementActiveConnections();
      const summary = service.getMetricsSummary();
      expect(summary.activeConnections).toBe(1);
    });
  });

  describe('decrementActiveConnections', () => {
    it('should decrement active connections', () => {
      service.incrementActiveConnections();
      service.incrementActiveConnections();
      service.decrementActiveConnections();
      const summary = service.getMetricsSummary();
      expect(summary.activeConnections).toBe(1);
    });

    it('should not go below zero', () => {
      service.decrementActiveConnections();
      const summary = service.getMetricsSummary();
      expect(summary.activeConnections).toBe(0);
    });
  });

  describe('getRecentExecutions', () => {
    it('should return recent executions', () => {
      service.recordTaskExecution(100, { totalTokens: 100 });
      service.recordTaskExecution(200, { totalTokens: 200 });
      const recent = service.getRecentExecutions(10);
      expect(recent).toHaveLength(2);
    });

    it('should limit to specified count', () => {
      for (let i = 0; i < 20; i++) {
        service.recordTaskExecution(i * 10);
      }
      const recent = service.getRecentExecutions(5);
      expect(recent).toHaveLength(5);
    });

    it('should include duration and tokens in each execution', () => {
      service.recordTaskExecution(150, { totalTokens: 300 });
      const recent = service.getRecentExecutions(1);
      expect(recent[0]).toHaveProperty('durationMs', 150);
      expect(recent[0]).toHaveProperty('tokens', 300);
    });
  });

  describe('reset', () => {
    it('should reset all metrics', () => {
      service.recordTaskExecution(100);
      service.incrementActiveConnections();
      service.reset();

      const summary = service.getMetricsSummary();
      expect(summary.tasksExecuted).toBe(0);
      expect(summary.activeConnections).toBe(0);
    });

    it('should reset recent executions', () => {
      service.recordTaskExecution(100);
      service.reset();
      const recent = service.getRecentExecutions(10);
      expect(recent).toHaveLength(0);
    });
  });
});
