import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Config } from '../config/Config.js';

describe('Config', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    Config.resetInstance();
  });

  afterEach(() => {
    process.env = originalEnv;
    Config.resetInstance();
  });

  it('should create a config instance', () => {
    const config = Config.getInstance();
    expect(config).toBeDefined();
  });

  it('should be a singleton', () => {
    const config1 = Config.getInstance();
    const config2 = Config.getInstance();
    expect(config1).toBe(config2);
  });

  it('should use default values when env vars not set', () => {
    delete process.env.NEZHA_DB_HOST;
    delete process.env.NEZHA_DB_PORT;
    Config.resetInstance();
    const config = Config.getInstance();
    const dbConfig = config.getDbConfig();
    expect(dbConfig.host).toBe('localhost');
    expect(dbConfig.port).toBe(5432);
  });

  it('should read DB_HOST from environment', () => {
    process.env.NEZHA_DB_HOST = 'custom-host';
    Config.resetInstance();
    const config = Config.getInstance();
    expect(config.getDbConfig().host).toBe('custom-host');
  });

  it('should read DB_PORT from environment', () => {
    process.env.NEZHA_DB_PORT = '3333';
    Config.resetInstance();
    const config = Config.getInstance();
    expect(config.getDbConfig().port).toBe(3333);
  });

  it('should read DB_NAME from environment', () => {
    process.env.NEZHA_DB_NAME = 'testdb';
    Config.resetInstance();
    const config = Config.getInstance();
    expect(config.getDbConfig().database).toBe('testdb');
  });

  it('should read DB_USER from environment', () => {
    process.env.NEZHA_DB_USER = 'admin';
    Config.resetInstance();
    const config = Config.getInstance();
    expect(config.getDbConfig().user).toBe('admin');
  });

  it('should read DB_PASSWORD from environment', () => {
    process.env.NEZHA_DB_PASSWORD = 'secret';
    Config.resetInstance();
    const config = Config.getInstance();
    expect(config.getDbConfig().password).toBe('secret');
  });

  it('should read DB_MAX from environment', () => {
    process.env.NEZHA_DB_MAX = '20';
    Config.resetInstance();
    const config = Config.getInstance();
    expect(config.getDbConfig().max).toBe(20);
  });

  it('should read HEARTBEAT_INTERVAL from environment', () => {
    process.env.NEZHA_HEARTBEAT_INTERVAL = '5000';
    Config.resetInstance();
    const config = Config.getInstance();
    expect(config.getTaskConfig().heartbeatIntervalMs).toBe(5000);
  });

  it('should read MAX_RETRIES from environment', () => {
    process.env.NEZHA_MAX_RETRIES = '10';
    Config.resetInstance();
    const config = Config.getInstance();
    expect(config.getTaskConfig().maxRetries).toBe(10);
  });

  it('should read RETRY_DELAY from environment', () => {
    process.env.NEZHA_RETRY_DELAY = '2000';
    Config.resetInstance();
    const config = Config.getInstance();
    expect(config.getTaskConfig().retryDelayMs).toBe(2000);
  });

  it('should read TASK_TIMEOUT from environment', () => {
    process.env.NEZHA_TASK_TIMEOUT = '30000';
    Config.resetInstance();
    const config = Config.getInstance();
    expect(config.getTaskConfig().taskTimeoutMs).toBe(30000);
  });

  it('should read MEMORY_BOOTSTRAP_DIR from environment', () => {
    process.env.NEZHA_MEMORY_BOOTSTRAP_DIR = '/custom/path';
    Config.resetInstance();
    const config = Config.getInstance();
    expect(config.getMemoryConfig().bootstrapDir).toBe('/custom/path');
  });

  it('should read MAX_MEMORY_AGE from environment', () => {
    process.env.NEZHA_MAX_MEMORY_AGE = '86400000';
    Config.resetInstance();
    const config = Config.getInstance();
    expect(config.getMemoryConfig().maxMemoryAgeMs).toBe(86400000);
  });

  it('should read ENV from environment as development', () => {
    process.env.NEZHA_ENV = 'development';
    Config.resetInstance();
    const config = Config.getInstance();
    expect(config.getEnv()).toBe('development');
  });

  it('should read ENV from environment as production', () => {
    process.env.NEZHA_ENV = 'production';
    Config.resetInstance();
    const config = Config.getInstance();
    expect(config.getEnv()).toBe('production');
  });

  it('should read ENV from environment as test', () => {
    process.env.NEZHA_ENV = 'test';
    Config.resetInstance();
    const config = Config.getInstance();
    expect(config.getEnv()).toBe('test');
  });

  it('should default to development for invalid ENV', () => {
    process.env.NEZHA_ENV = 'invalid';
    Config.resetInstance();
    const config = Config.getInstance();
    expect(config.getEnv()).toBe('development');
  });

  it('should validate valid config', () => {
    process.env.NEZHA_DB_HOST = 'localhost';
    process.env.NEZHA_DB_PORT = '5432';
    process.env.NEZHA_DB_NAME = 'nezha';
    process.env.NEZHA_DB_USER = 'postgres';
    process.env.NEZHA_DB_PASSWORD = 'secret';
    process.env.NEZHA_HEARTBEAT_INTERVAL = '1000';
    process.env.NEZHA_MAX_RETRIES = '3';
    Config.resetInstance();
    const config = Config.getInstance();
    expect(config.validate()).toBe(true);
  });

  it('should validate when DB_HOST uses default (empty env var)', () => {
    process.env.NEZHA_DB_HOST = '';
    process.env.NEZHA_DB_PORT = '5432';
    process.env.NEZHA_DB_NAME = 'nezha';
    process.env.NEZHA_DB_USER = 'postgres';
    process.env.NEZHA_DB_PASSWORD = 'secret';
    process.env.NEZHA_HEARTBEAT_INTERVAL = '1000';
    Config.resetInstance();
    const config = Config.getInstance();
    expect(config.getDbConfig().host).toBe('localhost');
    expect(config.validate()).toBe(true);
  });

  it('should fail validation when DB_PORT is invalid', () => {
    process.env.NEZHA_DB_HOST = 'localhost';
    process.env.NEZHA_DB_PORT = '70000';
    process.env.NEZHA_DB_NAME = 'nezha';
    process.env.NEZHA_HEARTBEAT_INTERVAL = '1000';
    Config.resetInstance();
    const config = Config.getInstance();
    expect(config.validate()).toBe(false);
  });

  it('should fail validation when HEARTBEAT_INTERVAL is negative', () => {
    process.env.NEZHA_DB_HOST = 'localhost';
    process.env.NEZHA_DB_PORT = '5432';
    process.env.NEZHA_DB_NAME = 'nezha';
    process.env.NEZHA_HEARTBEAT_INTERVAL = '-1';
    Config.resetInstance();
    const config = Config.getInstance();
    expect(config.validate()).toBe(false);
  });

  it('should fail validation when MAX_RETRIES is negative', () => {
    process.env.NEZHA_DB_HOST = 'localhost';
    process.env.NEZHA_DB_PORT = '5432';
    process.env.NEZHA_DB_NAME = 'nezha';
    process.env.NEZHA_HEARTBEAT_INTERVAL = '1000';
    process.env.NEZHA_MAX_RETRIES = '-1';
    Config.resetInstance();
    const config = Config.getInstance();
    expect(config.validate()).toBe(false);
  });

  it('should allow empty DB_PASSWORD for Keychain/trust authentication', () => {
    process.env.NEZHA_DB_HOST = 'localhost';
    process.env.NEZHA_DB_PORT = '5432';
    process.env.NEZHA_DB_NAME = 'nezha';
    process.env.NEZHA_DB_USER = 'postgres';
    process.env.NEZHA_DB_PASSWORD = '';
    process.env.NEZHA_HEARTBEAT_INTERVAL = '1000';
    Config.resetInstance();
    const config = Config.getInstance();
    expect(config.validate()).toBe(true);
  });

  it('should return copies of configs to prevent mutation', () => {
    process.env.NEZHA_DB_HOST = 'localhost';
    process.env.NEZHA_DB_PORT = '5432';
    process.env.NEZHA_DB_NAME = 'nezha';
    Config.resetInstance();
    const config = Config.getInstance();
    const dbConfig1 = config.getDbConfig();
    const dbConfig2 = config.getDbConfig();
    expect(dbConfig1).not.toBe(dbConfig2);
  });
});
