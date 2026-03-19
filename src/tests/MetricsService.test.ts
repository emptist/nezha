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
      expect(histogram.sum).toBe(0.3);
      expect(histogram.count).toBe(1);
    });

    it('should update histogram values', () => {
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
      expect(histogram.count).toBe(1);
      expect(histogram.sum).toBe(0.05);
    });

    it('should return default values for non-existent metric', () => {
      const metrics = new Map();
      const histogram = new Histogram(metrics, 'missing');

      expect(histogram.count).toBe(0);
      expect(histogram.sum).toBe(0);
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
      const counter = registry.counter('test', 'A test counter');
      expect(counter).toBeDefined();
    });

    it('should create gauge via registry', () => {
      const registry = new MetricsRegistry();
      const gauge = registry.gauge('test_gauge', 'A test gauge');
      expect(gauge).toBeDefined();
    });

    it('should create histogram via registry', () => {
      const registry = new MetricsRegistry();
      const histogram = registry.histogram('test_hist', 'A test histogram');
      expect(histogram).toBeDefined();
    });

    it('should increment counter', () => {
      const registry = new MetricsRegistry();
      const counter = registry.counter('inc_test', 'Increment test');
      counter.inc();
      expect(counter.value).toBe(1);
    });

    it('should set gauge value', () => {
      const registry = new MetricsRegistry();
      const gauge = registry.gauge('set_test', 'Set test');
      gauge.set(10);
      expect(gauge.value).toBe(10);
    });

    it('should observe histogram', () => {
      const registry = new MetricsRegistry();
      const histogram = registry.histogram('obs_test', 'Observe test');
      histogram.observe(0.5);
      expect(histogram.count).toBe(1);
    });

    it('should export metrics in prometheus format', () => {
      const registry = new MetricsRegistry();
      registry.counter('c1', 'Counter 1');
      registry.gauge('g1', 'Gauge 1');
      registry.histogram('h1', 'Histogram 1');

      const exported = registry.export();
      expect(exported).toContain('# HELP c1 Counter 1');
      expect(exported).toContain('# TYPE c1 counter');
      expect(exported).toContain('# TYPE g1 gauge');
      expect(exported).toContain('# TYPE h1 histogram');
    });

    it('should export to JSON', () => {
      const registry = new MetricsRegistry();
      registry.counter('json_test', 'Test');
      
      const json = registry.toJSON();
      expect(json).toHaveProperty('counters');
      expect(json).toHaveProperty('gauges');
      expect(json).toHaveProperty('histograms');
    });

    it('should reset all metrics', () => {
      const registry = new MetricsRegistry();
      registry.counter('to_clear', 'Will be cleared');
      registry.reset();
      
      const json = registry.toJSON() as { counters: Record<string, unknown> };
      expect(Object.keys(json.counters).length).toBe(0);
    });
  });

  describe('createStandardMetrics', () => {
    it('should create standard metrics object', () => {
      const metrics = createStandardMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.tasksTotal).toBeDefined();
      expect(metrics.activeTasks).toBeDefined();
      expect(metrics.taskDurationSeconds).toBeDefined();
      expect(metrics.workerUtilization).toBeDefined();
      expect(metrics.queueSize).toBeDefined();
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
