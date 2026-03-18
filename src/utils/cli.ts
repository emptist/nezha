const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

export { colors };

export const cli = {
  error(msg: string): void {
    console.error(`${colors.red}✗${colors.reset} ${msg}`);
  },

  success(msg: string): void {
    console.log(`${colors.green}✓${colors.reset} ${msg}`);
  },

  warn(msg: string): void {
    console.warn(`${colors.yellow}⚠${colors.reset} ${msg}`);
  },

  info(msg: string): void {
    console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`);
  },

  step(msg: string): void {
    console.log(`${colors.blue}▸${colors.reset} ${msg}`);
  },

  done(msg: string): void {
    console.log(`${colors.green}✔${colors.reset} ${msg}`);
  },

  dryRun(msg: string): void {
    console.log(`${colors.magenta}[DRY-RUN]${colors.reset} ${msg}`);
  },

  header(msg: string): void {
    console.log(`\n${colors.bright}${colors.cyan}${msg}${colors.reset}\n`);
  },

  dim(msg: string): void {
    console.log(`${colors.dim}${msg}${colors.reset}`);
  },

  table(headers: string[], rows: string[][]): void {
    const colWidths = headers.map((h, i) =>
      Math.max(h.length, ...rows.map(r => (r[i] || '').length))
    );

    const headerRow = headers.map((h, i) => h.padEnd(colWidths[i] ?? h.length)).join('  ');
    console.log(`${colors.bright}${headerRow}${colors.reset}`);
    console.log(colWidths.map(w => '-'.repeat(w ?? 0)).join('  '));

    for (const row of rows) {
      console.log(row.map((c, i) => (c || '').padEnd(colWidths[i] ?? 0)).join('  '));
    }
  },

  progress(current: number, total: number, msg?: string): void {
    const percent = Math.round((current / total) * 100);
    const bar = '█'.repeat(Math.floor(percent / 5)).padEnd(20, '░');
    process.stdout.write(
      `\r${colors.cyan}[${bar}]${colors.reset} ${percent}%${msg ? ` ${msg}` : ''}`
    );
    if (current === total) {
      process.stdout.write('\n');
    }
  },

  spinner(msg: string, frame: number = 0): void {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    const frameChar = frames[frame % frames.length];
    process.stdout.write(`\r${frameChar} ${msg}`);
  },

  clearSpinner(): void {
    process.stdout.write('\r' + ' '.repeat(50) + '\r');
  },

  confirm(_msg: string, defaultYes: boolean = false): boolean {
    console.log(`${_msg} ${defaultYes ? '[Y/n]' : '[y/N]'}`);
    return defaultYes;
  },

  prompt(_msg: string): string {
    console.log(`${_msg}:`);
    return '';
  },
};

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString();
}
