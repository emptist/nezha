// YAML Configuration loader for Nezha

import * as fs from 'fs';
import * as path from 'path';

export interface NezhaYamlConfig {
  database?: {
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    max?: number;
  };
  task?: {
    heartbeatIntervalMs?: number;
    maxRetries?: number;
    retryDelayMs?: number;
    taskTimeoutMs?: number;
  };
  embedding?: {
    provider?: 'ollama' | 'openai' | 'zhipu';
    model?: string;
    apiUrl?: string;
    apiKey?: string;
  };
  transport?: {
    mode?: 'http' | 'cli';
    opencodeApiUrl?: string;
  };
  health?: {
    port?: number;
    requireAuth?: boolean;
  };
  webhook?: {
    url?: string;
    secret?: string;
    enabled?: boolean;
  };
  logging?: {
    level?: 'debug' | 'info' | 'warn' | 'error';
  };
}

export class YamlConfigLoader {
  private configPath: string;
  private config: NezhaYamlConfig | null = null;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(process.cwd(), 'config.yaml');
  }

  load(): NezhaYamlConfig {
    if (this.config) {
      return this.config;
    }

    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        this.config = this.parseYaml(content);
      }
    } catch (error) {
      console.warn(`Failed to load config from ${this.configPath}:`, error);
    }

    return this.config || {};
  }

  private parseYaml(content: string): NezhaYamlConfig {
    // Simple YAML parser for our config format
    const result: Record<string, unknown> = {};
    const lines = content.split('\n');
    let currentSection: Record<string, unknown> = result;
    const sectionStack: { key: string; obj: Record<string, unknown> }[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Check for section header
      const sectionMatch = trimmed.match(/^(\w+):$/);
      if (sectionMatch) {
        const sectionName = sectionMatch[1];
        if (!sectionName) continue;
        currentSection = {};
        result[sectionName] = currentSection;
        sectionStack.push({ key: sectionName, obj: currentSection });
        continue;
      }

      // Check for nested section (indented)
      const nestedMatch = trimmed.match(/^(\w+):$/);
      if (nestedMatch && line.startsWith('  ')) {
        const sectionName = nestedMatch[1];
        if (!sectionName || !currentSection) continue;
        const nested: Record<string, unknown> = {};
        currentSection[sectionName] = nested;
        sectionStack.push({ key: sectionName, obj: nested });
        continue;
      }

      // Parse key-value pair
      const kvMatch = trimmed.match(/^(\w+):\s*(.*)$/);
      if (kvMatch) {
        const key = kvMatch[1];
        const value = kvMatch[2];
        if (key && value !== undefined && currentSection) {
          currentSection[key] = this.parseValue(value);
        }
      }
    }

    return result as NezhaYamlConfig;
  }

  private parseValue(value: string): unknown {
    // Parse numbers
    if (/^\d+$/.test(value)) {
      const parsed = parseInt(value, 10);
      if (!isNaN(parsed)) return parsed;
    }
    if (/^\d+\.\d+$/.test(value)) {
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) return parsed;
    }

    // Parse booleans
    if (value === 'true') return true;
    if (value === 'false') return false;

    // Remove quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }

    return value;
  }

  private parseEnvInt(key: string): number | undefined {
    const value = process.env[key];
    if (!value) return undefined;
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      throw new Error(`Invalid environment variable ${key}: "${value}" is not a valid integer`);
    }
    return parsed;
  }

  // Merge with environment variables (env takes precedence)
  mergeWithEnv(config: NezhaYamlConfig): NezhaYamlConfig {
    const merged = { ...config };

    // Database env overrides
    if (process.env.DB_HOST) (merged.database ??= {}).host = process.env.DB_HOST;
    if (process.env.DB_PORT) {
      const port = this.parseEnvInt('DB_PORT');
      if (port !== undefined) (merged.database ??= {}).port = port;
    }
    if (process.env.DB_NAME) (merged.database ??= {}).database = process.env.DB_NAME;
    if (process.env.DB_USER) (merged.database ??= {}).user = process.env.DB_USER;
    if (process.env.DB_PASSWORD) (merged.database ??= {}).password = process.env.DB_PASSWORD;

    // Task env overrides
    if (process.env.HEARTBEAT_INTERVAL_MS) {
      const interval = this.parseEnvInt('HEARTBEAT_INTERVAL_MS');
      if (interval !== undefined) (merged.task ??= {}).heartbeatIntervalMs = interval;
    }

    // Embedding env overrides
    if (process.env.EMBEDDING_PROVIDER) {
      (merged.embedding ??= {}).provider = process.env.EMBEDDING_PROVIDER as
        | 'ollama'
        | 'openai'
        | 'zhipu';
    }
    if (process.env.EMBEDDING_API_KEY) {
      (merged.embedding ??= {}).apiKey = process.env.EMBEDDING_API_KEY;
    }

    // Health env overrides
    if (process.env.HEALTH_PORT) {
      const port = this.parseEnvInt('HEALTH_PORT');
      if (port !== undefined) (merged.health ??= {}).port = port;
    }

    // Webhook env overrides
    if (process.env.WEBHOOK_URL) {
      (merged.webhook ??= {}).url = process.env.WEBHOOK_URL;
    }
    if (process.env.WEBHOOK_SECRET) {
      (merged.webhook ??= {}).secret = process.env.WEBHOOK_SECRET;
    }
    if (process.env.WEBHOOK_ENABLED) {
      (merged.webhook ??= {}).enabled = process.env.WEBHOOK_ENABLED === 'true';
    }

    return merged;
  }

  validate(config: NezhaYamlConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Database validation
    if (config.database) {
      if (!config.database.host) errors.push('database.host is required');
      if (!config.database.port || isNaN(config.database.port))
        errors.push('database.port must be a number');
      if (!config.database.database) errors.push('database.database is required');
    }

    // Task validation
    if (config.task?.heartbeatIntervalMs !== undefined) {
      if (isNaN(config.task.heartbeatIntervalMs) || config.task.heartbeatIntervalMs < 1000) {
        errors.push('task.heartbeatIntervalMs must be >= 1000');
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

// Singleton instance
let configLoader: YamlConfigLoader | null = null;

export function getYamlConfigLoader(configPath?: string): YamlConfigLoader {
  if (!configLoader) {
    configLoader = new YamlConfigLoader(configPath);
  }
  return configLoader;
}

export function loadYamlConfig(): { config: NezhaYamlConfig; valid: boolean; errors: string[] } {
  const loader = getYamlConfigLoader();
  const config = loader.load();
  const merged = loader.mergeWithEnv(config);
  const validation = loader.validate(merged);

  return { config: merged, ...validation };
}
