import { colors } from './cli.js';

export type LogType = 'db' | 'api' | 'error';

export interface VerboseLogEntry {
  timestamp: string;
  type: LogType;
  operation: string;
  duration_ms: number;
  success: boolean;
  details?: Record<string, unknown>;
  error?: string;
}

let verboseMode = false;

export function setVerboseMode(enabled: boolean): void {
  verboseMode = enabled;
}

export function isVerboseMode(): boolean {
  return verboseMode;
}

export function formatDuration(ms: number): string {
  if (ms < 1) return `${ms.toFixed(2)}ms`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatLogEntry(entry: VerboseLogEntry): string {
  const { timestamp, type, operation, duration_ms, success, details, error } = entry;

  const typeColor = {
    db: colors.cyan,
    api: colors.magenta,
    error: colors.red,
  }[type];

  const statusColor = success ? colors.green : colors.red;
  const statusIcon = success ? '✓' : '✗';

  let output = `${colors.gray}${timestamp}${colors.reset} ${typeColor}[${type.toUpperCase()}]${colors.reset} ${statusColor}${statusIcon}${colors.reset} ${operation} ${colors.dim}(${formatDuration(duration_ms)})${colors.reset}`;

  if (details && Object.keys(details).length > 0) {
    const truncated = JSON.stringify(details, null, 0);
    output += `\n  ${colors.dim}→${colors.reset} ${truncated}`;
  }

  if (error) {
    output += `\n  ${colors.red}Error:${colors.reset} ${error}`;
  }

  return output;
}

export const verboseLogger = {
  logDbQuery(
    operation: string,
    params?: unknown[],
    result?: { rowCount?: number },
    error?: Error,
    startTime?: number
  ): void {
    if (!verboseMode) return;

    const duration = startTime !== undefined ? Date.now() - startTime : 0;
    const success = !error;

    const details: Record<string, unknown> = {};
    if (params && params.length > 0) {
      details.params = params;
    }
    if (result) {
      details.rowCount = result.rowCount;
    }

    const entry: VerboseLogEntry = {
      timestamp: new Date().toISOString(),
      type: 'db',
      operation,
      duration_ms: duration,
      success,
      details: Object.keys(details).length > 0 ? details : undefined,
      error: error?.message,
    };

    console.log(formatLogEntry(entry));
  },

  logApiRequest(
    operation: string,
    method: string,
    url: string,
    requestBody?: unknown,
    responseStatus?: number,
    responseBody?: unknown,
    error?: Error,
    startTime?: number
  ): void {
    if (!verboseMode) return;

    const duration = startTime !== undefined ? Date.now() - startTime : 0;
    const success = !error && (responseStatus !== undefined && responseStatus >= 200 && responseStatus < 300);

    const apiDetails: Record<string, unknown> = { method, url };
    if (requestBody) {
      apiDetails.requestBody = requestBody;
    }
    if (responseStatus) {
      apiDetails.status = responseStatus;
    }
    if (responseBody && typeof responseBody === 'string') {
      apiDetails.responseLength = responseBody.length;
    }

    const entry: VerboseLogEntry = {
      timestamp: new Date().toISOString(),
      type: 'api',
      operation,
      duration_ms: duration,
      success,
      details: apiDetails,
      error: error?.message,
    };

    console.log(formatLogEntry(entry));
  },

  logError(context: string, error: Error, extraContext?: Record<string, unknown>): void {
    if (!verboseMode) return;

    const entry: VerboseLogEntry = {
      timestamp: new Date().toISOString(),
      type: 'error',
      operation: context,
      duration_ms: 0,
      success: false,
      details: extraContext,
      error: error.message,
    };

    console.log(formatLogEntry(entry));
  },
};

export function logDbQuery(
  operation: string,
  params?: unknown[],
  result?: { rowCount?: number },
  error?: Error,
  startTime?: number
): void {
  verboseLogger.logDbQuery(operation, params, result, error, startTime);
}

export function logApiRequest(
  operation: string,
  method: string,
  url: string,
  requestBody?: unknown,
  responseStatus?: number,
  responseBody?: unknown,
  error?: Error,
  startTime?: number
): void {
  verboseLogger.logApiRequest(operation, method, url, requestBody, responseStatus, responseBody, error, startTime);
}
