import { TraeReflect } from '../TraeReflect.js';
import { describe, it, expect } from 'vitest';

describe('TraeReflect Parser', () => {
  const reflect = new TraeReflect();

  describe('parseLearnMarkers', () => {
    it('should parse a single LEARN marker', () => {
      const text = '[LEARN] insight: This is a test learning context: Some context';
      const markers = reflect.parseLearnMarkers(text);

      expect(markers).toHaveLength(1);
      expect(markers[0].insight).toBe('This is a test learning');
      expect(markers[0].context).toBe('Some context');
    });

    it('should parse LEARN marker without context', () => {
      const text = '[LEARN] insight: Simple learning';
      const markers = reflect.parseLearnMarkers(text);

      expect(markers).toHaveLength(1);
      expect(markers[0].insight).toBe('Simple learning');
      expect(markers[0].context).toBeUndefined();
    });

    it('should parse multiple LEARN markers', () => {
      const text = `
        [LEARN] insight: First learning context: Context 1
        [LEARN] insight: Second learning context: Context 2
      `;
      const markers = reflect.parseLearnMarkers(text);

      expect(markers).toHaveLength(2);
      expect(markers[0].insight).toBe('First learning');
      expect(markers[1].insight).toBe('Second learning');
    });

    it('should handle empty text', () => {
      const markers = reflect.parseLearnMarkers('');
      expect(markers).toHaveLength(0);
    });

    it('should handle text without markers', () => {
      const text = 'This is just regular text without any markers';
      const markers = reflect.parseLearnMarkers(text);
      expect(markers).toHaveLength(0);
    });
  });

  describe('parsePromptUpdateMarkers', () => {
    it('should parse a PROMPT_UPDATE marker', () => {
      const text =
        '[PROMPT_UPDATE] current: Old approach suggested: New approach reason: Better performance';
      const markers = reflect.parsePromptUpdateMarkers(text);

      expect(markers).toHaveLength(1);
      expect(markers[0].current).toBe('Old approach');
      expect(markers[0].suggested).toBe('New approach');
      expect(markers[0].reason).toBe('Better performance');
    });

    it('should parse multiple PROMPT_UPDATE markers', () => {
      const text = `
        [PROMPT_UPDATE] current: A suggested: B reason: C
        [PROMPT_UPDATE] current: D suggested: E reason: F
      `;
      const markers = reflect.parsePromptUpdateMarkers(text);

      expect(markers).toHaveLength(2);
      expect(markers[0].current).toBe('A');
      expect(markers[1].current).toBe('D');
    });

    it('should handle empty reason', () => {
      const text = '[PROMPT_UPDATE] current: Old suggested: New reason: ';
      const markers = reflect.parsePromptUpdateMarkers(text);

      expect(markers).toHaveLength(1);
      expect(markers[0].reason).toBe('');
    });
  });

  describe('parseIssueMarkers', () => {
    it('should parse a basic ISSUE marker', () => {
      const text = '[ISSUE] title: Bug found type: bug severity: high';
      const markers = reflect.parseIssueMarkers(text);

      expect(markers).toHaveLength(1);
      expect(markers[0].title).toBe('Bug found');
      expect(markers[0].type).toBe('bug');
      expect(markers[0].severity).toBe('high');
    });

    it('should parse ISSUE marker with description', () => {
      const text =
        '[ISSUE] title: Bug title description: This is a bug description type: bug severity: medium';
      const markers = reflect.parseIssueMarkers(text);

      expect(markers).toHaveLength(1);
      expect(markers[0].title).toBe('Bug title');
      expect(markers[0].description).toBe('This is a bug description');
    });

    it('should parse ISSUE marker with tags', () => {
      const text =
        '[ISSUE] title: Issue with tags type: improvement severity: low tags: ui, ux, frontend';
      const markers = reflect.parseIssueMarkers(text);

      expect(markers).toHaveLength(1);
      expect(markers[0].tags).toEqual(['ui', 'ux', 'frontend']);
    });

    it('should use defaults for missing optional fields', () => {
      const text = '[ISSUE] title: Minimal issue';
      const markers = reflect.parseIssueMarkers(text);

      expect(markers).toHaveLength(1);
      expect(markers[0].title).toBe('Minimal issue');
      expect(markers[0].type).toBe('bug');
      expect(markers[0].severity).toBe('medium');
      expect(markers[0].tags).toEqual([]);
    });
  });

  describe('parseReviewResponseMarkers', () => {
    it('should parse a basic REVIEW_RESPONSE marker', () => {
      const text =
        '[REVIEW_RESPONSE] reviewId: 550e8400-e29b-41d4-a716-446655440000 response: Looks good';
      const markers = reflect.parseReviewResponseMarkers(text);

      expect(markers).toHaveLength(1);
      expect(markers[0].reviewId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(markers[0].response).toBe('Looks good');
      expect(markers[0].acceptedSuggestions).toEqual([]);
    });

    it('should parse REVIEW_RESPONSE marker with accepted suggestions', () => {
      const text =
        '[REVIEW_RESPONSE] reviewId: 550e8400-e29b-41d4-a716-446655440000 response: Fixed all issues accepted: suggestion1, suggestion2';
      const markers = reflect.parseReviewResponseMarkers(text);

      expect(markers).toHaveLength(1);
      expect(markers[0].reviewId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(markers[0].response).toBe('Fixed all issues');
      expect(markers[0].acceptedSuggestions).toEqual(['suggestion1', 'suggestion2']);
    });

    it('should parse multiple REVIEW_RESPONSE markers', () => {
      const text = `
        [REVIEW_RESPONSE] reviewId: 550e8400-e29b-41d4-a716-446655440000 response: First response
        [REVIEW_RESPONSE] reviewId: 550e8400-e29b-41d4-a716-446655440001 response: Second response
      `;
      const markers = reflect.parseReviewResponseMarkers(text);

      expect(markers).toHaveLength(2);
      expect(markers[0].reviewId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(markers[1].reviewId).toBe('550e8400-e29b-41d4-a716-446655440001');
    });

    it('should handle empty text', () => {
      const markers = reflect.parseReviewResponseMarkers('');
      expect(markers).toHaveLength(0);
    });

    it('should handle text without REVIEW_RESPONSE markers', () => {
      const text = 'This is just regular text without any markers';
      const markers = reflect.parseReviewResponseMarkers(text);
      expect(markers).toHaveLength(0);
    });

    it('should handle REVIEW_RESPONSE without accepted field', () => {
      const text =
        '[REVIEW_RESPONSE] reviewId: 550e8400-e29b-41d4-a716-446655440000 response: Accepted';
      const markers = reflect.parseReviewResponseMarkers(text);

      expect(markers).toHaveLength(1);
      expect(markers[0].acceptedSuggestions).toEqual([]);
    });
  });

  describe('Combined markers', () => {
    it('should parse mixed markers in one text', () => {
      const text = `
        [LEARN] insight: Learned something new context: Testing
        [PROMPT_UPDATE] current: Old suggested: New reason: Better
        [ISSUE] title: Found a bug type: bug severity: high
        [REVIEW_RESPONSE] reviewId: 550e8400-e29b-41d4-a716-446655440000 response: Fixed
      `;

      const learnMarkers = reflect.parseLearnMarkers(text);
      const promptMarkers = reflect.parsePromptUpdateMarkers(text);
      const issueMarkers = reflect.parseIssueMarkers(text);
      const reviewMarkers = reflect.parseReviewResponseMarkers(text);

      expect(learnMarkers).toHaveLength(1);
      expect(promptMarkers).toHaveLength(1);
      expect(issueMarkers).toHaveLength(1);
      expect(reviewMarkers).toHaveLength(1);
    });

    it('should handle real-world reflection text', () => {
      const text = `
        [LEARN] insight: Reflection system has 3 markers for knowledge persistence
        context: Read docs/REFLECTION_SYSTEM.md
        [ISSUE] title: Missing tests for parser type: test severity: medium
      `;

      const learnMarkers = reflect.parseLearnMarkers(text);
      const issueMarkers = reflect.parseIssueMarkers(text);

      expect(learnMarkers).toHaveLength(1);
      expect(learnMarkers[0].insight).toContain('Reflection system');
      expect(issueMarkers).toHaveLength(1);
    });
  });
});
