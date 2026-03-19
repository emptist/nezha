export enum ErrorCategory {
  NETWORK = 'NETWORK',
  AUTH = 'AUTH',
  TIMEOUT = 'TIMEOUT',
  SERVER = 'SERVER',
  TRANSPORT = 'TRANSPORT',
  LOGIC = 'LOGIC',
  RESOURCE = 'RESOURCE',
  UNKNOWN = 'UNKNOWN',
}

export interface CategorizedError extends Error {
  category: ErrorCategory;
  originalError?: Error;
  context?: Record<string, unknown>;
  retryable: boolean;
  troubleshooting?: string[];
}

export interface ErrorCategoryConfig {
  networkPatterns?: RegExp[];
  authPatterns?: RegExp[];
  timeoutPatterns?: RegExp[];
  serverPatterns?: RegExp[];
  transportPatterns?: RegExp[];
  logicPatterns?: RegExp[];
  resourcePatterns?: RegExp[];
}

const DEFAULT_NETWORK_PATTERNS = [
  /ECONNREFUSED/i,
  /ENOTFOUND/i,
  /ETIMEDOUT/i,
  /ECONNRESET/i,
  /ENETUNREACH/i,
  /socket\s*hang\s*up/i,
  /fetch\s*failed/i,
  /network/i,
  /connection\s*(refused|reset|timeout)/i,
];

const DEFAULT_AUTH_PATTERNS = [
  /401/i,
  /403/i,
  /unauthorized/i,
  /forbidden/i,
  /authentication/i,
  /auth.*failed/i,
  /invalid.*api[_-]?key/i,
  /api[_-]?key.*invalid/i,
  /bearer.*token/i,
  /jwt.*invalid/i,
];

const DEFAULT_TIMEOUT_PATTERNS = [
  /timeout/i,
  /timed?\s*out/i,
  /ETIMEDOUT/i,
  /AbortError/i,
  /request.*timeout/i,
  /response.*timeout/i,
];

const DEFAULT_SERVER_PATTERNS = [
  /500/i,
  /502/i,
  /503/i,
  /504/i,
  /internal\s*server\s*error/i,
  /bad\s*gateway/i,
  /service\s*unavailable/i,
  /gateway\s*timeout/i,
  /server\s*error/i,
  /crashed/i,
  /panic/i,
];

const DEFAULT_TRANSPORT_PATTERNS = [
  /spawn.*failed/i,
  /ENOENT/i,
  /opencode.*not\s*found/i,
  /command\s*not\s*found/i,
  /exec\s*format/i,
  /permission\s*denied/i,
  /transport.*error/i,
  /circuit\s*breaker.*open/i,
];

const DEFAULT_LOGIC_PATTERNS = [
  /assertion\s*failed/i,
  /invariant\s*violation/i,
  /cannot\s*read\s*property.*of\s*undefined/i,
  /null\s*is\s*not\s*a\s*function/i,
  /undefined\s*is\s*not\s*a\s*function/i,
  /typeerror/i,
  /referenceerror/i,
  /syntaxerror/i,
  /illegal/i,
  /malformed/i,
  /invalid\s*(input|argument|option|parameter)/i,
  /unexpected\s*token/i,
  /parse\s*error/i,
  /schema.*mismatch/i,
  /validation\s*failed/i,
  /constraint.*violation/i,
  /divide\s*by\s*zero/i,
];

const DEFAULT_RESOURCE_PATTERNS = [
  /out\s*of\s*memory/i,
  /heap\s*out\s*of\s*memory/i,
  /allocation\s*failed/i,
  /memory\s*exhausted/i,
  /disk\s*(full|space|quota)/i,
  /quota\s*exceeded/i,
  /too\s*many\s*open\s*files/i,
  /ulimit/i,
  /max\s*(connections|files|sockets|processes)/i,
  /rate\s*limit/i,
  /throttl/i,
  /backoff/i,
  /concurrent.*limit/i,
  /worker.*pool.*exhausted/i,
  /connection\s*pool.*full/i,
  /socket.*buffer.*overflow/i,
];

export class ErrorClassifier {
  private networkPatterns: RegExp[];
  private authPatterns: RegExp[];
  private timeoutPatterns: RegExp[];
  private serverPatterns: RegExp[];
  private transportPatterns: RegExp[];
  private logicPatterns: RegExp[];
  private resourcePatterns: RegExp[];

