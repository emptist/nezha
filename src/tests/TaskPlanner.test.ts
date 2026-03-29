import { describe, it, expect } from 'vitest';
import { TaskPlanner } from '../piano/planner/TaskPlanner.js';

describe('TaskPlanner', () => {
  const planner = new TaskPlanner();

  it('should create a simple plan for basic task', () => {
    const task = { id: '1', title: 'Check logs', priority: 5 };
    const plan = planner.plan(task);

    expect(plan.subtasks).toHaveLength(1);
    expect(plan.subtasks[0].title).toContain('执行');
    expect(plan.estimatedDuration).toBe(15);
  });

  it('should decompose create task into analysis and implementation', () => {
    const task = { id: '2', title: 'Create user API', priority: 8 };
    const plan = planner.plan(task);

    expect(plan.subtasks.length).toBeGreaterThanOrEqual(2);
    expect(plan.subtasks.some(st => st.title.includes('分析'))).toBe(true);
  });

  it('should add database subtask for database tasks', () => {
    const task = { id: '3', title: 'Create database migration', priority: 7 };
    const plan = planner.plan(task);

    expect(plan.subtasks.some(st => st.title.includes('设计'))).toBe(true);
  });

  it('should estimate duration based on subtask count', () => {
    const task = { id: '4', title: 'Implement complex feature with API and tests', priority: 9 };
    const plan = planner.plan(task);

    expect(plan.estimatedDuration).toBeGreaterThan(15);
  });

  it('should return true for parallelization when no dependencies', () => {
    const subtasks = [
      { title: 'Task A', description: 'desc', priority: 5 },
      { title: 'Task B', description: 'desc', priority: 5 },
    ];

    expect(planner.shouldParallelize(subtasks)).toBe(true);
  });

  it('should return false for parallelization when dependencies exist', () => {
    const subtasks = [
      { title: 'Task A', description: 'desc', priority: 5 },
      { title: 'Task B', description: 'desc', priority: 5, dependsOn: ['Task A'] },
    ];

    expect(planner.shouldParallelize(subtasks)).toBe(false);
  });
});
