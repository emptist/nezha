import * as fs from 'fs';
import * as path from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerConfig {
  level?: LogLevel;
  outputDir?: string;
  maxFileSize?: number;
  maxFiles?: number;
  json?: boolean;
  prettyPrint?: boolean;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class FileWriter {
  private logFile: string;
  private errorFile: string;
  private currentSize = 0;
  private fileIndex = 0;
  private maxFileSize: number;
  private maxFiles: number;

  constructor(outputDir: string, maxFileSize: number, maxFiles: number) {
    this.maxFileSize = maxFileSize;
    this.maxFiles = maxFiles;

    const dir = outputDir || path.join(process.cwd(), '.tmp', 'logs');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.logFile = path.join(dir, 'nezha.log');
    this.errorFile = path.join(dir, 'nezha-error.log');

    this.rotateIfNeeded();
  }

  private rotateIfNeeded(): void {
    try {
      if (fs.existsSync(this.logFile)) {
        const stats = fs.statSync(this.logFile);
        this.currentSize = stats.size;

        if (this.currentSize >= this.maxFileSize) {
          this.rotateFiles();
        }
      }
    } catch (e) {
      console.error('Log rotation check failed:', e);
    }
  }

  private rotateFiles(): void {
    try {
      // Close current file and rotate
      if (fs.existsSync(this.logFile)) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedFile = path.join(path.dirname(this.logFile), `nezha-${timestamp}.log`);
        fs.renameSync(this.logFile, rotatedFile);
      }

      // Clean old files
      this.cleanOldFiles();
      this.currentSize = 0;
    } catch (e) {
      console.error('Log rotation failed:', e);
    }
  }

  private cleanOldFiles(): void {
    try {
      const dir = path.dirname(this.logFile);
      const files = fs
        .readdirSync(dir)
        .filter(f => f.startsWith('nezha-') && f.endsWith('.log'))
        .sort()
        .reverse();

      for (let i = this.maxFiles; i < files.length; i++) {
        const file = files[i];
        if (file) {
          fs.unlinkSync(path.join(dir, file));
        }
      }
    } catch (e) {
      console.error('Failed to clean old log files:', e);
    }
  }

  write(entry: LogEntry, isError: boolean): void {
    try {
      this.rotateIfNeeded();

      const filePath = isError ? this.errorFile : this.logFile;
      const line = JSON.stringify(entry) + '\n';

      fs.appendFileSync(filePath, line);
      this.currentSize += Buffer.byteLength(line, 'utf8');
    } catch (e) {
      console.error('Failed to write log:', e);
    }
  }
}

class Logger {
  private config: Required<LoggerConfig>;
  private fileWriter?: FileWriter;
  private context: Record<string, unknown> = {};

  constructor(config: LoggerConfig = {}) {
    this.config = {
      level: config.level || (process.env.LOG_LEVEL as LogLevel) || 'info',
      outputDir:
        config.outputDir || process.env.LOG_DIR || path.join(process.cwd(), '.tmp', 'logs'),
      maxFileSize: config.maxFileSize || 10 * 1024 * 1024, // 10MB
      maxFiles: config.maxFiles || 5,
      json: config.json ?? process.env.LOG_JSON === 'true',
      prettyPrint: config.prettyPrint ?? process.env.NODE_ENV !== 'production',
    };

    if (this.config.outputDir) {
      this.fileWriter = new FileWriter(
        this.config.outputDir,
        this.config.maxFileSize,
        this.config.maxFiles
      );
    }
  }

  setContext(context: Record<string, unknown>): void {
    this.context = { ...this.context, ...context };
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVELS[level] >= LEVELS[this.config.level];
  }

  private formatEntry(level: LogLevel, message: string, args: unknown[]): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...this.context },
    };

    // Extract error from args
    const errorArg = args.find(a => a instanceof Error);
    if (errorArg) {
      const err = errorArg as Error;
      entry.error = {
        name: err.name,
        message: err.message,
        stack: err.stack,
      };
    }

    // Add extra context from args
    const contextArgs = args.filter(
      a => typeof a === 'object' && a !== null && !(a instanceof Error)
    );
    if (contextArgs.length > 0) {
      entry.context = { ...entry.context, ...Object.assign({}, ...contextArgs) };
    }

    return entry;
  }

  private output(level: LogLevel, message: string, args: unknown[]): void {
    if (!this.shouldLog(level)) return;

    const entry = this.formatEntry(level, message, args);

    if (this.config.json) {
      const output = JSON.stringify(entry);
      if (level === 'error') {
        console.error(output);
      } else if (level === 'warn') {
        console.warn(output);
      } else {
        console.log(output);
      }
    } else {
      const timestamp = entry.timestamp;
      const contextStr =
        Object.keys(entry.context || {}).length > 0 ? ' ' + JSON.stringify(entry.context) : '';
      const errorStr = entry.error ? `\n  ${entry.error.name}: ${entry.error.message}` : '';

      const output = `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}${errorStr}`;

      if (level === 'error') {
        console.error(output);
      } else if (level === 'warn') {
        console.warn(output);
      } else {
        console.log(output);
      }
    }

    // Write to file
    this.fileWriter?.write(entry, level === 'error');
  }

  debug(message: string, ...args: unknown[]): void {
    this.output('debug', message, args);
  }

  info(message: string, ...args: unknown[]): void {
    this.output('info', message, args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.output('warn', message, args);
  }

  error(message: string, ...args: unknown[]): void {
    this.output('error', message, args);
  }

  child(context: Record<string, unknown>): Logger {
    const child = new Logger(this.config);
    child.setContext({ ...this.context, ...context });
    return child;
  }
}

let loggerInstance: Logger | null = null;

export function getLogger(config?: LoggerConfig): Logger {
  if (!loggerInstance) {
    loggerInstance = new Logger(config);
  }
  return loggerInstance;
}

export const logger = getLogger();
