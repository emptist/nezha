import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../core/EventBus.js';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  it('should create an instance', () => {
    expect(eventBus).toBeDefined();
  });

  it('should subscribe to an event', () => {
    const handler = vi.fn();
    eventBus.subscribe('test-event', handler);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should publish event and call handler', () => {
    const handler = vi.fn();
    eventBus.subscribe('test-event', handler);
    eventBus.publish('test-event', { foo: 'bar' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ foo: 'bar' });
  });

  it('should pass multiple handlers for same event', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    eventBus.subscribe('test-event', handler1);
    eventBus.subscribe('test-event', handler2);
    eventBus.publish('test-event', 'data');
    expect(handler1).toHaveBeenCalledWith('data');
    expect(handler2).toHaveBeenCalledWith('data');
  });

  it('should unsubscribe a handler', () => {
    const handler = vi.fn();
    eventBus.subscribe('test-event', handler);
    eventBus.unsubscribe('test-event', handler);
    eventBus.publish('test-event', 'data');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle publishing to non-subscribed event', () => {
    const handler = vi.fn();
    eventBus.subscribe('test-event', handler);
    eventBus.publish('other-event', 'data');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should clear all handlers', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    eventBus.subscribe('event1', handler1);
    eventBus.subscribe('event2', handler2);
    eventBus.clear();
    eventBus.publish('event1', 'data');
    eventBus.publish('event2', 'data');
    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });

  it('should pass undefined data', () => {
    const handler = vi.fn();
    eventBus.subscribe('test-event', handler);
    eventBus.publish('test-event', undefined);
    expect(handler).toHaveBeenCalledWith(undefined);
  });

  it('should pass null data', () => {
    const handler = vi.fn();
    eventBus.subscribe('test-event', handler);
    eventBus.publish('test-event', null);
    expect(handler).toHaveBeenCalledWith(null);
  });

  it('should pass complex object data', () => {
    const handler = vi.fn();
    const complexData = {
      nested: { deep: { value: 42 } },
      array: [1, 2, 3],
      string: 'hello',
    };
    eventBus.subscribe('test-event', handler);
    eventBus.publish('test-event', complexData);
    expect(handler).toHaveBeenCalledWith(complexData);
  });

  it('should allow multiple unsubscribes without error', () => {
    const handler = vi.fn();
    eventBus.subscribe('test-event', handler);
    eventBus.unsubscribe('test-event', handler);
    eventBus.unsubscribe('test-event', handler);
    eventBus.publish('test-event', 'data');
    expect(handler).not.toHaveBeenCalled();
  });
});
