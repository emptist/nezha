import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  Counter, Gauge, Histogram, MetricsRegistry, getMetricsRegistry,
  createStandardMetrics, createAgentMetrics, registerHealthCheck,
  unregisterHealthCheck, runHealthChecks, getAllHealthChecks
} from '../services/MetricsService.js';
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
  beforeEach(() => {
    vi.clearAllMocks();
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

  describe('MetricsRegistry', () => {
    it('should create a new registry', () => {
      const registry = new MetricsRegistry();
      expect(registry).toBeDefined();
    });

    it('should get singleton registry', () => {
      const registry = getMetricsRegistry();
      expect(registry).toBeDefined();
    });

    it('should create counter via registry', () => {
      const registry = new MetricsRegistry();
      const counter = registry.createCounter('test', 'A test counter');
      expect(counter).toBeDefined();
    });

    it('should create gauge via registry', () => {
      const registry = new MetricsRegistry();
      const gauge = registry.createGauge('test_gauge', 'A test gauge');
      expect(gauge).toBeDefined();
    });

    it('should create histogram via registry', () => {
      const registry = new MetricsRegistry();
      const histogram = registry.createHistogram('test_hist', 'A test histogram');
      expect(histogram).toBeDefined();
    });

    it('should increment counter', () => {
      const registry = new MetricsRegistry();
      const counter = registry.createCounter('inc_test', 'Increment test');
      counter.inc();
      expect(counter.value).toBe(1);
    });

    it('should set gauge value', () => {
      const registry = new MetricsRegistry();
      const gauge = registry.createGauge('set_test', 'Set test');
      gauge.set(10);
      expect(gauge.value).toBe(10);
    });

    it('should observe histogram', () => {
      const registry = new MetricsRegistry();
      const histogram = registry.createHistogram('obs_test', 'Observe test');
      histogram.observe(0.5);
      expect(histogram.get().count).toBe(1);
    });

    it('should list all metrics', () => {
      const registry = new MetricsRegistry();
      registry.createCounter('c1', 'Counter 1');
      registry.createGauge('g1', 'Gauge 1');
      registry.createHistogram('h1', 'Histogram 1');

      const list = registry.listMetrics();
      expect(list.length).toBe(3);
    });

    it('should get metrics by name', () => {
      const registry = new MetricsRegistry();
      registry.createCounter('named_counter', 'Named counter');

      const metric = registry.getMetric('named_counter');
      expect(metric).toBeDefined();
      expect(metric?.name).toBe('named_counter');
    });

    it('should return undefined for missing metric', () => {
      const registry = new MetricsRegistry();
      const metric = registry.getMetric('nonexistent');
      expect(metric).toBeUndefined();
    });

    it('should clear all metrics', () => {
      const registry = new MetricsRegistry();
      registry.createCounter('to_clear', 'Will be cleared');
      registry.clear();
      expect(registry.listMetrics().length).toBe(0);
    });
  });

  describe('createStandardMetrics', () => {
    it('should create standard metrics object', () => {
      const metrics = createStandardMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.tasksExecuted).toBeDefined();
      expect(metrics.activeTasks).toBeDefined();
      expect(metrics.taskDuration).toBeDefined();
      expect(metrics.tokenUsage).toBeDefined();
      expect(metrics.apiLatency).toBeDefined();
      expect(metrics.cacheHitRate).toBeDefined();
    });
  });

  describe('createAgentMetrics', () => {
    it('should create agent metrics with default prefix', () => {
      const metrics = createAgentMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.executionTotal).toBeDefined();
      expect(metrics.executionDurationSeconds).toBeDefined();
      expect(metrics.tokenUsage).toBeDefined();
      expect(metrics.activeConnections).toBeDefined();
    });

    it('should create agent metrics with custom prefix', () => {
      const metrics = createAgentMetrics('custom_prefix');
      expect(metrics).toBeDefined();
    });
  });

  describe('Health Checks', () => {
    it('should register and unregister health checks', async () => {
      const check = vi.fn().mockResolvedValue(true);
      
      registerHealthCheck('test_check', check);
      expect(getAllHealthChecks()).toContain('test_check');

      unregisterHealthCheck('test_check');
      expect(getAllHealthChecks()).not.toContain('test_check');
    });

    it('should run health checks', async () => {
      const check1 = vi.fn().mockResolvedValue(true);
      const check2 = vi.fn().mockResolvedValue(false);
      
      registerHealthCheck('pass_check', check1);
      registerHealthCheck('fail_check', check2);

      const results = await runHealthChecks();
      
      expect(results['pass_check']).toBe(true);
      expect(results['fail_check']).toBe(false);
    });

    it('should handle health check errors', async () => {
      const failingCheck = vi.fn().mockRejectedValue(new Error('Check failed'));
      
      registerHealthCheck('error_check', failingCheck);

      const results = await runHealthChecks();
      
      expect(results['error_check']).toBe(false);
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should list all registered health checks', () => {
      registerHealthCheck('check1', async () => true);
      registerHealthCheck('check2', async () => true);
      
      const checks = getAllHealthChecks();
      expect(checks).toContain('check1');
      expect(checks).toContain('check2');
    });
  });
});
