/**
 * NuPI - Nezha united with PI (牛派)
 *
 * 本地二合一 AI 协作系统
 *
 * @package @nezha/nupi
 *
 * Usage in Pi:
 * ```typescript
 * import nezhaTools from './extensions/nezha-tools.js';
 * import nezhaAutoWork from './extensions/nezha-autowork.js';
 *
 * // Register extensions
 * pi.register(nezhaTools);
 * pi.register(nezhaAutoWork);
 * ```
 */

export interface NuPIConfig {
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPassword: string;
}

export function createNuPI(config: NuPIConfig) {
  return {
    config,
    // TODO: 初始化 NuPI 核心
  };
}
