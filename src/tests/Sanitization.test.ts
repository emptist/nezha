import { describe, it, expect } from 'vitest';
import {
  sanitizeTaskTitle,
  sanitizeTaskDescription,
  sanitizeSearchQuery,
  sanitizeMemoryContent,
  sanitizeTags,
  sanitizeUUID,
  sanitizePriority,
  sanitizeCronExpression,
  sanitizeApiKey,
  escapeHtml,
  stripHtml,
} from '../utils/sanitization.js';

describe('Sanitization Utils', () => {
  describe('sanitizeTaskTitle', () => {
    it('should reject empty title', () => {
      expect(sanitizeTaskTitle('')).toEqual({ valid: false, error: 'Title is required' });
      expect(sanitizeTaskTitle(undefined)).toEqual({ valid: false, error: 'Title is required' });
      expect(sanitizeTaskTitle('   ')).toEqual({ valid: false, error: 'Title is required' });
    });

    it('should reject title exceeding max length', () => {
      const longTitle = 'a'.repeat(501);
      const result = sanitizeTaskTitle(longTitle);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('500');
    });

    it('should accept valid title', () => {
      const result = sanitizeTaskTitle('Valid Task Title');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('Valid Task Title');
    });

    it('should trim whitespace', () => {
      const result = sanitizeTaskTitle('  Title  ');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('Title');
    });

    it('should remove control characters', () => {
      const result = sanitizeTaskTitle('Title\x00with\x07control\x1Fchars');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('Titlewithcontrolchars');
    });

    it('should handle title at max length', () => {
      const maxTitle = 'a'.repeat(500);
      const result = sanitizeTaskTitle(maxTitle);
      expect(result.valid).toBe(true);
    });
  });

  describe('sanitizeTaskDescription', () => {
    it('should accept undefined/empty description', () => {
      expect(sanitizeTaskDescription(undefined)).toEqual({ valid: true, sanitized: '' });
      expect(sanitizeTaskDescription('')).toEqual({ valid: true, sanitized: '' });
    });

    it('should reject description exceeding max length', () => {
      const longDesc = 'a'.repeat(5001);
      const result = sanitizeTaskDescription(longDesc);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('5000');
    });

    it('should accept valid description', () => {
      const result = sanitizeTaskDescription('Valid description');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('Valid description');
    });

    it('should trim and remove control chars', () => {
      const result = sanitizeTaskDescription('  Desc\x00rip\x07tion  ');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('Description');
    });
  });

  describe('sanitizeSearchQuery', () => {
    it('should reject empty query', () => {
      expect(sanitizeSearchQuery('')).toEqual({ valid: false, error: 'Search query is required' });
      expect(sanitizeSearchQuery(undefined)).toEqual({ valid: false, error: 'Search query is required' });
    });

    it('should reject query exceeding max length', () => {
      const longQuery = 'a'.repeat(1001);
      const result = sanitizeSearchQuery(longQuery);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('1000');
    });

    it('should escape LIKE wildcards', () => {
      const result = sanitizeSearchQuery('test%_query');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toContain('\\%');
      expect(result.sanitized).toContain('\\_');
    });

    it('should accept valid query', () => {
      const result = sanitizeSearchQuery('valid search query');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('valid search query');
    });

    it('should trim and remove control chars', () => {
      const result = sanitizeSearchQuery('  query\x00  ');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('query');
    });
  });

  describe('sanitizeMemoryContent', () => {
    it('should reject empty content', () => {
      expect(sanitizeMemoryContent('')).toEqual({ valid: false, error: 'Memory content is required' });
      expect(sanitizeMemoryContent(undefined)).toEqual({ valid: false, error: 'Memory content is required' });
      expect(sanitizeMemoryContent('   ')).toEqual({ valid: false, error: 'Memory content is required' });
    });

    it('should reject content exceeding max length', () => {
      const longContent = 'a'.repeat(50001);
      const result = sanitizeMemoryContent(longContent);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('50000');
    });

    it('should accept valid content', () => {
      const result = sanitizeMemoryContent('Valid memory content');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('Valid memory content');
    });

    it('should allow extended unicode', () => {
      const result = sanitizeMemoryContent('Unicode: 你好 🌍 ©');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('Unicode: 你好 🌍 ©');
    });

    it('should remove control characters but not extended chars', () => {
      const result = sanitizeMemoryContent('Content\x00with\x7Fcontrols');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('Contentwithcontrols');
    });
  });

  describe('sanitizeTags', () => {
    it('should accept empty/undefined tags', () => {
      expect(sanitizeTags(undefined)).toEqual({ valid: true, sanitized: '[]' });
      expect(sanitizeTags([])).toEqual({ valid: true, sanitized: '[]' });
    });

    it('should reject too many tags', () => {
      const tags = Array(11).fill('tag');
      const result = sanitizeTags(tags);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('10');
    });

    it('should filter invalid tags', () => {
      const result = sanitizeTags(['valid-tag', '', '   ', 'tag!@#']);
      expect(result.valid).toBe(true);
      const parsed = JSON.parse(result.sanitized!);
      expect(parsed).toContain('valid-tag');
      expect(parsed).toContain('tag');
      expect(parsed).not.toContain('');
      expect(parsed).not.toContain('tag!@#');
    });

    it('should trim tags', () => {
      const result = sanitizeTags(['  tag1  ', ' tag2']);
      expect(result.valid).toBe(true);
      const parsed = JSON.parse(result.sanitized!);
      expect(parsed).toEqual(['tag1', 'tag2']);
    });

    it('should filter tags exceeding max length', () => {
      const result = sanitizeTags(['short', 'a'.repeat(51)]);
      expect(result.valid).toBe(true);
      const parsed = JSON.parse(result.sanitized!);
      expect(parsed).toEqual(['short']);
    });

    it('should limit to max tags', () => {
      const tags = Array(15).fill('tag');
      const result = sanitizeTags(tags);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('10');
    });
  });

  describe('sanitizeUUID', () => {
    it('should reject invalid UUID', () => {
      expect(sanitizeUUID('')).toEqual({ valid: false, error: 'UUID is required' });
      expect(sanitizeUUID(undefined)).toEqual({ valid: false, error: 'UUID is required' });
      expect(sanitizeUUID('invalid')).toEqual({ valid: false, error: 'Invalid UUID format' });
      expect(sanitizeUUID('12345678-1234-1234-1234-123456789012x')).toEqual({ valid: false, error: 'Invalid UUID format' });
    });

    it('should accept valid UUID', () => {
      const result = sanitizeUUID('12345678-1234-1234-1234-123456789012');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('12345678-1234-1234-1234-123456789012');
    });

    it('should lowercase uppercase UUID', () => {
      const result = sanitizeUUID('ABCD1234-1234-1234-1234-123456789012');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('abcd1234-1234-1234-1234-123456789012');
    });
  });

  describe('sanitizePriority', () => {
    it('should accept undefined/null/empty as default 0', () => {
      expect(sanitizePriority(undefined)).toEqual({ valid: true, sanitized: '0' });
      expect(sanitizePriority(null as any)).toEqual({ valid: true, sanitized: '0' });
      expect(sanitizePriority('')).toEqual({ valid: true, sanitized: '0' });
    });

    it('should accept number priority', () => {
      expect(sanitizePriority(50)).toEqual({ valid: true, sanitized: '50' });
      expect(sanitizePriority(0)).toEqual({ valid: true, sanitized: '0' });
      expect(sanitizePriority(100)).toEqual({ valid: true, sanitized: '100' });
    });

    it('should parse string priority', () => {
      expect(sanitizePriority('75')).toEqual({ valid: true, sanitized: '75' });
    });

    it('should reject non-numeric string', () => {
      const result = sanitizePriority('abc');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Priority must be a number');
    });

    it('should reject priority out of range', () => {
      expect(sanitizePriority(-1)).toEqual({ valid: false, error: 'Priority must be between 0 and 100' });
      expect(sanitizePriority(101)).toEqual({ valid: false, error: 'Priority must be between 0 and 100' });
    });
  });

  describe('sanitizeCronExpression', () => {
    it('should reject empty expression', () => {
      expect(sanitizeCronExpression('')).toEqual({ valid: false, error: 'Cron expression is required' });
      expect(sanitizeCronExpression(undefined)).toEqual({ valid: false, error: 'Cron expression is required' });
    });

    it('should reject wrong number of parts', () => {
      expect(sanitizeCronExpression('* * *')).toEqual({ valid: false, error: 'Cron expression must have 5 parts (minute hour day month weekday)' });
      expect(sanitizeCronExpression('* * * * * *')).toEqual({ valid: false, error: 'Cron expression must have 5 parts (minute hour day month weekday)' });
    });

    it('should accept valid cron expression', () => {
      expect(sanitizeCronExpression('* * * * *')).toEqual({ valid: true, sanitized: '* * * * *' });
      expect(sanitizeCronExpression('0 * * * *')).toEqual({ valid: true, sanitized: '0 * * * *' });
      expect(sanitizeCronExpression('0 0 * * *')).toEqual({ valid: true, sanitized: '0 0 * * *' });
      expect(sanitizeCronExpression('*/5 * * * *')).toEqual({ valid: true, sanitized: '*/5 * * * *' });
      expect(sanitizeCronExpression('0-30 */2 1-15 1-6 1-5')).toEqual({ valid: true, sanitized: '0-30 */2 1-15 1-6 1-5' });
    });

    it('should reject invalid minute part', () => {
      const result = sanitizeCronExpression('60 * * * *');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid cron part 1');
    });

    it('should reject invalid hour part', () => {
      const result = sanitizeCronExpression('* 25 * * *');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid cron part 2');
    });

    it('should reject invalid day part', () => {
      const result = sanitizeCronExpression('* * 32 * *');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid cron part 3');
    });

    it('should reject invalid month part', () => {
      const result = sanitizeCronExpression('* * * 13 *');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid cron part 4');
    });

    it('should reject invalid weekday part', () => {
      const result = sanitizeCronExpression('* * * * 7');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid cron part 5');
    });

    it('should trim whitespace', () => {
      const result = sanitizeCronExpression('  * * * * *  ');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('* * * * *');
    });
  });

  describe('sanitizeApiKey', () => {
    it('should reject empty API key', () => {
      expect(sanitizeApiKey('')).toEqual({ valid: false, error: 'API key is required' });
      expect(sanitizeApiKey(undefined)).toEqual({ valid: false, error: 'API key is required' });
    });

    it('should reject short API key', () => {
      const result = sanitizeApiKey('abc123');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid API key format');
    });

    it('should accept valid API key', () => {
      const result = sanitizeApiKey('a'.repeat(32));
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('a'.repeat(32));
    });

    it('should accept uppercase hex', () => {
      const result = sanitizeApiKey('ABCDEF1234567890ABCDEF1234567890');
      expect(result.valid).toBe(true);
    });

    it('should accept mixed case hex', () => {
      const result = sanitizeApiKey('AbCdEf1234567890AbCdEf1234567890');
      expect(result.valid).toBe(true);
    });

    it('should reject non-hex characters', () => {
      const result = sanitizeApiKey('g'.repeat(32));
      expect(result.valid).toBe(false);
    });
  });

  describe('escapeHtml', () => {
    it('should escape HTML entities', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
      expect(escapeHtml('&test')).toBe('&amp;test');
      expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
      expect(escapeHtml("'single'")).toBe('&#x27;single&#x27;');
      expect(escapeHtml('/slash/')).toBe('&#x2F;slash&#x2F;');
    });

    it('should pass through plain text', () => {
      expect(escapeHtml('plain text')).toBe('plain text');
    });

    it('should handle mixed content', () => {
      expect(escapeHtml('<div class="test">&copy;</div>')).toBe(
        '&lt;div class=&quot;test&quot;&gt;&amp;copy;&lt;&#x2F;div&gt;'
      );
    });
  });

  describe('stripHtml', () => {
    it('should remove HTML tags', () => {
      expect(stripHtml('<p>text</p>')).toBe('text');
      expect(stripHtml('<div><span>nested</span></div>')).toBe('nested');
      expect(stripHtml('<script>alert(1)</script>')).toBe('alert(1)');
    });

    it('should handle self-closing tags', () => {
      expect(stripHtml('text<br/>more')).toBe('textmore');
      expect(stripHtml('text<hr>more')).toBe('textmore');
    });

    it('should pass through plain text', () => {
      expect(stripHtml('plain text')).toBe('plain text');
    });

    it('should handle edge cases', () => {
      expect(stripHtml('<></>')).toBe('');
      expect(stripHtml('')).toBe('');
      expect(stripHtml('no tags here')).toBe('no tags here');
    });
  });
});
