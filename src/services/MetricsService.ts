// Prometheus-style metrics for Nezha

import { logger } from '../utils/logger.js';

export type MetricType = 'counter' | 'gauge' | 'histogram';

export interface Metric {
  name: string;
  type: MetricType;
  help: string;
  value: number;
  labels: Record<string, string>;
}

export interface HistogramBucket {
  le: number;
  count: number;
}

export interface HistogramMetric extends Metric {
  type: 'histogram';
  buckets: HistogramBucket[];
  sum: number;
  count: number;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AgentMetrics {
  executionTotal: Counter;
  executionDurationSeconds: Histogram;
  tokenUsage: Counter;
  activeConnections: Gauge;
}

export interface TransportHealth {
  mode: 'http' | 'cli';
  healthy: boolean;
  lastCheck: Date;
  latencyMs?: number;
  error?: string;
}

export interface AgentHealth {
  healthy: boolean;
  timestamp: Date;
  serverConnectivity: boolean;
  transports: TransportHealth[];
}

class Counter {
  constructor(
    private metrics: Map<string, Metric>,
    private key: string
  ) {}

  inc(value: number = 1): void {
    const metric = this.metrics.get(this.key);
    if (metric) {
      metric.value += value;
    }
  }

  get value(): number {
    const metric = this.metrics.get(this.key);
    return metric?.value ?? 0;
  }
}

class Gauge {
  constructor(
    private metrics: Map<string, Metric>,
    private key: string
  ) {}

  inc(value: number = 1): void {
    const metric = this.metrics.get(this.key);
    if (metric) {
      metric.value += value;
    }
  }

  dec(value: number = 1): void {
    const metric = this.metrics.get(this.key);
    if (metric) {
      metric.value -= value;
    }
  }

  set(value: number): void {
    const metric = this.metrics.get(this.key);
    if (metric) {
      metric.value = value;
    }
  }

  get value(): number {
    const metric = this.metrics.get(this.key);
    return metric?.value ?? 0;
  }
}

class Histogram {
  constructor(
    private metrics: Map<string, HistogramMetric>,
    private key: string
  ) {}

  observe(value: number): void {
    const metric = this.metrics.get(this.key);
    if (metric) {
      metric.sum += value;
      metric.count += 1;
      for (const bucket of metric.buckets) {
        if (value <= bucket.le) {
          bucket.count++;
        }
      }
    }
  }

  get sum(): number {
    const metric = this.metrics.get(this.key);
    return metric?.sum ?? 0;
  }

  get count(): number {
    const metric = this.metrics.get(this.key);
    return metric?.count ?? 0;
  }
}

export { Counter, Gauge, Histogram };

export class MetricsRegistry {
  private counters: Map<string, Metric> = new Map();
  private gauges: Map<string, Metric> = new Map();
  private histograms: Map<string, HistogramMetric> = new Map();

  private getKey(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels)
      .sort()
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return labelStr ? `${name}{${labelStr}}` : name;
  }

  private getBaseKey(name: string): string {
    return name.replace(/\{.*\}$/, '');
  }

  // Counter: monotonically increasing value
  counter(name: string, help: string = '', labels: Record<string, string> = {}): Counter {
    const key = this.getKey(name, labels);
    if (!this.counters.has(key)) {
      this.counters.set(key, { name, type: 'counter', help, value: 0, labels });
    }
    return new Counter(this.counters, key);
  }

  // Gauge: can go up and down
  gauge(name: string, help: string = ''): Gauge {
    const key = this.getKey(name, {});
    if (!this.gauges.has(key)) {
      this.gauges.set(key, { name, type: 'gauge', help, value: 0, labels: {} });
    }
    return new Gauge(this.gauges, key);
  }

  // Histogram: distribution of values
  histogram(
    name: string,
    help: string = '',
    buckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    labels: Record<string, string> = {}
  ): Histogram {
    const key = this.getKey(name, labels);
    if (!this.histograms.has(key)) {
      const histogramMetric: HistogramMetric = {
        name,
        type: 'histogram',
        help,
        value: 0,
        labels,
        buckets: buckets.map(le => ({ le, count: 0 })),
        sum: 0,
        count: 0,
      };
      this.histograms.set(key, histogramMetric);
    }
    return new Histogram(this.histograms, key);
  }

