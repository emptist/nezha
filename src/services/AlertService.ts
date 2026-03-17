import { logger } from '../utils/logger.js';

export interface AlertConfig {
  failureThreshold?: number;
  checkIntervalMs?: number;
}

export interface Alert {
  id: string;
  type: 'task_failure' | 'circuit_breaker' | 'dependency_blocked';
  message: string;
  severity: 'warning' | 'error' | 'critical';
  metadata?: Record<string, unknown>;
  createdAt: Date;
  acknowledged: boolean;
}

export class AlertService {
  private alerts: Map<string, Alert> = new Map();
  private recentFailures: Map<string, number[]> = new Map();
  private readonly failureThreshold: number;
  private readonly checkIntervalMs: number;
  private readonly failureWindowMs: number = 15 * 60 * 1000; // 15 minutes

  constructor(config?: AlertConfig) {
    this.failureThreshold = config?.failureThreshold ?? 3;
    this.checkIntervalMs = config?.checkIntervalMs ?? 60000; // 1 minute
  }

  trackFailure(taskId: string, error: string): void {
    const now = Date.now();
    const failures = this.recentFailures.get(taskId) ?? [];
    
    // Add current failure and clean old ones
    failures.push(now);
    const recentFailures = failures.filter(t => now - t < this.failureWindowMs);
    this.recentFailures.set(taskId, recentFailures);

    // Check if threshold exceeded
    if (recentFailures.length >= this.failureThreshold) {
      this.createAlert({
        id: `task_failure_${taskId}`,
        type: 'task_failure',
        message: `Task "${taskId}" has failed ${recentFailures.length} times in the last ${this.failureWindowMs / 60000}
   minutes`,
        severity: recentFailures.length >= this.failureThreshold * 2 ? 'critical' : 'warning',
        metadata: { taskId, recentFailureCount: recentFailures.length, lastError: error },
      });
    }
  }

  trackCircuitBreaker(service: string, state: string): void {
    if (state === 'open') {
      this.createAlert({
        id: `circuit_breaker_${service}`,
        type: 'circuit_breaker',
        message: `Circuit breaker opened for ${service}`,
        severity: 'error',
        metadata: { service, state },
      });
    }
  }

  trackDependencyBlocked(taskId: string, blockedBy: string[]): void {
    this.createAlert({
      id: `dependency_blocked_${taskId}`,
      type: 'dependency_blocked',
      message: `Task "${taskId}" is blocked by unfinished dependencies: ${blockedBy.join(', ')}`,
      severity: 'warning',
      metadata: { taskId, blockedBy },
    });
  }

  private createAlert(alert: Omit<Alert, 'createdAt' | 'acknowledged'>): void {
    const fullAlert: Alert = {
      ...alert,
      createdAt: new Date(),
      acknowledged: false,
    };

    // Avoid duplicate alerts
    const existing = this.alerts.get(alert.id);
    if (existing && !existing.acknowledged) {
      logger.debug('Alert already exists:', alert.id);
      return;
    }

    this.alerts.set(alert.id, fullAlert);
    
    const severityEmoji = alert.severity === 'critical' ? '🔴' : alert.severity === 'error' ? '🟠' : '🟡';
    logger.warn(`ALERT ${severityEmoji} [${alert.severity.toUpperCase()}]: ${alert.message}`);
  }

  getAlerts(includeAcknowledged: boolean = false): Alert[] {
    const alerts = Array.from(this.alerts.values());
    if (!includeAcknowledged) {
      return alerts.filter(a => !a.acknowledged);
    }
    return alerts;
  }

  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      logger.info(`Alert acknowledged: ${alertId}`);
      return true;
    }
    return false;
  }

  clearAlert(alertId: string): boolean {
    return this.alerts.delete(alertId);
  }

  clearOldAlerts(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleared = 0;
    for (const [id, alert] of this.alerts) {
      if (now - alert.createdAt.getTime() > maxAgeMs && alert.acknowledged) {
        this.alerts.delete(id);
        cleared++;
      }
    }
    return cleared;
  }
}

// Global alert service instance
let alertServiceInstance: AlertService | null = null;

export function getAlertService(): AlertService {
  if (!alertServiceInstance) {
    alertServiceInstance = new AlertService();
  }
  return alertServiceInstance;
}
