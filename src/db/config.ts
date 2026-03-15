export interface DbConfig {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
  maxConnections: number;
}

function loadDbConfig(): DbConfig {
  return {
    host: process.env.DB_HOST ?? "localhost",
    port: parseInt(process.env.DB_PORT ?? "5432", 10),
    name: process.env.DB_NAME ?? "nezha",
    user: process.env.DB_USER ?? "postgres",
    password: process.env.DB_PASSWORD ?? "postgres",
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS ?? "10", 10),
  };
}

let cachedConfig: DbConfig | null = null;

export function getDbConfig(): DbConfig {
  if (!cachedConfig) {
    cachedConfig = loadDbConfig();
  }
  return cachedConfig;
}

export function getDbConnectionString(): string {
  const config = getDbConfig();
  return `postgresql://${config.user}:${config.password}@${config.host}:${config.port}/${config.name}`;
}