  // Export all metrics in Prometheus format
  export(): string {
    const lines: string[] = [];

    // Add help and type comments
    for (const metric of this.counters.values()) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} counter`);
      lines.push(`${metric.name} ${metric.value}`);
    }

    for (const metric of this.gauges.values()) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} gauge`);
      lines.push(`${metric.name} ${metric.value}`);
    }

    for (const metric of this.histograms.values()) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} histogram`);

      for (const bucket of metric.buckets) {
        lines.push(`${metric.name}_bucket{le="${bucket.le}"} ${bucket.count}`);
      }
      lines.push(`${metric.name}_sum ${metric.sum}`);
      lines.push(`${metric.name}_count ${metric.count}`);
    }

    return lines.join('\n') + '\n';
  }

  // Get all metrics as JSON
  toJSON(): Record<string, unknown> {
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: Object.fromEntries(this.histograms),
    };
  }

  // Reset all metrics
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}

// Global metrics registry
let globalRegistry: MetricsRegistry | null = null;

export function getMetricsRegistry(): MetricsRegistry {
  if (!globalRegistry) {
    globalRegistry = new MetricsRegistry();
  }
  return globalRegistry;
}

// Pre-defined metrics
export function createStandardMetrics() {
  const registry = getMetricsRegistry();

  return {
    // Task duration histogram (in seconds)
    taskDurationSeconds: registry.histogram(
      'nezha_task_duration_seconds',
      'Task execution duration in seconds',
      [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300]
    ),

    // Tasks total counter by status
    tasksTotal: registry.counter('nezha_tasks_total', 'Total number of tasks processed'),

    // Worker utilization gauge (0-1)
    workerUtilization: registry.gauge(
      'nezha_worker_utilization',
      'Current worker utilization (0-1)'
    ),

    // Active tasks gauge
    activeTasks: registry.gauge('nezha_active_tasks', 'Number of currently running tasks'),

    // Queue size gauge
    queueSize: registry.gauge('nezha_queue_size', 'Number of pending tasks in queue'),

    // Heartbeat interval gauge
    heartbeatDurationSeconds: registry.histogram(
      'nezha_heartbeat_duration_seconds',
      'Heartbeat loop duration in seconds'
    ),

    // Memory usage gauge (bytes)
    memoryUsageBytes: registry.gauge('nezha_memory_usage_bytes', 'Process memory usage in bytes'),
  };
}

// Agent-specific metrics factory
export function createAgentMetrics(prefix: string = 'nezha_agent') {
  const registry = getMetricsRegistry();

  return {
    executionTotal: registry.counter(`${prefix}_execution_total`, 'Total agent task executions'),
    executionDurationSeconds: registry.histogram(
      `${prefix}_execution_duration_seconds`,
      'Agent task execution duration in seconds',
      [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300]
    ),
    tokenUsage: registry.counter(`${prefix}_token_usage_total`, 'Total token usage by type'),
    activeConnections: registry.gauge(
      `${prefix}_active_connections`,
      'Number of active agent connections'
    ),
  };
}

// Health check registry
const healthChecks = new Map<string, () => Promise<boolean>>();

export function registerHealthCheck(name: string, check: () => Promise<boolean>): void {
  healthChecks.set(name, check);
}

export function unregisterHealthCheck(name: string): void {
  healthChecks.delete(name);
}

export async function runHealthChecks(): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};
  const checks = Array.from(healthChecks.entries());

  await Promise.all(
    checks.map(async ([name, check]) => {
      try {
        results[name] = await check();
      } catch (err) {
        logger.debug(
          `Health check '${name}' failed: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
        results[name] = false;
      }
    })
  );

  return results;
}

export function getAllHealthChecks(): string[] {
  return Array.from(healthChecks.keys());
}
