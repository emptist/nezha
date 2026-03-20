#!/usr/bin/env node
/**
 * MCP Config Sync Utility
 *
 * Reads MCP server configurations from PostgreSQL database and syncs to OpenCode config file.
 * This maintains PostgreSQL as the single source of truth while supporting OpenCode.
 *
 * Usage:
 *   node dist/mcp/sync-mcp-config.js [--dry-run]
 *
 * Design Principle: All configs in PostgreSQL, files only as runtime fallback
 */

import { DatabaseClient } from '../db/DatabaseClient.js';
import { Config } from '../config/Config.js';
import * as fs from 'fs';
import * as path from 'path';

const OPENCODE_CONFIG_PATH = path.join(
  process.env.HOME || '/Users/jk',
  '.config/opencode/opencode.json'
);

interface McpConfigRow {
  name: string;
  server_type: 'local' | 'remote';
  command?: string;
  command_args?: string[];
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  timeout_ms?: number;
  environment?: string;
}

interface OpenCodeMcpServerConfig {
  type: 'local' | 'remote';
  command?: string[];
  url?: string;
  headers?: Record<string, string>;
}

interface OpenCodeConfig {
  mcp?: Record<string, OpenCodeMcpServerConfig>;
  [key: string]: unknown;
}

async function getMcpConfigs(db: DatabaseClient): Promise<McpConfigRow[]> {
  const result = await db.query<McpConfigRow>(
    `SELECT name, server_type, command, command_args, url, headers, enabled, timeout_ms, environment
     FROM mcp_configs 
     WHERE enabled = true 
     ORDER BY name`
  );
  return result.rows;
}

function buildOpenCodeMcpConfig(configs: McpConfigRow[]): Record<string, OpenCodeMcpServerConfig> {
  const mcp: Record<string, OpenCodeMcpServerConfig> = {};

  for (const cfg of configs) {
    const serverConfig: OpenCodeMcpServerConfig = {
      type: cfg.server_type,
    };

    if (cfg.server_type === 'local') {
      serverConfig.command = [cfg.command, ...(cfg.command_args || [])].filter(
        (c): c is string => c !== undefined
      );
    } else if (cfg.server_type === 'remote') {
      serverConfig.url = cfg.url;
      if (cfg.headers && Object.keys(cfg.headers).length > 0) {
        serverConfig.headers = cfg.headers;
      }
    }

    mcp[cfg.name] = serverConfig;
  }

  return mcp;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('MCP Config Sync Utility');
  console.log('========================');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log();

  // Connect to database
  const db = new DatabaseClient(Config.getInstance());

  try {
    // Get configs from database
    const configs = await getMcpConfigs(db);
    console.log(`Found ${configs.length} enabled MCP configs in database:`);
    for (const cfg of configs) {
      console.log(`  - ${cfg.name} (${cfg.server_type})`);
    }
    console.log();

    // Build OpenCode config structure
    const opencodeMcpConfig = buildOpenCodeMcpConfig(configs);

    if (dryRun) {
      console.log('Would write to opencode.json:');
      console.log(JSON.stringify({ mcp: opencodeMcpConfig }, null, 2));
      return;
    }

    // Read existing opencode.json
    let existingConfig: OpenCodeConfig = {};
    if (fs.existsSync(OPENCODE_CONFIG_PATH)) {
      const content = fs.readFileSync(OPENCODE_CONFIG_PATH, 'utf-8');
      existingConfig = JSON.parse(content) as OpenCodeConfig;
    }

    // Update with MCP configs (preserve other settings)
    existingConfig.mcp = opencodeMcpConfig;

    // Write back
    fs.writeFileSync(OPENCODE_CONFIG_PATH, JSON.stringify(existingConfig, null, 2) + '\n');
    console.log(`Updated ${OPENCODE_CONFIG_PATH}`);
  } finally {
    await db.close();
  }
}

main().catch(console.error);
