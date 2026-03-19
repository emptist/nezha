// Input validation and sanitization utilities
/* eslint-disable no-control-regex */

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: string;
}

const MAX_TITLE_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_SEARCH_LENGTH = 1000;
const MAX_MEMORY_CONTENT = 50000;
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 50;

export function sanitizeTaskTitle(input: string | undefined): ValidationResult {
  if (!input || input.trim().length === 0) {
    return { valid: false, error: 'Title is required' };
  }

  if (input.length > MAX_TITLE_LENGTH) {
    return { valid: false, error: `Title must be less than ${MAX_TITLE_LENGTH} characters` };
  }

  // Remove null bytes and control characters
  const sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();

  return { valid: true, sanitized };
}

export function sanitizeTaskDescription(input: string | undefined): ValidationResult {
  if (!input) {
    return { valid: true, sanitized: '' };
  }

  if (input.length > MAX_DESCRIPTION_LENGTH) {
    return {
      valid: false,
      error: `Description must be less than ${MAX_DESCRIPTION_LENGTH} characters`,
    };
  }

  // Remove null bytes and control characters
  const sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();

  return { valid: true, sanitized };
}

export function sanitizeSearchQuery(input: string | undefined): ValidationResult {
  if (!input || input.trim().length === 0) {
    return { valid: false, error: 'Search query is required' };
  }

  if (input.length > MAX_SEARCH_LENGTH) {
    return {
      valid: false,
      error: `Search query must be less than ${MAX_SEARCH_LENGTH} characters`,
    };
  }

  // Escape LIKE wildcards to prevent injection
  const sanitized = input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[%_]/g, '\\$&')
    .trim();

  return { valid: true, sanitized };
}

export function sanitizeMemoryContent(input: string | undefined): ValidationResult {
  if (!input || input.trim().length === 0) {
    return { valid: false, error: 'Memory content is required' };
  }

  if (input.length > MAX_MEMORY_CONTENT) {
    return {
      valid: false,
      error: `Memory content must be less than ${MAX_MEMORY_CONTENT} characters`,
    };
  }

  // Remove null bytes and control characters (allow extended unicode)
  const sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();

  return { valid: true, sanitized };
}

export function sanitizeTags(input: string[] | undefined): ValidationResult {
  if (!input || input.length === 0) {
    return { valid: true, sanitized: '[]' };
  }

  if (input.length > MAX_TAGS) {
    return { valid: false, error: `Maximum ${MAX_TAGS} tags allowed` };
  }

  // Sanitize each tag - alphanumeric, hyphens, underscores only
  const sanitized = input
    .map(tag => tag.trim().replace(/[\x00-\x1F\x7F]/g, ''))
    .filter(tag => tag.length > 0 && tag.length <= MAX_TAG_LENGTH)
    .map(tag => tag.replace(/[^a-zA-Z0-9\-_]/g, ''))
    .slice(0, MAX_TAGS);

  return { valid: true, sanitized: JSON.stringify(sanitized) };
}

export function sanitizeUUID(input: string | undefined): ValidationResult {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!input) {
    return { valid: false, error: 'UUID is required' };
  }

  if (!uuidRegex.test(input)) {
    return { valid: false, error: 'Invalid UUID format' };
  }

  return { valid: true, sanitized: input.toLowerCase() };
}

export function sanitizePriority(input: number | string | undefined): ValidationResult {
  if (input === undefined || input === null || input === '') {
    return { valid: true, sanitized: '0' };
  }

  const num = typeof input === 'string' ? parseInt(input, 10) : input;

  if (isNaN(num)) {
    return { valid: false, error: 'Priority must be a number' };
  }

  if (num < 0 || num > 100) {
    return { valid: false, error: 'Priority must be between 0 and 100' };
  }

  return { valid: true, sanitized: String(num) };
}

export function sanitizeCronExpression(input: string | undefined): ValidationResult {
  if (!input || input.trim().length === 0) {
    return { valid: false, error: 'Cron expression is required' };
  }

  const parts = input.trim().split(/\s+/);
  if (parts.length !== 5) {
    return {
      valid: false,
      error: 'Cron expression must have 5 parts (minute hour day month weekday)',
    };
  }

  // Basic validation
  const patterns = [
    /^(\*|[0-9]|[1-5][0-9])(-(\*|[0-9]|[1-5][0-9]))?(\/(\d+))?$/, // minute
    /^(\*|[0-9]|1[0-9]|2[0-3])(-(\*|[0-9]|1[0-9]|2[0-3]))?(\/(\d+))?$/, // hour
    /^(\*|[1-9]|[12][0-9]|3[01])(-(\*|[1-9]|[12][0-9]|3[01]))?(\/(\d+))?$/, // day
    /^(\*|[1-9]|1[0-2])(-(\*|[1-9]|1[0-2]))?(\/(\d+))?$/, // month
    /^(\*|[0-6])(-(\*|[0-6]))?(\/(\d+))?$/, // weekday
  ];

  for (let i = 0; i < 5; i++) {
    const pattern = patterns[i];
    const part = parts[i];
    if (!pattern || !part || !pattern.test(part)) {
      return { valid: false, error: `Invalid cron part ${i + 1}: ${part}` };
    }
  }

  return { valid: true, sanitized: input.trim() };
}

export function sanitizeApiKey(input: string | undefined): ValidationResult {
  if (!input) {
    return { valid: false, error: 'API key is required' };
  }

  // Must be hex string of at least 32 characters
  if (!/^[a-f0-9]{32,}$/i.test(input)) {
    return { valid: false, error: 'Invalid API key format' };
  }

  return { valid: true, sanitized: input };
}

export function escapeHtml(input: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  return input.replace(/[&<>"'/]/g, char => htmlEntities[char] || char);
}

export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}
