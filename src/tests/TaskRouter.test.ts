import { describe, it, expect } from 'vitest';
import { TaskRouter } from '../piano/router/TaskRouter.js';

describe('TaskRouter', () => {
  it('should route high priority to opencode', () => {
    const router = new TaskRouter({ useOpenCode: true, usePi: true });
    const result = router.route('simple task', 'desc', 50);
    expect(result).toBe('opencode');
  });

  it('should route simple reminder to pi when enabled', () => {
    const router = new TaskRouter({ useOpenCode: true, usePi: true });
    const result = router.route('check logs', 'remind me to check');
    expect(result).toBe('pi');
  });

  it('should route planning tasks to pi when enabled', () => {
    const router = new TaskRouter({ useOpenCode: true, usePi: true });
    const result = router.route('plan the project', 'arrange tasks');
    expect(result).toBe('pi');
  });

  it('should route to opencode by default when enabled', () => {
    const router = new TaskRouter({ useOpenCode: true, usePi: false });
    const result = router.route('implement feature', 'complex task');
    expect(result).toBe('opencode');
  });

  it('should route to internal when all disabled', () => {
    const router = new TaskRouter({ useOpenCode: false, usePi: false });
    const result = router.route('any task');
    expect(result).toBe('internal');
  });

  it('should route simple tasks to pi when opencode disabled', () => {
    const router = new TaskRouter({ useOpenCode: false, usePi: true });
    const result = router.route('remind me something');
    expect(result).toBe('pi');
  });
});