  constructor(config?: ErrorCategoryConfig) {
    this.networkPatterns = config?.networkPatterns ?? DEFAULT_NETWORK_PATTERNS;
    this.authPatterns = config?.authPatterns ?? DEFAULT_AUTH_PATTERNS;
    this.timeoutPatterns = config?.timeoutPatterns ?? DEFAULT_TIMEOUT_PATTERNS;
    this.serverPatterns = config?.serverPatterns ?? DEFAULT_SERVER_PATTERNS;
    this.transportPatterns = config?.transportPatterns ?? DEFAULT_TRANSPORT_PATTERNS;
    this.logicPatterns = config?.logicPatterns ?? DEFAULT_LOGIC_PATTERNS;
    this.resourcePatterns = config?.resourcePatterns ?? DEFAULT_RESOURCE_PATTERNS;
  }

  categorize(error: Error): CategorizedError {
    const message = error.message || String(error);
    const name = error.name || '';
    const combined = `${name} ${message}`;

    if (this.matchPatterns(combined, this.authPatterns)) {
      return this.createCategorizedError(error, ErrorCategory.AUTH, false, [
        'Check your API key configuration',
        'Verify authentication credentials are correct',
        'Ensure the API key has necessary permissions',
      ]);
    }

    if (this.matchPatterns(combined, this.transportPatterns)) {
      return this.createCategorizedError(error, ErrorCategory.TRANSPORT, true, [
        'Ensure opencode is installed: npm install -g opencode',
        'Check if opencode binary is in PATH',
        'Try running opencode --version to verify installation',
      ]);
    }

    if (this.matchPatterns(combined, this.timeoutPatterns)) {
      return this.createCategorizedError(error, ErrorCategory.TIMEOUT, true, [
        'Increase timeout setting in configuration',
        'Check network latency to server',
        'Server may be overloaded, try again later',
      ]);
    }

    if (this.matchPatterns(combined, this.serverPatterns)) {
      return this.createCategorizedError(error, ErrorCategory.SERVER, true, [
        'OpenCode server may be experiencing issues',
        'Check server logs for more details',
        'Try again in a few minutes',
      ]);
    }

    if (this.matchPatterns(combined, this.networkPatterns)) {
      return this.createCategorizedError(error, ErrorCategory.NETWORK, true, [
        'Check your network connection',
        'Verify OpenCode server is running',
        'Check firewall settings',
      ]);
    }

    if (this.matchPatterns(combined, this.logicPatterns)) {
      return this.createCategorizedError(error, ErrorCategory.LOGIC, false, [
        'This is a code/application logic error',
        'Check the error stack trace for the source',
        'This type of error typically requires code fixes and will not retry successfully',
      ]);
    }

    if (this.matchPatterns(combined, this.resourcePatterns)) {
      return this.createCategorizedError(error, ErrorCategory.RESOURCE, true, [
        'System resources are constrained',
        'Check memory/disk usage',
        'Consider scaling up resources or reducing load',
      ]);
    }

    return this.createCategorizedError(error, ErrorCategory.UNKNOWN, true, [
      'Check logs for more details',
      'Try restarting the application',
      'Report issue if problem persists',
    ]);
  }

  private matchPatterns(text: string, patterns: RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(text));
  }

  private createCategorizedError(
    error: Error,
    category: ErrorCategory,
    retryable: boolean,
    troubleshooting: string[]
  ): CategorizedError {
    const categorizedError = error as CategorizedError;
    categorizedError.category = category;
    categorizedError.retryable = retryable;
    categorizedError.troubleshooting = troubleshooting;
    categorizedError.originalError = error;
    return categorizedError;
  }
}

export function categorizeError(error: Error): CategorizedError {
  const classifier = new ErrorClassifier();
  return classifier.categorize(error);
}

export function isRetryableError(error: Error): boolean {
  if ('retryable' in error && typeof (error as CategorizedError).retryable === 'boolean') {
    return (error as CategorizedError).retryable;
  }
  const categorized = categorizeError(error);
  return categorized.retryable;
}

export function formatErrorMessage(error: CategorizedError): string {
  const parts: string[] = [`[${error.category}] ${error.message}`];

  if (error.troubleshooting && error.troubleshooting.length > 0) {
    parts.push('\nTroubleshooting:');
    error.troubleshooting.forEach((hint, i) => {
      parts.push(`  ${i + 1}. ${hint}`);
    });
  }

  if (error.context && Object.keys(error.context).length > 0) {
    parts.push('\nContext:');
    for (const [key, value] of Object.entries(error.context)) {
      parts.push(`  ${key}: ${value}`);
    }
  }

  return parts.join('\n');
}
